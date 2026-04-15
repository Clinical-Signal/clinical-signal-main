import { withTenant } from "./db";

const ENGINE_URL = process.env.ANALYSIS_ENGINE_URL ?? "http://analysis-engine:8000";

// The engine call for /analyze runs synchronously and can take 30-60s.
// Add a generous timeout per call so the UI doesn't hang forever.
const ENGINE_TIMEOUT_MS = 180_000;

export type ProtocolStatus = "draft" | "review" | "finalized";

export interface ProtocolSummary {
  id: string;
  patientId: string;
  analysisId: string | null;
  title: string;
  status: ProtocolStatus;
  version: number;
  createdAt: Date;
}

export interface ProtocolDetail extends ProtocolSummary {
  clinicalContent: Record<string, unknown>;
  clientContent: Record<string, unknown>;
}

export async function runAnalyze(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
}): Promise<{ analysisId: string }> {
  const res = await callEngine("/analyze", {
    tenant_id: args.tenantId,
    patient_id: args.patientId,
    practitioner_id: args.practitionerId,
  });
  return { analysisId: res.analysis_id as string };
}

export async function runGenerateProtocol(args: {
  tenantId: string;
  analysisId: string;
}): Promise<{ protocolId: string }> {
  const res = await callEngine("/generate-protocol", {
    tenant_id: args.tenantId,
    analysis_id: args.analysisId,
  });
  return { protocolId: res.protocol_id as string };
}

async function callEngine(path: string, body: unknown): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), ENGINE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`engine ${path} returned ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listProtocols(
  tenantId: string,
  patientId: string,
): Promise<ProtocolSummary[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      patient_id: string;
      analysis_id: string | null;
      title: string;
      status: ProtocolStatus;
      version: number;
      created_at: Date;
    }>(
      `SELECT id, patient_id, analysis_id, title, status, version, created_at
         FROM protocols
        WHERE patient_id = $1
        ORDER BY created_at DESC`,
      [patientId],
    );
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      analysisId: r.analysis_id,
      title: r.title,
      status: r.status,
      version: r.version,
      createdAt: r.created_at,
    }));
  });
}

/**
 * Save edits as a NEW protocol row with version = max+1, preserving the
 * previous row as history. analysis_id and practitioner_id are inherited
 * from the source row.
 */
export async function saveNewProtocolVersion(args: {
  tenantId: string;
  fromProtocolId: string;
  title: string;
  clinicalContent: Record<string, unknown>;
  clientContent: Record<string, unknown>;
  status?: ProtocolStatus;
}): Promise<{ protocolId: string; version: number }> {
  return withTenant(args.tenantId, async (c) => {
    const { rows: src } = await c.query<{
      patient_id: string;
      practitioner_id: string;
      analysis_id: string | null;
    }>(
      "SELECT patient_id, practitioner_id, analysis_id FROM protocols WHERE id = $1",
      [args.fromProtocolId],
    );
    const s = src[0];
    if (!s) throw new Error("Source protocol not found");
    const { rows: maxV } = await c.query<{ max_v: number }>(
      "SELECT COALESCE(MAX(version), 0) AS max_v FROM protocols WHERE patient_id = $1",
      [s.patient_id],
    );
    const nextVersion = (maxV[0]?.max_v ?? 0) + 1;
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO protocols
         (tenant_id, patient_id, practitioner_id, analysis_id,
          title, clinical_content, client_content, status, version)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
       RETURNING id`,
      [
        args.tenantId,
        s.patient_id,
        s.practitioner_id,
        s.analysis_id,
        args.title,
        JSON.stringify(args.clinicalContent),
        JSON.stringify(args.clientContent),
        args.status ?? "draft",
        nextVersion,
      ],
    );
    return { protocolId: rows[0]!.id, version: nextVersion };
  });
}

export async function updateProtocolStatus(
  tenantId: string,
  protocolId: string,
  status: ProtocolStatus,
): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE protocols
          SET status = $2,
              finalized_at = CASE WHEN $2 = 'finalized' THEN now() ELSE finalized_at END,
              updated_at = now()
        WHERE id = $1`,
      [protocolId, status],
    );
  });
}

export async function listProtocolVersions(
  tenantId: string,
  patientId: string,
): Promise<ProtocolSummary[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      patient_id: string;
      analysis_id: string | null;
      title: string;
      status: ProtocolStatus;
      version: number;
      created_at: Date;
    }>(
      `SELECT id, patient_id, analysis_id, title, status, version, created_at
         FROM protocols
        WHERE patient_id = $1
        ORDER BY version DESC, created_at DESC`,
      [patientId],
    );
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      analysisId: r.analysis_id,
      title: r.title,
      status: r.status,
      version: r.version,
      createdAt: r.created_at,
    }));
  });
}

/** Fetches PDF bytes from the engine. */
export async function fetchProtocolPdf(args: {
  tenantId: string;
  protocolId: string;
  audience: "clinical" | "client";
  practiceName?: string;
}): Promise<{ bytes: Buffer; filename: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), ENGINE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENGINE_URL}/export-protocol`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: args.tenantId,
        protocol_id: args.protocolId,
        audience: args.audience,
        practice_name: args.practiceName ?? "Clinical Signal",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`engine /export-protocol returned ${res.status}: ${text.slice(0, 500)}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename="([^"]+)"/.exec(cd);
    const filename = m?.[1] ?? `protocol_${args.audience}.pdf`;
    return { bytes, filename };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getProtocol(
  tenantId: string,
  protocolId: string,
): Promise<ProtocolDetail | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      patient_id: string;
      analysis_id: string | null;
      title: string;
      status: ProtocolStatus;
      version: number;
      created_at: Date;
      clinical_content: Record<string, unknown>;
      client_content: Record<string, unknown>;
    }>(
      `SELECT id, patient_id, analysis_id, title, status, version, created_at,
              clinical_content, client_content
         FROM protocols
        WHERE id = $1`,
      [protocolId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      patientId: r.patient_id,
      analysisId: r.analysis_id,
      title: r.title,
      status: r.status,
      version: r.version,
      createdAt: r.created_at,
      clinicalContent: r.clinical_content,
      clientContent: r.client_content,
    };
  });
}
