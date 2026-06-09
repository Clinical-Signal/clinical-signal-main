// Discriminated union for audit events. The string union lives next to
// the typed payloads so callers get autocompletion and exhaustiveness
// checks (use a `switch (event.action)` with a `never` default).
//
// audit_log column mapping (see database/migrations/0001_auth.sql and
// 0014_*_audit_extensions.sql):
//   - action        ← AuditEvent['action']
//   - tenant_id     ← AuditEvent['tenantId']     (nullable for pre-auth events)
//   - practitioner_id ← AuditEvent['practitionerId']
//   - resource_type ← AuditEvent['resourceType']
//   - resource_id   ← AuditEvent['resourceId']
//   - metadata      ← AuditEvent['metadata']     (JSONB)

export type AuditAction =
  | "login_success"
  | "login_failure"
  | "logout"
  | "signup"
  | "password_reset_requested"
  | "password_reset_completed"
  | "password_changed"
  | "session_expired"
  | "analysis_generated"
  | "protocol_generated"
  | "intake_saved"
  | "intake_submitted"
  | "protocol_edited"
  | "protocol_status_changed"
  | "protocol_exported"
  | "mfa_enrolled"
  | "mfa_verified"
  | "mfa_failed"
  | "mfa_required_redirect";

export interface AuditEvent {
  readonly action: AuditAction;
  readonly tenantId?: string | null;
  readonly practitionerId?: string | null;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

// Compile-time exhaustiveness helper. Use in audit consumers like:
//   switch (event.action) { ... default: assertExhaustive(event.action); }
export function assertExhaustiveAuditAction(value: never): never {
  throw new Error(`Unhandled audit action: ${String(value)}`);
}
