// Typed error classes for the lib layer. These are matched on by name in
// callers (route handlers, server actions, tests) so use `instanceof` for
// classification rather than parsing messages.

export class TenantInactiveError extends Error {
  readonly code = "tenant_inactive" as const;
  readonly tenantId: string;
  readonly lifecycleStatus: string;

  constructor(tenantId: string, lifecycleStatus: string) {
    super(
      `Tenant ${tenantId} is not active (status=${lifecycleStatus}). ` +
        `Complete BAA / lift suspension before performing this action.`,
    );
    this.name = "TenantInactiveError";
    this.tenantId = tenantId;
    this.lifecycleStatus = lifecycleStatus;
  }
}

export class TenantContextMissingError extends Error {
  readonly code = "tenant_context_missing" as const;

  constructor(operation: string) {
    super(
      `${operation} requires a TenantContext but none was provided. ` +
        `Did you forget to call requireAuth() / pass ctx through?`,
    );
    this.name = "TenantContextMissingError";
  }
}

// Thrown by withSystem callers that try to run a no-RLS query in a code
// path that should have been tenant-scoped. Catchable so callers can
// surface a clean 500 instead of leaking the message.
export class SystemAccessDeniedError extends Error {
  readonly code = "system_access_denied" as const;

  constructor(reason: string) {
    super(`Refused to run system-level (no-RLS) query: ${reason}`);
    this.name = "SystemAccessDeniedError";
  }
}
