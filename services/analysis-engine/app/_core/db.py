"""RLS-scoped psycopg helpers for the analysis engine.

Python parity of packages/db/src/withTenantContext.ts +
packages/db/src/withSystem.ts. Two helpers, two purposes:

    tenant_conn(ctx)
        Opens a psycopg connection, sets app.current_tenant_id from
        ctx.tenant_id inside an explicit transaction, yields the
        connection. Any PHI access goes through this path. On error
        the connection is closed (not pooled — psycopg's default
        connection pattern doesn't pool by itself), so no GUC residue
        can leak into a future caller.

    system_conn(reason)
        Explicit no-RLS escape hatch for the small set of cross-tenant
        infrastructure tables (tenants, schema_migrations, batch
        scripts iterating all tenants). The `reason` parameter is
        required so reviewers and incident audits can answer "why
        didn't this go through RLS?" without re-reading the code.
        The CI grep gate (services/analysis-engine/scripts/check_system_access.py)
        forbids set_config('app.current_tenant_id' outside this module.

Both helpers:
    - Connect with autocommit=False so set_config(... 'false') sticks
      for the connection's lifetime (we use the long-lived form, not
      transaction-local, since psycopg doesn't have a per-statement
      transactional GUC equivalent that survives autocommit toggles).
    - Commit on clean exit, rollback + raise on exception.
    - Close the connection in finally — psycopg connections aren't
      pooled by us, so close-on-exit is the safe default.

The historical tenant_conn(tenant_id: str) form lives at
app.pipeline.db for back-compat while individual call sites migrate
to the typed form. New code MUST take a TenantContext.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg

from .errors import SystemAccessError, TenantContextMissingError
from .tenancy import TenantContext


def _dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return dsn


def set_tenant_guc(conn: psycopg.Connection, ctx: TenantContext) -> None:
    """Set app.current_tenant_id on an already-open connection so RLS
    authorizes subsequent queries.

    Most code should prefer ``tenant_conn(ctx)`` which manages the
    connection lifecycle and the GUC together. This helper exists for
    batch scripts that have their own connection management
    (e.g., long-lived autocommit connections processing many tenants
    in sequence) and can't easily wrap each tenant's work in
    ``tenant_conn``. Centralizing the ``set_config('app.current_tenant_id', ...)``
    call here means the CI grep gate can keep that string single-sourced
    in this module while still allowing scripts to opt in.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT set_config('app.current_tenant_id', %s, false)",
            (ctx.tenant_id,),
        )


@contextmanager
def tenant_conn(ctx: TenantContext) -> Iterator[psycopg.Connection]:
    """Open a psycopg connection with app.current_tenant_id set from
    ctx.tenant_id so RLS policies authorize every row.

    Use this for any query that touches a PHI-bearing table. Read paths
    that legitimately operate on a non-active tenant (e.g., listing
    a suspended practitioner's own historical data) skip
    require_active_tenant; mutating paths must call it before this.
    """
    if ctx is None or not ctx.tenant_id:
        raise TenantContextMissingError("tenant_conn")

    conn = psycopg.connect(_dsn(), autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                (ctx.tenant_id,),
            )
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def system_conn(reason: str) -> Iterator[psycopg.Connection]:
    """Open a psycopg connection with NO tenant GUC set.

    Use ONLY for cross-tenant infrastructure tables that are
    tenant-spanning by design:
        - tenants               (admin / batch listings of all tenants)
        - schema_migrations     (deploy-time tooling)
        - knowledge_sources during global-corpus ingest scripts that
          iterate every tenant in one process

    Every other table MUST go through tenant_conn(ctx). The CI grep
    gate fails the build if set_config('app.current_tenant_id' appears
    outside this module.

    Defensively clears the tenant GUC on the borrowed connection to
    eliminate any chance of residue from a previous psycopg pool
    integration that might be added later.
    """
    if not reason or not reason.strip():
        raise SystemAccessError("system_conn requires a non-empty reason")

    conn = psycopg.connect(_dsn(), autocommit=False)
    try:
        with conn.cursor() as cur:
            # Belt + suspenders: ensure no GUC residue. set_config with
            # is_local=false persists for the connection's lifetime;
            # writing '' explicitly resets it.
            cur.execute(
                "SELECT set_config('app.current_tenant_id', '', false)",
            )
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
