"""Records-pipeline DB writes (mark processing / complete / failed).

After PR4 this module is a thin wrapper over app._core.db: the actual
RLS-scoped connection helper lives there, and every public function
takes a typed TenantContext instead of a bare tenant_id string.

A back-compat shim re-exports `tenant_conn` so the small set of
historical callers that pass a `tenant_id: str` keep working until
they're migrated. New code MUST use TenantContext.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Iterator

import psycopg

from app._core import TenantContext
from app._core import tenant_conn as _ctx_tenant_conn


@contextmanager
def tenant_conn(
    ctx_or_tenant_id: TenantContext | str,
) -> Iterator[psycopg.Connection]:
    """Open an RLS-scoped psycopg connection.

    Preferred form: pass a TenantContext.
    Back-compat form: pass a tenant_id string; this builds a minimal
    TenantContext under the hood. The string form is deprecated and
    will be removed once the call-site sweep is complete (tracked in
    follow-up PR after #225).
    """
    if isinstance(ctx_or_tenant_id, TenantContext):
        ctx = ctx_or_tenant_id
    else:
        # Deprecated path. Mirror the historical behavior exactly:
        # set the GUC, no lifecycle gate, no practitioner identity.
        ctx = TenantContext(
            tenant_id=ctx_or_tenant_id,
            practitioner_id=None,
            role="system",
            job_id="legacy_tenant_conn_string",
            lifecycle_status="active",
        )
    with _ctx_tenant_conn(ctx) as conn:
        yield conn


def mark_processing(ctx: TenantContext, record_id: str) -> None:
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE records SET processing_status = 'processing' WHERE id = %s",
            (record_id,),
        )


def mark_complete(
    ctx: TenantContext,
    record_id: str,
    extracted_text: str,
    structured_data: dict,
    meta: dict,
    phi_key: str,
) -> None:
    # Encrypt the extracted text using pgcrypto so the plaintext never
    # lands on disk. The key is supplied per query and discarded after.
    enriched = dict(structured_data)
    enriched.setdefault("_extraction", {}).update(meta)
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE records
               SET extracted_text_encrypted = pgp_sym_encrypt(%s, %s),
                   structured_data = %s::jsonb,
                   processing_status = 'complete',
                   processing_error = NULL
             WHERE id = %s
            """,
            (extracted_text, phi_key, json.dumps(enriched), record_id),
        )


def mark_failed(ctx: TenantContext, record_id: str, error: str) -> None:
    with tenant_conn(ctx) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE records
               SET processing_status = 'failed',
                   processing_error = %s
             WHERE id = %s
            """,
            (error[:2000], record_id),
        )
