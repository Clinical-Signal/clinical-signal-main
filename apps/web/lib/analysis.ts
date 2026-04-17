// In-process clinical analysis + protocol generation. Calls Claude directly
// from the Next.js serverless function so the deployed app doesn't depend
// on the Python analysis engine. The prompts are the same .md files used by
// the engine — copied into apps/web/prompts/ and read at module load time.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { phiKey, withTenant } from "./db";

// Next.js file tracing will include these in the serverless bundle.
const PROMPTS_DIR = join(process.cwd(), "prompts");

function loadPrompt(name: string): string {
  return readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// Dynamic import so the module doesn't crash in environments where the
// SDK isn't installed (e.g. Docker container that hasn't been rebuilt).
async function createClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key });
}

function stripCodeFences(s: string): string {
  s = s.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z0-9]*\n/, "");
    s = s.replace(/\n```\s*$/, "");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Gather patient timeline
// ---------------------------------------------------------------------------

export interface PatientTimeline {
  patientId: string;
  intakeData: Record<string, unknown>;
  records: Array<{
    recordId: string;
    recordType: string;
    recordDate: string | null;
    structuredData: Record<string, unknown>;
  }>;
  recordIds: string[];
}

export async function gatherPatientTimeline(
  tenantId: string,
  patientId: string,
): Promise<PatientTimeline> {
  return withTenant(tenantId, async (c) => {
    const { rows: pRows } = await c.query<{ intake_data: Record<string, unknown> }>(
      "SELECT intake_data FROM patients WHERE id = $1",
      [patientId],
    );
    if (!pRows[0]) throw new Error(`Patient ${patientId} not found`);

    const { rows: rRows } = await c.query<{
      id: string;
      record_type: string;
      record_date: string | null;
      structured_data: Record<string, unknown>;
    }>(
      `SELECT id, record_type, record_date::text, structured_data
         FROM records
        WHERE patient_id = $1 AND processing_status = 'complete'
        ORDER BY COALESCE(record_date, uploaded_at::date) ASC`,
      [patientId],
    );

    const records = rRows.map((r) => {
      const sd = { ...(r.structured_data ?? {}) };
      delete (sd as Record<string, unknown>)["_extraction"];
      return {
        recordId: r.id,
        recordType: r.record_type,
        recordDate: r.record_date,
        structuredData: sd,
      };
    });

    return {
      patientId,
      intakeData: pRows[0].intake_data ?? {},
      records,
      recordIds: records.map((r) => r.recordId),
    };
  });
}

function formatTimelineForPrompt(t: PatientTimeline): string {
  const sections: string[] = [];
  sections.push("## Intake");
  sections.push(JSON.stringify(t.intakeData, null, 2));

  if (t.records.length === 0) {
    sections.push("\n## Records\n(none)");
  } else {
    sections.push(`\n## Records (${t.records.length} complete)`);
    for (const r of t.records) {
      sections.push(`### ${r.recordType} — ${r.recordDate ?? "undated"} (id ${r.recordId})`);
      sections.push(JSON.stringify(r.structuredData, null, 2));
    }
  }
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Clinical analysis (step 1)
// ---------------------------------------------------------------------------

export async function runClinicalAnalysis(
  timelineText: string,
): Promise<{ findings: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  const system = loadPrompt("clinical_analysis_v1");
  const claude = await createClient();
  const msg = await claude.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [
      {
        role: "user",
        content:
          "Analyze the following patient data. Respond with JSON only per the output contract.\n\n<patient_data>\n" +
          timelineText +
          "\n</patient_data>",
      },
    ],
  });

  const raw = msg.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");
  const findings = JSON.parse(stripCodeFences(raw));
  const meta = {
    model_id: MODEL,
    prompt_version: "clinical_analysis_v1",
    token_usage: {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    },
  };
  return { findings, meta, raw };
}

// ---------------------------------------------------------------------------
// Protocol generation (step 2)
// ---------------------------------------------------------------------------

export async function runProtocolGeneration(
  findings: Record<string, unknown>,
  kbContext?: Array<Record<string, unknown>>,
): Promise<{ protocol: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  const system = loadPrompt("protocol_generation_v1");
  let userContent =
    "Produce the clinical protocol AND phased client action plan for this patient based on the analysis below. Respond with JSON only per the output contract.\n\n<analysis>\n" +
    JSON.stringify(findings) +
    "\n</analysis>";

  if (kbContext && kbContext.length > 0) {
    userContent += "\n\n" + formatKbContext(kbContext);
  }

  const claude = await createClient();
  const msg = await claude.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = msg.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");
  const protocol = JSON.parse(stripCodeFences(raw));
  const meta = {
    model_id: MODEL,
    prompt_version: "protocol_generation_v1",
    token_usage: {
      input_tokens: msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    },
    kb_context_size: kbContext?.length ?? 0,
  };
  return { protocol, meta, raw };
}

