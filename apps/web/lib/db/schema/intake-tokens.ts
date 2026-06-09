import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { IntakeTokenStatus } from "./intake-token-status";

/**
 * SEC-18 — hashed intake link tokens (PRD §4.2).
 *
 * Partial unique index `one_active_token_per_patient`: one non-revoked pending link
 * per patient. PRD also requires non-expired tokens (`expires_at > now()`); PostgreSQL
 * cannot use `now()` in index predicates (not IMMUTABLE), so expiry is enforced in
 * `lib/tokens/intake-token.ts` verify() in addition to this index.
 */
export const intakeTokens = pgTable(
  "intake_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull().default("pending").$type<IntakeTokenStatus>(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    useCount: integer("use_count").notNull().default(0),
  },
  (table) => ({
    tenantIdx: index("intake_tokens_tenant_idx").on(table.tenantId),
    patientIdx: index("intake_tokens_patient_idx").on(table.patientId),
    oneActiveTokenPerPatient: uniqueIndex("one_active_token_per_patient")
      .on(table.patientId)
      .where(
        sql`${table.revokedAt} is null and ${table.status} = 'pending'`,
      ),
  }),
);

export type IntakeToken = typeof intakeTokens.$inferSelect;
export type NewIntakeToken = typeof intakeTokens.$inferInsert;
