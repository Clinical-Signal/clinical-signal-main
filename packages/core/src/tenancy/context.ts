// Multi-tenant request context — the typed handle that every PHI access
// path takes as input. Replaces ad-hoc `tenantId: string` parameters that
// the lib/* layer had been threading through manually.
//
// The shape is intentionally small. It carries:
//   - tenantId / practitionerId / sessionId for authn+authz and RLS
//   - role for in-app authorization checks
//   - lifecycleStatus so server actions can refuse to act on a tenant that
//     is suspended or hasn't completed BAA
//
// What this context does NOT do:
//   - It does not set the Postgres GUC. That's `withTenantContext` in
//     packages/db. Holding a context is "permission to ask"; running a
//     query is still an explicit step.
//   - It does not encode RBAC rules beyond the role string. Authorization
//     decisions live next to the operation that performs them.

export type TenantLifecycleStatus =
  | "pending_baa"
  | "active"
  | "suspended"
  | "terminated";

export type PractitionerRole = "owner" | "practitioner" | "viewer";

export interface TenantContext {
  readonly tenantId: string;
  readonly practitionerId: string;
  readonly sessionId: string;
  readonly role: PractitionerRole;
  readonly lifecycleStatus: TenantLifecycleStatus;
}

// Narrow TypeGuard used by integration tests and routes that accept either
// a context or a raw user object — we don't want a stringly-typed bag of
// IDs sneaking through.
export function isTenantContext(value: unknown): value is TenantContext {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tenantId === "string" &&
    typeof v.practitionerId === "string" &&
    typeof v.sessionId === "string" &&
    typeof v.role === "string" &&
    typeof v.lifecycleStatus === "string"
  );
}
