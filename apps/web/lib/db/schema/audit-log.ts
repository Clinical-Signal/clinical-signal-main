import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Append-only audit log (PRD §4.6 / C-AUDIT / C-PHI).
 *
 * Brownfield column map:
 * - `actorId`  ↔ `practitioner_id` (null for patient-token actions)
 * - `entity`   ↔ `resource_type`
 * - `entityId` ↔ `resource_id`
 * - `payload`  ↔ `metadata` (PHI-free JSON only)
 *
 * Legacy columns `ip_address`, `user_agent` remain in SQL; not modeled here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
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
  },
  (table) => ({
    tenantCreatedIdx: index("audit_log_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;

export const auditLogEntities = [
  "patient",
  "intake_document",
  "protocol",
  "token",
] as const;

export type AuditLogEntity = (typeof auditLogEntities)[number];

/** PHI-free payload shape for readiness gate audits (GATE-3). */
export type ProtocolReadinessAuditPayload = {
  readiness: "ready" | "partial" | "insufficient";
  confidence_ceiling: "high" | "moderate" | "low";
  can_generate: boolean;
  blocking_gaps: string[];
  non_blocking_gaps: string[];
};
