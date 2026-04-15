import { headers } from "next/headers";
import { pool } from "./db";

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
  | "protocol_exported";

export interface AuditInput {
  action: AuditAction;
  tenantId?: string | null;
  practitionerId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(input: AuditInput) {
  const h = headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent") ?? null;
  await pool.query(
    `INSERT INTO audit_log
       (tenant_id, practitioner_id, action, resource_type, resource_id,
        ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.tenantId ?? null,
      input.practitionerId ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      ip,
      ua,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
