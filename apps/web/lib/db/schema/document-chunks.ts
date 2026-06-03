import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { int4range, vector1536 } from "./pg-types";

/**
 * Transcript / document chunks for retrieval (PRD §4.4).
 *
 * Brownfield note: legacy `0006` used `text_content`, `chunk_index`, `token_count`.
 * Migration adds PRD columns and HNSW index on `embedding` (see 0001 SQL).
 */
export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull(),
  tenantId: uuid("tenant_id").notNull(),
  chunkText: text("chunk_text").notNull(),
  tokenRange: int4range("token_range"),
  page: integer("page"),
  timeRange: text("time_range"),
  embedding: vector1536("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
