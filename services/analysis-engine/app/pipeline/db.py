"""Small psycopg wrapper for the records pipeline. The engine connects as
`app_user` and sets `app.current_tenant_id` per request so RLS applies."""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Iterator

import psycopg


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return dsn


@contextmanager
def tenant_conn(tenant_id: str) -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(_dsn(), autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.current_tenant_id', %s, false)", (tenant_id,))
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def mark_processing(tenant_id: str, record_id: str) -> None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE records SET processing_status = 'processing' WHERE id = %s",
            (record_id,),
        )


def mark_complete(
    tenant_id: str,
    record_id: str,
    extracted_text: str,
    structured_data: dict,
    meta: dict,
    phi_key: str,
) -> None:
    # Encrypt the extracted text using pgcrypto so the plaintext never lands
    # on disk. The key is supplied per query and discarded after.
    enriched = dict(structured_data)
    enriched.setdefault("_extraction", {}).update(meta)
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
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


def mark_failed(tenant_id: str, record_id: str, error: str) -> None:
    with tenant_conn(tenant_id) as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE records
               SET processing_status = 'failed',
                   processing_error = %s
             WHERE id = %s
            """,
            (error[:2000], record_id),
        )
