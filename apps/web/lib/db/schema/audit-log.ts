import { bigserial, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only audit log (PRD §4.6 / C-AUDIT).
 *
 * Brownfield reconciliation — maps to the existing `audit_log` table from
 * `0001_auth.sql`:
 * - `actorId`     ↔ `practitioner_id` (null for patient-token actions)
 * - `entity`      ↔ `resource_type`
 * - `entityId`    ↔ `resource_id` (stored as text in legacy rows)
 * - `payload`     ↔ `metadata` (MUST remain PHI-free per C-PHI)
 *
 * Legacy columns `ip_address`, `user_agent` are preserved; not modeled here.
 */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id"),
  actorId: uuid("practitioner_id"),
  action: text("action").notNull(),
  entity: text("resource_type"),
  entityId: text("resource_id"),
  payload: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;

export const auditLogEntities = [
  "patient",
  "intake_document",
  "protocol",
  "token",
] as const;

export type AuditLogEntity = (typeof auditLogEntities)[number];
