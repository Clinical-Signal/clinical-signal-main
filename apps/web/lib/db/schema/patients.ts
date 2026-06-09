import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bytea } from "./pg-types";

import type { IntakeStatus } from "./patients-intake";

/**
 * Legacy `patients` table (see `database/migrations/0002_core_schema.sql`).
 * Exposed in Drizzle Studio for local dev edits (e.g. `intake_data.contact_email`).
 *
 * Studio must connect as the DB superuser — `app_user` sees zero rows due to RLS.
 */
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  practitionerId: uuid("practitioner_id").notNull(),
  nameEncrypted: bytea("name_encrypted").notNull(),
  dobEncrypted: bytea("dob_encrypted"),
  nameSearchHash: text("name_search_hash").notNull(),
  intakeData: jsonb("intake_data").notNull().default({}),
  intakeStatus: text("intake_status").notNull().default("not_started").$type<IntakeStatus>(),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type PatientRow = typeof patients.$inferSelect;
