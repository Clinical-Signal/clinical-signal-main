// Server-only: intake document DB ops + text extraction pipeline.

import { withTenant } from "./db";

export type DocType = "transcript" | "pdf" | "docx" | "txt" | "image" | "video" | "audio" | "note";
export type DocStatus = "pending" | "processing" | "complete" | "failed";

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
      extracted_text: string | null;
      chunk_count: string;
    }>(
      `SELECT d.id, d.doc_type, d.original_filename, d.blob_url,
              d.file_size_bytes, d.processing_status, d.processing_error,
              d.uploaded_at, d.extracted_text,
              (SELECT COUNT(*)::text FROM document_chunks c WHERE c.document_id = d.id) AS chunk_count
         FROM intake_documents d
        WHERE d.patient_id = $1
        ORDER BY d.uploaded_at DESC`,
      [patientId],
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
      extractedTextPreview: r.extracted_text ? r.extracted_text.slice(0, 200) : null,
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
  return withTenant(args.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO intake_documents
         (tenant_id, patient_id, doc_type, original_filename, blob_url,
          file_size_bytes, extracted_text, processing_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete', $8)
       RETURNING id`,
      [
        args.tenantId,
        args.patientId,
        args.docType,
        args.originalFilename,
        args.blobUrl,
        args.fileSizeBytes,
        args.extractedText,
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
  return withTenant(args.tenantId, async (c) => {
    let inserted = 0;
    for (const chunk of args.chunks) {
      const tokenEstimate = Math.ceil(chunk.text.length / 4);
      await c.query(
        `INSERT INTO document_chunks
           (tenant_id, document_id, chunk_index, text_content, token_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (document_id, chunk_index) DO NOTHING`,
        [args.tenantId, args.documentId, chunk.index, chunk.text, tokenEstimate],
      );
      inserted++;
    }
    return inserted;
  });
}

export async function getDocumentText(
  tenantId: string,
  patientId: string,
): Promise<string[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ extracted_text: string }>(
      `SELECT extracted_text FROM intake_documents
        WHERE patient_id = $1 AND processing_status = 'complete'
          AND extracted_text IS NOT NULL AND extracted_text <> ''
        ORDER BY uploaded_at ASC`,
      [patientId],
    );
    return rows.map((r) => r.extracted_text);
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
