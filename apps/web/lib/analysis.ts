// In-process clinical analysis + protocol generation. Calls Claude directly
// from the Next.js serverless function so the deployed app doesn't depend
// on the Python analysis engine.

import { phiKey, withTenant } from "./db";
import {
  loadPrompt,
  promptHash,
  stripCodeFences,
  streamModel,
} from "./llm";

const MODEL = "claude-sonnet-4-5-20250929";

// Tunable token limits. Hardcoded so they're versioned in code rather than
// drifting silently across environments via env vars. Sonnet 4.5 supports
// 64k output.
const MAX_ANALYSIS_TOKENS = 16000;
const MAX_PROTOCOL_TOKENS = 64000;
const KB_CONTEXT_LIMIT = 12;
const DOC_TEXT_CAP = 8000;

const CLINICAL_ANALYSIS_PROMPT = "clinical_analysis_v1";
const PROTOCOL_GENERATION_PROMPT = "protocol_generation_v1";
const PREP_BRIEF_PROMPT = "prep_brief_v1";


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

/** Document metadata from intake-documents — used to tag source type in prompts. */
interface DocWithMeta {
  text: string;
  docType: string;
  filename: string | null;
}

async function getDocumentTexts(tenantId: string, patientId: string): Promise<DocWithMeta[]> {
  const { getDocumentText } = await import("./intake-documents");
  return getDocumentText(tenantId, patientId);
}

/** Human-readable label for a document type, used in prompt source attribution. */
function docTypeLabel(docType: string, filename: string | null): string {
  switch (docType) {
    case "transcript": return "Call Transcript";
    case "note": return "Practitioner Note";
    case "pdf": {
      // Attempt to identify lab PDFs by filename
      const fn = (filename ?? "").toLowerCase();
      if (fn.includes("gi-map") || fn.includes("gimap")) return "Lab Report — GI-MAP";
      if (fn.includes("dutch")) return "Lab Report — DUTCH";
      if (fn.includes("nutraeval")) return "Lab Report — NutraEval";
      if (fn.includes("lab") || fn.includes("blood") || fn.includes("panel")) return "Lab Report (PDF)";
      return "Uploaded PDF";
    }
    case "image": return "Uploaded Image";
    case "docx": return "Uploaded Document";
    default: return "Uploaded Document";
  }
}

