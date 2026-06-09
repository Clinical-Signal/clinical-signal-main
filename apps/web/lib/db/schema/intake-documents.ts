import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { bytea } from "./pg-types";

/**
 * Intake upload metadata (PRD §4.3).
 *
 * Brownfield: legacy `0006_intake_documents.sql` may use `doc_type` / `blob_url`;
 * `0001_intake_schema.sql` adds PRD columns and backfills without dropping legacy names.
 */
export const intakeDocuments = pgTable(
  "intake_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    fileType: text("file_type").notNull(),
    s3Key: text("s3_key"),
    processingStatus: text("processing_status").notNull().default("pending"),
    extractedTextEncrypted: bytea("extracted_text_encrypted"),
    metadata: jsonb("metadata").notNull().default({}),
    isVerified: boolean("is_verified").notNull().default(false),
    correctionsMade: boolean("corrections_made").notNull().default(false),
    flaggedSpans: jsonb("flagged_spans").notNull().default([]),
    /** PRD NOT NULL for new rows; nullable for brownfield rows until backfilled. */
    createdBy: uuid("created_by"),
    reviewedBy: uuid("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdx: index("intake_documents_tenant_idx").on(table.tenantId),
    patientIdx: index("intake_documents_patient_idx").on(table.patientId),
  }),
);

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

export type IntakeDocumentFileType = (typeof intakeDocumentFileTypes)[number];

export const intakeDocumentProcessingStatuses = [
  "pending",
  "processing",
  "done",
  "failed",
  "review",
] as const;

export type IntakeDocumentProcessingStatus =
  (typeof intakeDocumentProcessingStatuses)[number];
