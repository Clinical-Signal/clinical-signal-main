// Append-only audit log writer. audit_log intentionally has no RLS
// (see database/migrations/0002_core_schema.sql) — failed-login events
// fire pre-tenant, and admin views need to read across tenants. Hence
// withSystem with a tagged reason instead of withTenantContext.
//
// Re-exports the AuditAction / AuditEvent shapes from @cs/core so the
// canonical typed union has one home; existing callers importing
// `AuditAction` / `AuditInput` from this module keep working.

import { headers } from "next/headers";
import { withSystem } from "@cs/db";
import type { AuditAction, AuditEvent } from "@cs/core";

export type { AuditAction };
// Historical name used throughout apps/web. AuditEvent is the canonical
// type; AuditInput is the writer-side alias kept for back-compat.
export type AuditInput = AuditEvent;

function nullableUuid(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  return value;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const h = headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent") ?? null;

  await withSystem({ reason: "audit_log_write" }, async (c) => {
    await c.query(
      `INSERT INTO audit_log
         (tenant_id, practitioner_id, action, resource_type, resource_id,
          ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        nullableUuid(input.tenantId),
        nullableUuid(input.practitionerId),
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        ip,
        ua,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  });
}
