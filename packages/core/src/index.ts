export type {
  TenantContext,
  TenantLifecycleStatus,
  PractitionerRole,
} from "./tenancy/context";
export { isTenantContext } from "./tenancy/context";

export { requireActiveTenant } from "./tenancy/require";

export type { AuditAction, AuditEvent } from "./audit/events";
export { assertExhaustiveAuditAction } from "./audit/events";

export {
  TenantInactiveError,
  TenantContextMissingError,
  SystemAccessDeniedError,
} from "./errors";
