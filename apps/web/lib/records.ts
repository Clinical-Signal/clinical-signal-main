import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { phiKey, withTenant } from "./db";

export type RecordType = "lab" | "clinical_note" | "imaging" | "intake_form" | "other";
export type ProcessingStatus = "pending" | "processing" | "complete" | "failed";

export interface RecordSummary {
  id: string;
  recordType: RecordType;
  status: ProcessingStatus;
  processingError: string | null;
  sourceFileKey: string | null;
  recordDate: string | null;
  uploadedAt: Date;
}

export interface RecordDetail extends RecordSummary {
  structuredData: StructuredLabData | Record<string, unknown>;
}

export interface LabValue {
  test_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: "high" | "low" | "normal" | "unknown";
  collected_at?: string | null;
}

export interface StructuredLabData {
  labs?: LabValue[];
  report_metadata?: Record<string, unknown>;
  extraction_confidence?: "high" | "medium" | "low";
  notes?: string | null;
  _extraction?: Record<string, unknown>;
}

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/uploads";
const ENGINE_UPLOADS_DIR = process.env.ENGINE_UPLOADS_DIR ?? UPLOADS_DIR;
const ENGINE_URL = process.env.ANALYSIS_ENGINE_URL ?? "http://analysis-engine:8000";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export async function listRecords(tenantId: string, patientId: string): Promise<RecordSummary[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      record_type: RecordType;
      processing_status: ProcessingStatus;
      processing_error: string | null;
      source_file_key: string | null;
      record_date: string | null;
      uploaded_at: Date;
    }>(
      `SELECT id, record_type, processing_status, processing_error,
              source_file_key, record_date::text AS record_date, uploaded_at
         FROM records
        WHERE patient_id = $1
        ORDER BY uploaded_at DESC`,
      [patientId],
    );
    return rows.map((r) => ({
      id: r.id,
      recordType: r.record_type,
      status: r.processing_status,
      processingError: r.processing_error,
      sourceFileKey: r.source_file_key,
      recordDate: r.record_date,
      uploadedAt: r.uploaded_at,
    }));
  });
}

export async function getRecord(
  tenantId: string,
  recordId: string,
): Promise<RecordDetail | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      record_type: RecordType;
      processing_status: ProcessingStatus;
      processing_error: string | null;
      source_file_key: string | null;
      record_date: string | null;
      uploaded_at: Date;
      structured_data: StructuredLabData;
    }>(
      `SELECT id, record_type, processing_status, processing_error,
              source_file_key, record_date::text AS record_date, uploaded_at,
              structured_data
         FROM records
        WHERE id = $1`,
      [recordId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      recordType: r.record_type,
      status: r.processing_status,
      processingError: r.processing_error,
      sourceFileKey: r.source_file_key,
      recordDate: r.record_date,
      uploadedAt: r.uploaded_at,
      structuredData: r.structured_data,
    };
  });
}

export async function patientBelongsToTenant(
  tenantId: string,
  patientId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      "SELECT id FROM patients WHERE id = $1",
      [patientId],
    );
    return rows.length > 0;
  });
}

export interface UploadResult {
  recordId: string;
}

export async function acceptLabUpload(args: {
  tenantId: string;
  patientId: string;
  file: File;
}): Promise<UploadResult> {
  const { tenantId, patientId, file } = args;
  if (file.type !== "application/pdf") throw new Error("Only PDF uploads are supported.");
  if (file.size <= 0) throw new Error("File is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`);
  }

  await mkdir(UPLOADS_DIR, { recursive: true });
  const id = randomUUID();
  const relKey = `records/${id}.pdf`;
  const fsPath = path.join(UPLOADS_DIR, relKey);
  await mkdir(path.dirname(fsPath), { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  // Reject files that do not start with the PDF magic bytes regardless of
  // declared MIME type.
  if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("File is not a valid PDF.");
  }
  await writeFile(fsPath, bytes, { mode: 0o600 });

  await withTenant(tenantId, async (c) => {
    await c.query(
      `INSERT INTO records (id, tenant_id, patient_id, record_type, source_file_key, processing_status)
       VALUES ($1, $2, $3, 'lab', $4, 'pending')`,
      [id, tenantId, patientId, relKey],
    );
  });

  const enginePath = path.join(ENGINE_UPLOADS_DIR, relKey);
  // Fire-and-forget. The engine returns 202 quickly; it updates the record
  // row asynchronously. If the engine is unreachable we mark the record
  // failed so the UI surfaces the problem rather than hanging on 'pending'.
  fetch(`${ENGINE_URL}/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      record_id: id,
      tenant_id: tenantId,
      patient_id: patientId,
      file_path: enginePath,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        await markFailed(tenantId, id, `engine returned ${res.status}: ${body.slice(0, 500)}`);
      }
    })
    .catch(async (err) => {
      await markFailed(tenantId, id, `engine unreachable: ${err?.message ?? err}`);
    });

  return { recordId: id };
}

async function markFailed(tenantId: string, recordId: string, error: string): Promise<void> {
  try {
    await withTenant(tenantId, async (c) => {
      await c.query(
        `UPDATE records SET processing_status = 'failed', processing_error = $2 WHERE id = $1`,
        [recordId, error.slice(0, 2000)],
      );
    });
  } catch {
    // swallow — we don't want a secondary failure to crash the request path
  }
}

export async function saveLabCorrections(
  tenantId: string,
  recordId: string,
  labs: LabValue[],
): Promise<void> {
  // Read current structured_data, overwrite only the labs array, keep other
  // keys (metadata, extraction meta) intact.
  await withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ structured_data: StructuredLabData }>(
      "SELECT structured_data FROM records WHERE id = $1",
      [recordId],
    );
    if (!rows[0]) throw new Error("Record not found.");
    const next = { ...rows[0].structured_data, labs };
    await c.query(
      "UPDATE records SET structured_data = $2::jsonb WHERE id = $1",
      [recordId, JSON.stringify(next)],
    );
  });
}

// Used in a later sprint when we need decrypted text for analysis. Kept here
// for cohesion; requires the PHI key.
export async function getDecryptedText(tenantId: string, recordId: string): Promise<string | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ text: string | null }>(
      `SELECT CASE WHEN extracted_text_encrypted IS NULL THEN NULL
                   ELSE pgp_sym_decrypt(extracted_text_encrypted, $2)::text END AS text
         FROM records WHERE id = $1`,
      [recordId, phiKey()],
    );
    return rows[0]?.text ?? null;
  });
}
