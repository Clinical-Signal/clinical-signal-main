import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Intake upload metadata (PRD §4.3).
 *
 * Brownfield note: legacy migration `0006` created `doc_type`, `blob_url`,
 * `uploaded_at`. This schema uses PRD column names; `0001_intake_schema.sql`
 * adds PRD columns and backfills from legacy names without dropping them.
 */
export const intakeDocuments = pgTable("intake_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  fileType: text("file_type").notNull(),
  s3Key: text("s3_key"),
  processingStatus: text("processing_status").notNull().default("pending"),
  extractedText: text("extracted_text"),
  metadata: jsonb("metadata").notNull().default({}),
  isVerified: boolean("is_verified").notNull().default(false),
  correctionsMade: boolean("corrections_made").notNull().default(false),
  flaggedSpans: jsonb("flagged_spans").notNull().default([]),
  createdBy: uuid("created_by"),
  reviewedBy: uuid("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type IntakeDocument = typeof intakeDocuments.$inferSelect;
export type NewIntakeDocument = typeof intakeDocuments.$inferInsert;

export const intakeDocumentFileTypes = [
  "audio",
  "video",
  "pdf",
  "docx",
  "image",
  "transcript",
  "note",
] as const;

export const intakeDocumentProcessingStatuses = [
  "pending",
  "processing",
  "done",
  "failed",
  "review",
] as const;