export function formatTimelineForPrompt(
  t: PatientTimeline,
  documentTexts?: DocWithMeta[],
): string {
  const sections: string[] = [];
  sections.push("## Intake");
  sections.push(JSON.stringify(t.intakeData, null, 2));

  if (t.records.length === 0) {
    sections.push("\n## Records\n(none)");
  } else {
    sections.push("\n## Records (" + t.records.length + " complete)");
    for (const r of t.records) {
      sections.push("### " + r.recordType + " — " + (r.recordDate ?? "undated") + " (id " + r.recordId + ")");
      sections.push(JSON.stringify(r.structuredData, null, 2));
    }
  }

  if (documentTexts && documentTexts.length > 0) {
    sections.push("\n## Uploaded documents & transcripts (" + documentTexts.length + ")");
    sections.push(
      "The following are practitioner-uploaded call transcripts, clinical notes, " +
      "and extracted document text (including lab reports like GI-MAP, DUTCH, NutraEval). " +
      "They contain direct clinical observations and data that MUST inform the analysis. " +
      "If a lab test appears here, do NOT recommend ordering that test — it has already been done.\n\n" +
      "IMPORTANT: Source types are labeled in brackets (e.g. [Call Transcript], " +
      "[Practitioner Note], [Lab Report]). Use these labels to weight information:\n" +
      "- [Practitioner Note] = highest authority — reflects clinical judgment\n" +
      "- [Call Transcript] = high authority — patients are more honest and detailed in conversation\n" +
      "- [Lab Report] = high authority — objective clinical data\n" +
      "- [Uploaded PDF] / [Uploaded Document] = standard authority\n\n" +
      "When transcript or note observations conflict with or add nuance to the " +
      "structured intake form, trust the transcript/note."
    );
    for (let i = 0; i < documentTexts.length; i++) {
      const doc = documentTexts[i]!;
      const label = docTypeLabel(doc.docType, doc.filename);
      const nameNote = doc.filename ? ` (${doc.filename})` : "";
      sections.push(`\n### [${label}] Document ${i + 1}${nameNote}`);
      sections.push(doc.text.length > DOC_TEXT_CAP ? doc.text.slice(0, DOC_TEXT_CAP) + "\n...(truncated)" : doc.text);
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Clinical analysis (step 1)
// ---------------------------------------------------------------------------

export async function runClinicalAnalysis(
  timelineText: string,
  onProgress?: () => void,
): Promise<{ findings: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  console.log("[analysis] Using model:", MODEL, "max_tokens:", MAX_ANALYSIS_TOKENS);
  const result = await streamModel({
    model: MODEL,
    maxTokens: MAX_ANALYSIS_TOKENS,
    system: loadPrompt(CLINICAL_ANALYSIS_PROMPT),
    messages: [
      {
        role: "user",
        content:
          "Analyze the following patient data. Respond with JSON only per the output contract.\n\n<patient_data>\n" +
          timelineText +
          "\n</patient_data>",
      },
    ],
    timeoutMs: 600_000,
    onProgress,
  });

  console.log("[analysis] Complete — tokens in:", result.usage.inputTokens, "out:", result.usage.outputTokens);
  const findings = JSON.parse(stripCodeFences(result.text));
  const meta = {
    model_id: MODEL,
    prompt_version: CLINICAL_ANALYSIS_PROMPT,
    prompt_hash: promptHash(CLINICAL_ANALYSIS_PROMPT),
    token_usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
  };
  return { findings, meta, raw: result.text };
}

// ---------------------------------------------------------------------------
// Protocol generation (step 2)
// ---------------------------------------------------------------------------

export type ProtocolGenerationOptions = {
  confidenceCeiling?: "low" | "medium" | "high";
};

function buildDegradedConfidencePreamble(
  ceiling: Exclude<ProtocolGenerationOptions["confidenceCeiling"], "high" | undefined>,
): string {
  const label = ceiling === "medium" ? "moderate" : "low";
  return (
    `DEGRADED CONFIDENCE MODE (confidence_ceiling: ${label}) — apply FR-19 constraints:\n` +
    "- Do not assert specific supplement dosages; use cautious ranges or defer to practitioner judgment.\n" +
    "- Limit scope to foundational-layer interventions; defer advanced optimization.\n" +
    "- Include a clear uncertainty banner in both clinical_protocol and client_action_plan.\n\n"
  );
}

export async function runProtocolGeneration(
  findings: Record<string, unknown>,
  kbContext?: Array<Record<string, unknown>>,
  onProgress?: () => void,
  options?: ProtocolGenerationOptions,
): Promise<{ protocol: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  const ceiling = options?.confidenceCeiling;
  let userContent =
    (ceiling && ceiling !== "high" ? buildDegradedConfidencePreamble(ceiling) : "") +
    "Produce the clinical protocol AND phased client action plan for this patient based on the analysis below. Respond with JSON only per the output contract.\n\n<analysis>\n" +
    JSON.stringify(findings) +
    "\n</analysis>";

  if (kbContext && kbContext.length > 0) {
    userContent += "\n\n" + formatKbContext(kbContext);
  }

  console.log("[protocol] Using model:", MODEL, "max_tokens:", MAX_PROTOCOL_TOKENS);
  const result = await streamModel({
    model: MODEL,
    maxTokens: MAX_PROTOCOL_TOKENS,
    system: loadPrompt(PROTOCOL_GENERATION_PROMPT),
    messages: [{ role: "user", content: userContent }],
    timeoutMs: 600_000,
    onProgress,
    salvageOnTruncate: true,
  });

  console.log("[protocol] Complete — tokens in:", result.usage.inputTokens, "out:", result.usage.outputTokens);
  const wasTruncated = result.truncated;
  if (wasTruncated) {
    console.warn("[protocol] Output was truncated at", result.usage.outputTokens, "tokens — attempting to salvage JSON");
  }

  const protocol = JSON.parse(stripCodeFences(result.rawText));

  // Check for missing/incomplete sections when truncated
  const expectedSections = [
    "title",
    "clinical_protocol",
    "client_action_plan",
  ];
  const expectedClinicalKeys = [
    "systems_analysis",
    "daily_protocol",
    "supplement_protocol",
    "dietary_recommendations",
    "lifestyle_recommendations",
    "clinical_reasoning",
    "safety_review",
  ];
  const expectedClientKeys = ["intro", "layers", "disclaimer"];

  let missingSections: string[] = [];
  if (wasTruncated) {
    for (const s of expectedSections) {
      if (!(s in protocol)) missingSections.push(s);
    }
    const cp = protocol.clinical_protocol as Record<string, unknown> | undefined;
    if (cp) {
      for (const k of expectedClinicalKeys) {
        if (!(k in cp)) missingSections.push(`clinical_protocol.${k}`);
      }
    }
    const cap = protocol.client_action_plan as Record<string, unknown> | undefined;
    if (cap) {
      for (const k of expectedClientKeys) {
        if (!(k in cap)) missingSections.push(`client_action_plan.${k}`);
      }
      // Check if layers array seems complete
      const layers = cap.layers as unknown[];
      if (Array.isArray(layers) && layers.length > 0) {
        const lastLayer = layers[layers.length - 1] as Record<string, unknown> | undefined;
        if (lastLayer && !lastLayer.expected_outcomes) {
          missingSections.push(`client_action_plan.layers[${layers.length - 1}] (incomplete)`);
        }
      }
    }
    if (missingSections.length > 0) {
      console.warn("[protocol] Truncation caused missing sections:", missingSections);
    }
  }

  const meta = {
    model_id: MODEL,
    prompt_version: PROTOCOL_GENERATION_PROMPT,
    prompt_hash: promptHash(PROTOCOL_GENERATION_PROMPT),
    token_usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
    kb_context_size: kbContext?.length ?? 0,
    truncated: wasTruncated,
    ...(ceiling ? { confidence_ceiling: ceiling } : {}),
    ...(missingSections.length > 0 ? { missing_sections: missingSections } : {}),
  };
  return { protocol, meta, raw: result.rawText };
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
// Pre-call prep brief
// ---------------------------------------------------------------------------


export async function generatePrepBrief(
  timelineText: string,
  onProgress?: () => void,
): Promise<{ brief: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  const result = await streamModel({
    model: MODEL,
    maxTokens: 8000,
    system: loadPrompt(PREP_BRIEF_PROMPT),
    messages: [
      {
        role: "user",
        content:
          "Generate a pre-call prep brief for the following patient. Respond with JSON only.\n\n<patient_data>\n" +
          timelineText +
          "\n</patient_data>",
      },
    ],
    timeoutMs: 600_000,
    onProgress,
  });

  const brief = JSON.parse(stripCodeFences(result.text));
  const meta = {
    model_id: MODEL,
    prompt_version: PREP_BRIEF_PROMPT,
    prompt_hash: promptHash(PREP_BRIEF_PROMPT),
    token_usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
  };
  return { brief, meta, raw: result.text };
}

// ---------------------------------------------------------------------------
// Knowledge base search (Postgres full-text search — no embedding dep)
// ---------------------------------------------------------------------------

function buildSearchQuery(findings: Record<string, unknown>): string {
  const terms: string[] = [];
  const cp = (findings.clinical_picture ?? {}) as Record<string, unknown>;
  for (const p of (cp.chief_patterns ?? []) as string[]) terms.push(p);
  for (const s of (cp.presenting_symptoms ?? []) as string[]) terms.push(s);
  for (const sa of (findings.systems_analysis ?? []) as Record<string, unknown>[]) {
    if (sa.system) terms.push(String(sa.system));
    for (const f of (sa.findings ?? []) as string[]) terms.push(f);
  }
  for (const lf of (findings.key_lab_findings ?? []) as Record<string, unknown>[]) {
    if (lf.test_name) terms.push(String(lf.test_name));
  }
  const seq = (findings.clinical_sequencing ?? {}) as Record<string, unknown>;
  for (const a of (seq.address_first ?? []) as string[]) terms.push(a);
  // Extract meaningful words, deduplicate, limit size
  const words = terms
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .filter((w) => !["the", "and", "for", "with", "this", "that", "from", "are", "not", "but"].includes(w));
  const unique = [...new Set(words)].slice(0, 30);
  return unique.join(" | ");
}

export async function searchKnowledgeBase(
  tenantId: string,
  findings: Record<string, unknown>,
  limit: number = 12,
): Promise<Array<Record<string, unknown>>> {
  const query = buildSearchQuery(findings);
  if (!query) return [];

  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      category: string;
      title: string;
      content: string;
      metadata: Record<string, unknown>;
      source_channel: string;
      rank: number;
    }>(
      `SELECT id, category, title, content, metadata, source_channel,
              ts_rank_cd(
                to_tsvector('english', title || ' ' || content || ' ' || COALESCE(metadata->>'clinical_reasoning', '')),
                to_tsquery('english', $1)
              ) AS rank
         FROM clinical_knowledge
        WHERE to_tsvector('english', title || ' ' || content || ' ' || COALESCE(metadata->>'clinical_reasoning', ''))
              @@ to_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
      [query, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      source_channel: r.source_channel,
      rank: r.rank,
    }));
  });
}

// ---------------------------------------------------------------------------
// Orchestration — full analyze → generate pipeline
// ---------------------------------------------------------------------------

export async function analyzeAndGenerate(args: {
  tenantId: string;
  patientId: string;
  practitionerId: string;
  confidenceCeiling?: ProtocolGenerationOptions["confidenceCeiling"];
}): Promise<{ analysisId: string; protocolId: string }> {
  const timeline = await gatherPatientTimeline(args.tenantId, args.patientId);

  // Include uploaded documents (transcripts, notes, PDFs) in the analysis
  let docs: DocWithMeta[] = [];
  try {
    docs = await getDocumentTexts(args.tenantId, args.patientId);
  } catch { /* non-fatal */ }

  const timelineText = formatTimelineForPrompt(timeline, docs);

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

  // Query knowledge base for relevant clinical insights
  let kbContext: Array<Record<string, unknown>> = [];
  try {
    kbContext = await searchKnowledgeBase(args.tenantId, findings, KB_CONTEXT_LIMIT);
  } catch {
    // Non-fatal: generate without KB if search fails
  }

  const { protocol, meta: pMeta } = await runProtocolGeneration(
    findings,
    kbContext.length > 0 ? kbContext : undefined,
    undefined,
    { confidenceCeiling: args.confidenceCeiling },
  );

  const title = (protocol.title as string) || "Draft Protocol";
  const clinicalContent = (protocol.clinical_protocol ?? {}) as Record<string, unknown>;
  const clientContent = (protocol.client_action_plan ?? {}) as Record<string, unknown>;
  (clinicalContent as Record<string, unknown>)._generation = {
    ...pMeta,
    ...(protocol.meta ? { model_meta: protocol.meta } : {}),
    ...(kbContext.length > 0
      ? {
          kb_sources: kbContext.map((k) => ({
            id: k.id,
            title: k.title,
            category: k.category,
            source_channel: k.source_channel,
            rank: k.rank,
          })),
        }
      : {}),
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
