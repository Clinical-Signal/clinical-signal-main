// Server-only: intake document DB ops + text extraction pipeline.

import { phiKey, withTenant } from "./db";

export type DocType = "transcript" | "pdf" | "docx" | "txt" | "image" | "video" | "audio" | "note";
export type DocStatus = "pending" | "processing" | "complete" | "failed";

/** SEC-3a — same key chain as MFA / PHI columns (PGCRYPTO_KEY_REF_DEV → PHI_ENCRYPTION_KEY). */
function pgcryptoKey(): string {
  const key = process.env.PGCRYPTO_KEY_REF_DEV ?? process.env.PHI_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("PGCRYPTO_KEY_REF_DEV or PHI_ENCRYPTION_KEY must be set");
  }
  return key;
}

export interface IntakeDocSummary {
  id: string;
  docType: DocType;
  originalFilename: string | null;
  blobUrl: string | null;
  fileSizeBytes: number | null;
  status: DocStatus;
  processingError: string | null;
  uploadedAt: Date;
  extractedTextPreview: string | null;
  chunkCount: number;
}

export async function listIntakeDocs(
  tenantId: string,
  patientId: string,
): Promise<IntakeDocSummary[]> {
  const key = pgcryptoKey();
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      doc_type: DocType;
      original_filename: string | null;
      blob_url: string | null;
      file_size_bytes: number | null;
      processing_status: DocStatus;
      processing_error: string | null;
      uploaded_at: Date;
      extracted_text_preview: string | null;
      chunk_count: string;
    }>(
      `SELECT d.id, d.doc_type, d.original_filename, d.blob_url,
              d.file_size_bytes, d.processing_status, d.processing_error,
              d.uploaded_at,
              CASE WHEN d.extracted_text_encrypted IS NULL THEN NULL
                   ELSE left(pgp_sym_decrypt(d.extracted_text_encrypted, $2)::text, 200)
              END AS extracted_text_preview,
              (SELECT COUNT(*)::text FROM document_chunks c WHERE c.document_id = d.id) AS chunk_count
         FROM intake_documents d
        WHERE d.patient_id = $1
        ORDER BY d.uploaded_at DESC`,
      [patientId, key],
    );
    return rows.map((r) => ({
      id: r.id,
      docType: r.doc_type,
      originalFilename: r.original_filename,
      blobUrl: r.blob_url,
      fileSizeBytes: r.file_size_bytes,
      status: r.processing_status,
      processingError: r.processing_error,
      uploadedAt: r.uploaded_at,
      extractedTextPreview: r.extracted_text_preview,
      chunkCount: parseInt(r.chunk_count, 10) || 0,
    }));
  });
}

