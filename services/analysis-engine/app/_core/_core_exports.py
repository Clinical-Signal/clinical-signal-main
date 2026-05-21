"""Re-export aggregator. The submodule split (tenancy / db / errors)
keeps responsibilities clear; this file lets callers do
`from app._core import TenantContext, tenant_conn, ...` without each
caller knowing the internal split.

Don't import this file directly — go through `app._core` (the package).
"""
from .db import set_tenant_guc, system_conn, tenant_conn
from .errors import (
    SystemAccessError,
    TenantContextMissingError,
    TenantInactiveError,
)
from .tenancy import TenantContext, require_active_tenant

__all__ = [
    "TenantContext",
    "TenantInactiveError",
    "TenantContextMissingError",
    "SystemAccessError",
    "require_active_tenant",
    "tenant_conn",
    "system_conn",
    "set_tenant_guc",
]
