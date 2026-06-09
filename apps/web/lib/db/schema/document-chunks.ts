import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { bytea, int4range, vector1536 } from "./pg-types";

/**
 * Transcript / document chunks for retrieval (PRD §4.4 / TR-6).
 *
 * ~300-token segments with optional `vector(1536)` embedding and HNSW index
 * (created in `0001_intake_schema.sql`; Drizzle declares the index for kit sync).
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    chunkTextEncrypted: bytea("chunk_text_encrypted"),
    tokenRange: int4range("token_range"),
    page: integer("page"),
    timeRange: text("time_range"),
    embedding: vector1536("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    documentIdx: index("document_chunks_document_idx").on(table.documentId),
    tenantIdx: index("document_chunks_tenant_idx").on(table.tenantId),
    // HNSW on embedding: see document_chunks_embedding_hnsw_idx in 0001_intake_schema.sql
  }),
);

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