function formatKbContext(items: Array<Record<string, unknown>>): string {
  const lines: string[] = [
    "## Clinical Knowledge Base",
    "",
    "The following items come from Dr. Laura DeCesaris's functional-medicine",
    "mentorship corpus. Incorporate their clinical reasoning where appropriate.",
    "",
  ];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    lines.push(`### KB-${i + 1} · ${it.category ?? "other"} · ${it.source_channel ?? "?"}`);
    lines.push(`**${it.title ?? ""}**`);
    lines.push(String(it.content ?? ""));
    const md = (it.metadata ?? {}) as Record<string, unknown>;
    if (md.sequencing_notes) lines.push(`*Sequencing:* ${md.sequencing_notes}`);
    if (md.clinical_reasoning) lines.push(`*Reasoning:* ${md.clinical_reasoning}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// DB writes
// ---------------------------------------------------------------------------

export async function insertAnalysis(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  analysisType: string;
  inputRecordIds: string[];
  findings: Record<string, unknown>;
  meta: Record<string, unknown>;
  raw: string;
}): Promise<string> {
  const key = phiKey();
  return withTenant(args.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO analyses
         (tenant_id, patient_id, practitioner_id, analysis_type,
          input_record_ids, findings, raw_ai_response_encrypted,
          model_id, prompt_version, token_usage, status, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, pgp_sym_encrypt($7, $8),
               $9, $10, $11::jsonb, 'complete', now())
       RETURNING id`,
      [
        args.tenantId,
        args.patientId,
        args.practitionerId,
        args.analysisType,
        args.inputRecordIds,
        JSON.stringify(args.findings),
        args.raw,
        key,
        (args.meta as Record<string, unknown>).model_id,
        (args.meta as Record<string, unknown>).prompt_version,
        JSON.stringify((args.meta as Record<string, unknown>).token_usage ?? {}),
      ],
    );
    return rows[0]!.id;
  });
}

export async function insertProtocol(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  analysisId: string;
  title: string;
  clinicalContent: Record<string, unknown>;
  clientContent: Record<string, unknown>;
}): Promise<string> {
  return withTenant(args.tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO protocols
         (tenant_id, patient_id, practitioner_id, analysis_id,
          title, clinical_content, client_content, status, version)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'draft', 1)
       RETURNING id`,
      [
        args.tenantId,
        args.patientId,
        args.practitionerId,
        args.analysisId,
        args.title,
        JSON.stringify(args.clinicalContent),
        JSON.stringify(args.clientContent),
      ],
    );
    return rows[0]!.id;
  });
}

export async function getAnalysisFindings(
  tenantId: string,
  analysisId: string,
): Promise<{ patientId: string; practitionerId: string; findings: Record<string, unknown> } | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      patient_id: string;
      practitioner_id: string;
      findings: Record<string, unknown>;
    }>(
      "SELECT patient_id, practitioner_id, findings FROM analyses WHERE id = $1 AND status = 'complete'",
      [analysisId],
    );
    return rows[0]
      ? { patientId: rows[0].patient_id, practitionerId: rows[0].practitioner_id, findings: rows[0].findings }
      : null;
  });
}

// ---------------------------------------------------------------------------
// Orchestration — full analyze → generate pipeline
// ---------------------------------------------------------------------------

export async function analyzeAndGenerate(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
}): Promise<{ analysisId: string; protocolId: string }> {
  const timeline = await gatherPatientTimeline(args.tenantId, args.patientId);
  const timelineText = formatTimelineForPrompt(timeline);

  const { findings, meta: aMeta, raw: aRaw } = await runClinicalAnalysis(timelineText);

  const analysisId = await insertAnalysis({
    tenantId: args.tenantId,
    patientId: args.patientId,
    practitionerId: args.practitionerId,
    analysisType: "full_history",
    inputRecordIds: timeline.recordIds,
    findings,
    meta: aMeta,
    raw: aRaw,
  });

  const { protocol, meta: pMeta } = await runProtocolGeneration(findings);

  const title = (protocol.title as string) || "Draft Protocol";
  const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
  const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
  (clinicalContent as Record<string, unknown>)._generation = {
    ...pMeta,
    ...(protocol.meta ? { model_meta: protocol.meta } : {}),
  };

  const protocolId = await insertProtocol({
    tenantId: args.tenantId,
    patientId: args.patientId,
    practitionerId: args.practitionerId,
    analysisId,
    title,
    clinicalContent,
    clientContent,
  });

  return { analysisId, protocolId };
}
