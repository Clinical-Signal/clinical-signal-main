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
