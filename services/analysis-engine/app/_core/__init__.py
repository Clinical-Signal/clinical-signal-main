"""Engine-internal foundation: typed tenant context, RLS-scoped DB
helpers, and shared error types.

Mirrors the TypeScript packages in packages/core + packages/db that the
web tier consumes (PR3). Both runtimes now share the same invariant:
every PHI access takes a typed TenantContext, and the small set of
auth-spanning queries explicitly opts into the no-RLS escape hatch.

Public surface:
    TenantContext          — typed tenant handle (from .tenancy)
    require_active_tenant  — lifecycle gate (from .tenancy)
    tenant_conn            — RLS-scoped psycopg connection (from .db)
    system_conn            — explicit no-RLS escape hatch (from .db)
    TenantInactiveError    — raised by require_active_tenant
    SystemAccessError      — raised inside system_conn on misuse

Importers should reach for these via `app._core` (the package) rather
than the submodules directly so the public surface stays cohesive.
"""

from ._core_exports import (
    TenantContext,
    TenantInactiveError,
    TenantContextMissingError,
    SystemAccessError,
    require_active_tenant,
    tenant_conn,
    system_conn,
    set_tenant_guc,
    require_engine_jwt,
    EngineAuthMisconfigured,
)

__all__ = [
    "TenantContext",
    "TenantInactiveError",
    "TenantContextMissingError",
    "SystemAccessError",
    "require_active_tenant",
    "tenant_conn",
    "system_conn",
    "set_tenant_guc",
    "require_engine_jwt",
    "EngineAuthMisconfigured",
]