export async function insertDocument(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  docType: DocType;
  originalFilename: string | null;
  blobUrl: string | null;
  fileSizeBytes: number | null;
  extractedText: string;
}): Promise<string> {
  const key = pgcryptoKey();
  return withTenant(args.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO intake_documents
         (tenant_id, patient_id, doc_type, original_filename, blob_url,
          file_size_bytes, extracted_text_encrypted, processing_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, pgp_sym_encrypt($7, $8), 'complete', $9)
       RETURNING id`,
      [
        args.tenantId,
        args.patientId,
        args.docType,
        args.originalFilename,
        args.blobUrl,
        args.fileSizeBytes,
        args.extractedText,
        key,
        args.practitionerId,
      ],
    );
    return rows[0]!.id;
  });
}

export async function insertChunks(args: {
  tenantId: string;
  documentId: string;
  chunks: Array<{ text: string; index: number }>;
}): Promise<number> {
  if (args.chunks.length === 0) return 0;
  const key = pgcryptoKey();
  return withTenant(args.tenantId, async (c) => {
    let inserted = 0;
    for (const chunk of args.chunks) {
      const tokenEstimate = Math.ceil(chunk.text.length / 4);
      await c.query(
        `INSERT INTO document_chunks
           (tenant_id, document_id, chunk_index, chunk_text_encrypted, token_count)
         VALUES ($1, $2, $3, pgp_sym_encrypt($4, $5), $6)
         ON CONFLICT (document_id, chunk_index) DO NOTHING`,
        [args.tenantId, args.documentId, chunk.index, chunk.text, key, tokenEstimate],
      );
      inserted++;
    }
    return inserted;
  });
}

export interface DocumentWithMeta {
  text: string;
  docType: DocType;
  filename: string | null;
}

/**
 * Return extracted text for all complete documents, including metadata
 * so callers can tag documents by type (transcript, lab PDF, note, etc.)
 * for proper source attribution in AI prompts.
 */
export async function getDocumentText(
  tenantId: string,
  patientId: string,
): Promise<DocumentWithMeta[]> {
  const key = pgcryptoKey();
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      extracted_text: string;
      doc_type: DocType;
      original_filename: string | null;
    }>(
      `SELECT pgp_sym_decrypt(extracted_text_encrypted, $2)::text AS extracted_text,
              doc_type, original_filename
         FROM intake_documents
        WHERE patient_id = $1
          AND processing_status = 'complete'
          AND extracted_text_encrypted IS NOT NULL
          AND (metadata->>'type' IS DISTINCT FROM 'prep_brief')
        ORDER BY uploaded_at ASC`,
      [patientId, key],
    );
    return rows
      .filter((r) => r.extracted_text.length > 0)
      .map((r) => ({
        text: r.extracted_text,
        docType: r.doc_type,
        filename: r.original_filename,
      }));
  });
}

export type PrepBriefRecord = {
  extractedText: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

/** Latest stored prep brief (decrypted server-side only). */
export async function getLatestPrepBrief(
  tenantId: string,
  patientId: string,
): Promise<PrepBriefRecord | null> {
  const key = pgcryptoKey();
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      extracted_text: string;
      created_at: Date;
      metadata: Record<string, unknown>;
    }>(
      `SELECT pgp_sym_decrypt(extracted_text_encrypted, $2)::text AS extracted_text,
              created_at, metadata
         FROM intake_documents
        WHERE tenant_id = $1
          AND patient_id = $3
          AND metadata->>'type' = 'prep_brief'
          AND extracted_text_encrypted IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId, key, patientId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      extractedText: row.extracted_text,
      createdAt: row.created_at,
      metadata: row.metadata ?? {},
    };
  });
}

export async function insertPrepBriefDocument(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  briefJson: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const key = pgcryptoKey();
  await withTenant(args.tenantId, async (c) => {
    await c.query(
      `INSERT INTO intake_documents
         (tenant_id, patient_id, doc_type, original_filename,
          extracted_text_encrypted, processing_status, metadata, created_by)
       VALUES ($1, $2, 'note', 'Pre-call prep brief',
               pgp_sym_encrypt($3, $4), 'complete', $5::jsonb, $6)`,
      [
        args.tenantId,
        args.patientId,
        args.briefJson,
        key,
        JSON.stringify(args.metadata),
        args.practitionerId,
      ],
    );
  });
}

export async function countIntakeDocsAfter(
  tenantId: string,
  patientId: string,
  after: Date,
): Promise<number> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
         FROM intake_documents
        WHERE tenant_id = $1
          AND patient_id = $2
          AND (metadata->>'type' IS DISTINCT FROM 'prep_brief')
          AND created_at > $3`,
      [tenantId, patientId, after],
    );
    return rows[0]?.cnt ?? 0;
  });
}

// Split text into ~300 token chunks on sentence boundaries.
export function chunkText(text: string, targetTokens: number = 300): Array<{ text: string; index: number }> {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: Array<{ text: string; index: number }> = [];
  let current = "";
  let idx = 0;

  for (const sentence of sentences) {
    const combined = current ? current + " " + sentence : sentence;
    const estimatedTokens = Math.ceil(combined.length / 4);

    if (estimatedTokens > targetTokens && current) {
      chunks.push({ text: current.trim(), index: idx++ });
      current = sentence;
    } else {
      current = combined;
    }
  }
  if (current.trim()) {
    chunks.push({ text: current.trim(), index: idx });
  }
  return chunks;
}
