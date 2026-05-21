"""Typed tenant context for the analysis engine.

This is the Python parity of packages/core/src/tenancy/context.ts (PR3)
and packages/core/src/tenancy/require.ts. The two runtimes deliberately
mirror each other so a value flowing across the web → engine boundary
can be reasoned about with the same vocabulary on both sides.

What this carries:
    tenant_id:         UUID string. The RLS GUC value.
    practitioner_id:   UUID string or None. None for system jobs (e.g.
                       background extraction tasks scheduled before a
                       practitioner identity is known).
    role:              owner / practitioner / viewer. Mirrors the
                       practitioners.role column.
    job_id:            request-scoped correlation id (mirrors web's
                       sessionId; for engine batch jobs this is the
                       background-task id or script run id).
    lifecycle_status:  pending_baa / active / suspended / terminated.
                       Same enum the web tier reads from tenants.

What this does NOT do:
    - It does NOT set the Postgres GUC. That's tenant_conn() in
      app._core.db. Holding a context is "permission to ask"; running
      a query is still an explicit step.
    - It does NOT validate cryptographic origin. PR5 introduces the
      JWT-verified construction path; until then engine endpoints build
      contexts from trusted-by-network request bodies, same as before.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from .errors import TenantInactiveError

_ACTIVE_STATUS: Final[str] = "active"


@dataclass(frozen=True, slots=True)
class TenantContext:
    """Immutable tenant handle. Frozen so callers cannot mutate fields
    mid-request — important when the same ctx flows through several
    DB helpers."""

    tenant_id: str
    practitioner_id: str | None
    role: str
    job_id: str
    lifecycle_status: str


def require_active_tenant(ctx: TenantContext) -> TenantContext:
    """Gate that any "act on PHI" code path should run before mutating.

    Pass-through return value so the gate composes inline with the
    db helpers (`tenant_conn(require_active_tenant(ctx))`) instead of
    being a void check the call site might forget to wire up.

    Read-only paths (search, list, fetch) intentionally skip this gate
    — practitioners on a suspended tenant can still inspect their own
    data; they just can't write.
    """
    if ctx.lifecycle_status != _ACTIVE_STATUS:
        raise TenantInactiveError(ctx.tenant_id, ctx.lifecycle_status)
    return ctx
