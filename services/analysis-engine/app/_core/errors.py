"""Typed error classes for the analysis engine.

Mirrors packages/core/src/errors/index.ts on the TS side. Callers
classify by `isinstance(...)` instead of parsing messages.
"""
from __future__ import annotations


class TenantInactiveError(Exception):
    """Raised by require_active_tenant when ctx.lifecycle_status != 'active'.

    Exists alongside the route-layer's HTTPException so business code
    can raise this without depending on FastAPI; the route boundary
    catches it and turns it into a 403.
    """

    code = "tenant_inactive"

    def __init__(self, tenant_id: str, lifecycle_status: str) -> None:
        self.tenant_id = tenant_id
        self.lifecycle_status = lifecycle_status
        super().__init__(
            f"Tenant {tenant_id} is not active "
            f"(status={lifecycle_status}). Complete BAA / lift "
            f"suspension before performing this action."
        )


class TenantContextMissingError(Exception):
    """Raised by tenant_conn when called without a usable TenantContext.

    Indicates a programming error (missing dependency wiring) — the
    engine never asks for a tenant connection without a context.
    """

    code = "tenant_context_missing"

    def __init__(self, operation: str) -> None:
        super().__init__(
            f"{operation} requires a TenantContext but none was "
            f"provided. Did you forget to thread ctx through the "
            f"call chain?"
        )


class SystemAccessError(Exception):
    """Raised by system_conn callers that violate its contract.

    The escape hatch is small and rare; this exists so misuse fails
    loudly during development instead of silently bypassing RLS.
    """

    code = "system_access_denied"

    def __init__(self, reason: str) -> None:
        super().__init__(
            f"Refused to open a system-level (no-RLS) connection: {reason}"
        )
