import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { PractitionerRole } from "@cs/core";

import { bytea } from "./pg-types";

/** PRD §5.6 — four practitioner roles (TEXT + CHECK in 0029_role_check_constraint.sql). */
export const practitionerRoles = [
  "owner",
  "practitioner",
  "viewer",
  "coach",
] as const satisfies readonly PractitionerRole[];

/**
 * Auth practitioners table (see database/migrations/0001_auth.sql, 0026_mfa.sql).
 */
export const practitioners = pgTable("practitioners", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  emailLower: text("email_lower").notNull().unique(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("practitioner").$type<PractitionerRole>(),
  credentials: jsonb("credentials").notNull().default({}),
  mfaSecretEncrypted: bytea("mfa_secret_encrypted"),
  mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true, mode: "date" }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type PractitionerRow = typeof practitioners.$inferSelect;
