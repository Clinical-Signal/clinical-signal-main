import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Async transcription / OCR pipeline jobs (PRD §4.5). */
export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  status: text("status").notNull().default("queued"),
  engine: text("engine"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  baaVerified: boolean("baa_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;

export const processingJobStatuses = ["queued", "running", "done", "failed"] as const;

export const processingJobEngines = [
  "whisper",
  "assemblyai",
  "textract",
  "tesseract",
] as const;
