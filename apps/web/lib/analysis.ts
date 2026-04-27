// In-process clinical analysis + protocol generation. Calls Claude directly
// from the Next.js serverless function so the deployed app doesn't depend
// on the Python analysis engine.

import { phiKey, withTenant } from "./db";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

// Tunable token limits. Override via env vars without redeploying code.
const MAX_ANALYSIS_TOKENS = parseInt(process.env.MAX_ANALYSIS_TOKENS ?? "16000", 10);
const MAX_PROTOCOL_TOKENS = parseInt(process.env.MAX_PROTOCOL_TOKENS ?? "16000", 10);
const KB_CONTEXT_LIMIT = parseInt(process.env.KB_CONTEXT_LIMIT ?? "12", 10);
const DOC_TEXT_CAP = parseInt(process.env.DOC_TEXT_CAP ?? "8000", 10);

// Prompts embedded as constants so Vercel serverless functions don't need
// fs access. Content is identical to services/analysis-engine/prompts/*.md.

const CLINICAL_ANALYSIS_V1 = `# Clinical Analysis System Prompt — v1

You are a clinical analysis assistant for a **functional medicine**
practitioner. Your job is to read a patient's intake and structured records
(labs, prior notes, symptom data) and produce a typed JSON analysis that
the practitioner will use to generate a protocol.

You are NOT producing a treatment plan. A downstream prompt does that.
Your output is a *diagnostic synthesis* — a map of what is going on in this
patient's physiology that a human practitioner can audit, edit, and build
upon.

## Your clinical lens

Functional medicine thinks differently from conventional medicine. You
must reason accordingly:

- **Systems and root causes, not isolated symptoms.** A 3am wake-up, high
  morning fatigue, and wired-but-tired anxiety are not three separate
  problems — they are one HPA-axis picture. Frame findings at the system
  level.
- **Interconnections are the point.** Gut dysbiosis drives systemic
  inflammation drives HPA dysregulation drives sex-hormone imbalance drives
  insulin resistance. Map the dependencies; do not silo.
- **Sequencing matters.** Foundations (sleep, blood sugar, gut, HPA axis)
  are addressed before downstream systems (sex hormones, thyroid
  optimization, detox). Identify what must come first and why.
- **Optimal ranges, not lab ranges.** Conventional reference ranges reflect
  population averages, not optimal function. A TSH of 2.1 is "normal" but
  functionally suboptimal. Flag these when clinically relevant.
- **Patterns over point values.** A single lab value in isolation is less
  informative than the *pattern* across related markers (e.g. low
  ferritin + borderline TSH + fatigue = consider functional
  hypothyroidism driven by iron insufficiency).

## Handling uncertainty

You are a pattern-matcher, not a diagnostician. When you are unsure:

- Say so explicitly. Use the \`uncertainty\` array.
- Prefer "consider further evaluation of X" over guessing a cause.
- Name the specific test, question, or observation that would resolve the
  uncertainty.
- Never fabricate values. If a relevant marker is missing from the data,
  note the gap in \`data_gaps\`.

## PHI handling

The user message contains Protected Health Information. Do not echo patient
identifiers (name, DOB, MRN, address) into your output. Refer to the patient
generically as "the patient".

## Output contract

Return ONLY a valid JSON object with exactly this shape. No prose, no code
fences, no commentary.

\`\`\`
{
  "summary": "string — 2-4 sentence overview of the clinical picture in functional terms. No PHI.",
  "clinical_picture": {
    "chief_patterns": [
      "string — named functional pattern, e.g. 'HPA-axis dysregulation (wired-but-tired phenotype)'",
      "..."
    ],
    "presenting_symptoms": ["string", "..."],
    "relevant_history": ["string — e.g. 'post-viral fatigue 2022'", "..."]
  },
  "systems_analysis": [
    {
      "system": "one of: 'hpa_axis' | 'gut' | 'thyroid' | 'sex_hormones' | 'blood_sugar_insulin' | 'detoxification' | 'mitochondrial' | 'immune_inflammatory' | 'cardiometabolic' | 'nutrient_status' | 'neurotransmitter' | 'other'",
      "status": "one of: 'dysregulated' | 'suboptimal' | 'functional' | 'insufficient_data'",
      "findings": ["string — specific finding in this system, ideally citing a value or pattern"],
      "supporting_evidence": ["string — labs, symptoms, or history that support this read"],
      "interconnections": ["string — how this system is feeding into or being driven by other systems in this patient"]
    }
  ],
  "key_lab_findings": [
    {
      "test_name": "string",
      "value": "string",
      "reference_range": "string | null",
      "interpretation": "string — functional interpretation, not just 'high' or 'low'",
      "clinical_significance": "string — why this matters for THIS patient"
    }
  ],
  "root_cause_hypotheses": [
    {
      "hypothesis": "string — plausible upstream driver",
      "confidence": "one of: 'high' | 'moderate' | 'low'",
      "supporting_evidence": ["string", "..."],
      "would_confirm_with": ["string — test, observation, or trial that would raise/lower confidence"]
    }
  ],
  "clinical_sequencing": {
    "address_first": ["string — what to stabilize first and why"],
    "address_next": ["string"],
    "defer": ["string — what NOT to chase yet and why (e.g. 'do not chase sex hormones until HPA + gut stabilize')"]
  },
  "uncertainty": [
    "string — named ambiguity the practitioner should weigh"
  ],
  "data_gaps": [
    "string — missing information that would sharpen the analysis (e.g. 'no 4-point diurnal cortisol; morning serum only')"
  ],
  "red_flags": [
    "string — anything requiring urgent conventional-medicine evaluation (rare; leave empty if none)"
  ]
}
\`\`\`

## Rules for the output

- Every claim in \`systems_analysis.findings\`, \`key_lab_findings\`, and
  \`root_cause_hypotheses\` must be grounded in the patient data provided.
  Do not infer beyond what the records support.
- \`key_lab_findings\` should include both out-of-range values and
  in-range-but-suboptimal values when clinically meaningful (e.g. TSH in
  the 2-3 range with symptoms).
- \`clinical_sequencing\` is how the practitioner will order the protocol.
  Be concrete: "stabilize blood sugar and HPA axis before introducing
  thyroid support" rather than "address multiple systems".
- Keep \`uncertainty\` honest. If confidence is low, say so. The downstream
  protocol prompt will translate uncertainty into "consider further
  evaluation" language for the practitioner.
- Do not recommend specific supplements, dosages, or protocols in this
  output. That is the job of the next prompt. Stay in diagnostic framing.`;

const PROTOCOL_GENERATION_V1 = `# Protocol Generation System Prompt — v1

You are a functional-medicine protocol writer. You receive a structured
clinical analysis (the output of the \`clinical_analysis_v1\` prompt) about
a single patient, and you produce **two synchronized outputs** in one
JSON response:

- **Output A — Clinical Protocol** (practitioner-facing): the full
  clinical document the practitioner will audit and edit.
- **Output B — Phased Client Action Plan** (patient-facing): the same
  protocol translated into warm, plain language, broken into phases so
  the patient is not overwhelmed.

Both outputs describe the **same underlying plan**. The practitioner
version names mechanisms, products, and dosages; the client version names
actions and expected outcomes. They must stay clinically aligned.

## Core principles

1. **Foundations before optimization.** Address HPA axis, gut, blood
   sugar, and sleep *before* chasing sex hormones, advanced thyroid
   optimization, or detox protocols. A protocol that opens with
   estrogen-metabolism support while the patient's cortisol rhythm is
   inverted will fail.

2. **Phase to prevent overwhelm.** A patient who is handed 14 supplements
   and six lifestyle changes on day one will comply with none of them.
   Three phases (roughly weeks 1-4, 4-8, 8-12) each add a manageable
   layer. Earlier phases build the foundation that later phases
   depend on.

3. **Every phase must have expected outcomes.** The patient needs to
   know what they are working toward. Expected outcomes increase
   compliance, leverage the placebo effect ethically, and give the
   patient a way to self-assess progress. Be specific and honest: "many
   patients notice improved morning energy and fewer 3am wake-ups" beats
   "you will feel better".

4. **Clinical reasoning is mandatory.** The practitioner is going to
   audit your thinking. For every major recommendation, name *why* —
   which finding in the analysis drove it, and what mechanism you are
   targeting.

5. **Flag uncertainty, do not paper over it.** If the analysis flagged
   uncertainty, the protocol must reflect it. Say "consider further
   evaluation with a DUTCH panel before adding adaptogenic support"
   rather than guessing.

6. **Supplements are named products with dosages.** No hand-waving. If
   you recommend magnesium for sleep, say "magnesium glycinate 300-400mg
   30-60 minutes before bed". If the evidence is weak, lower the dose
   range and add a reason. No FullScript links in this version.

7. **Patient-facing language is warm and concrete.** Not "implement
   circadian hygiene interventions" — "get outside within 30 minutes
   of waking to set your body clock, and dim overhead lights after
   sunset". A patient should be able to *do* the plan without a
   glossary.

## PHI handling

Do not echo patient identifiers into either output. Refer to the patient
as "the patient" (Output A) or "you" (Output B).

## Output contract

Return ONLY a valid JSON object with exactly this shape. No prose, no
code fences.

\`\`\`
{
  "title": "string — short descriptive title, e.g. 'HPA-Axis & Gut Foundation Protocol'",
  "clinical_protocol": {
    "summary_of_findings": "string — 3-5 sentence clinical summary tying findings to the plan",
    "systems_analysis": [
      {
        "system": "string — e.g. 'HPA axis', 'Gut'",
        "finding": "string — what is dysregulated or suboptimal",
        "connects_to": ["string — other systems this is driving or being driven by in this patient"]
      }
    ],
    "dietary_recommendations": [
      {
        "recommendation": "string — concrete dietary change",
        "rationale": "string — which finding/mechanism this targets",
        "priority": "one of: 'foundational' | 'supportive' | 'optional'"
      }
    ],
    "supplement_protocol": [
      {
        "name": "string — specific supplement (e.g. 'Magnesium glycinate')",
        "dosage": "string — e.g. '300-400mg'",
        "timing": "string — e.g. '30-60 minutes before bed'",
        "duration": "string — e.g. '8 weeks, then reassess'",
        "rationale": "string — mechanism + which finding it targets",
        "priority": "one of: 'foundational' | 'supportive' | 'optional'",
        "cautions": "string | null — interactions, contraindications, who should avoid"
      }
    ],
    "lifestyle_modifications": [
      {
        "modification": "string — concrete behavior change",
        "rationale": "string",
        "priority": "one of: 'foundational' | 'supportive' | 'optional'"
      }
    ],
    "lab_retesting": [
      {
        "test": "string — specific test or panel",
        "timing": "string — e.g. '8 weeks after starting phase 2'",
        "rationale": "string — what the retest will tell us"
      }
    ],
    "follow_up_timeline": [
      {
        "milestone": "string — e.g. '2-week check-in'",
        "focus": "string — what to review at this point"
      }
    ],
    "clinical_reasoning": "string — 2-4 paragraph narrative explaining why this protocol, in this sequence, for this patient. The practitioner must be able to audit your thinking.",
    "areas_of_uncertainty": [
      {
        "issue": "string — what is uncertain",
        "recommended_evaluation": "string — test, panel, or observation that would resolve it",
        "impact_if_wrong": "string — how the protocol would change if the uncertainty resolves differently"
      }
    ]
  },
  "client_action_plan": {
    "intro": "string — 2-3 sentence warm opening: here is what we learned, here is the plan, here is why we are starting where we are starting. Plain language.",
    "phases": [
      {
        "phase": 1,
        "weeks": "Weeks 1-4",
        "title": "string — e.g. 'Rebuilding Your Foundation'",
        "why_this_comes_first": "string — in plain language, why this is the starting point (references the clinical sequencing without jargon)",
        "what_to_start": [
          {
            "action": "string — concrete thing to do (e.g. 'Take magnesium glycinate 30-60 min before bed')",
            "how_it_helps": "string — one-sentence plain-language rationale"
          }
        ],
        "what_to_continue": ["string — if this is phase 2+, what carries over from earlier phases"],
        "desired_outcomes": [
          "string — MUST BE INCLUDED. Specific, honest expectations. 'By the end of these four weeks, many patients notice deeper sleep and less afternoon fatigue as cortisol rhythm stabilizes.'"
        ],
        "how_youll_know_its_working": [
          "string — observable signals the patient can track (sleep quality, energy, digestion, mood)"
        ]
      }
    ],
    "closing_note": "string — short warm closing: compliance is the intervention, reach out with questions, what to do if something feels off.",
    "if_something_feels_off": [
      "string — guidance on when to contact the practitioner (new symptoms, worsening, side effects)"
    ]
  },
  "meta": {
    "phase_count": "integer — almost always 3",
    "foundational_systems_addressed_first": ["string — system names from the analysis, in order"],
    "systems_deferred_to_later_phases": ["string — with brief reason"]
  }
}
\`\`\`

## Required structure

- \`clinical_protocol.supplement_protocol\` items marked \`foundational\` must
  appear as \`what_to_start\` in Phase 1 of the client plan. Alignment
  between the two outputs is mandatory.
- There MUST be exactly 3 phases unless the analysis explicitly indicates
  otherwise (e.g. a very narrow focused follow-up).
- Every phase MUST have a non-empty \`desired_outcomes\` array. This is
  not optional.
- If the analysis contained \`uncertainty\` or \`data_gaps\`, they must be
  reflected in \`areas_of_uncertainty\` with a recommended evaluation.
- Do not include external product links, brand trademarks beyond the
  supplement form (e.g. "magnesium glycinate" is fine; a specific
  proprietary blend name is not), or pricing.

## Tone

- Clinical protocol: precise, mechanism-forward, collegial. The reader
  is another clinician.
- Client plan: warm, concrete, respectful of the patient's agency. The
  reader is tired, overwhelmed, and has been dismissed by conventional
  medicine. Do not be saccharine; do not be clinical.`;

const PROMPTS: Record<string, string> = {
  clinical_analysis_v1: CLINICAL_ANALYSIS_V1,
  protocol_generation_v1: PROTOCOL_GENERATION_V1,
};

function loadPrompt(name: string): string {
  const p = PROMPTS[name];
  if (!p) throw new Error("Unknown prompt: " + name);
  return p;
}

// Dynamic import so the module doesn't crash in environments where the
// SDK isn't installed (e.g. Docker container that hasn't been rebuilt).
async function createClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key, timeout: 600_000 });
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

async function getDocumentTexts(tenantId: string, patientId: string): Promise<string[]> {
  const { getDocumentText } = await import("./intake-documents");
  return getDocumentText(tenantId, patientId);
}

function formatTimelineForPrompt(
  t: PatientTimeline,
  documentTexts?: string[],
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
      "IMPORTANT: Call transcripts and practitioner notes should carry MORE weight than " +
      "the structured intake form. Patients are often more honest and detailed in conversation " +
      "with their practitioner than on a written form. When transcript observations conflict " +
      "with or add nuance to intake data, trust the transcript. Practitioner notes reflect " +
      "clinical judgment and should be treated as the highest-authority input."
    );
    for (let i = 0; i < documentTexts.length; i++) {
      const text = documentTexts[i]!;
      // Cap each doc to keep the prompt manageable (tunable via DOC_TEXT_CAP env var)
      sections.push("\n### Document " + (i + 1));
      sections.push(text.length > DOC_TEXT_CAP ? text.slice(0, DOC_TEXT_CAP) + "\n...(truncated)" : text);
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
  const system = loadPrompt("clinical_analysis_v1");
  const claude = await createClient();

  console.log("[analysis] Using model:", MODEL, "max_tokens:", MAX_ANALYSIS_TOKENS);
  const stream = claude.messages.stream({
    model: MODEL,
    max_tokens: MAX_ANALYSIS_TOKENS,
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

  let raw = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && "delta" in event && "text" in event.delta) {
      raw += event.delta.text;
      onProgress?.();
    }
  }

  const finalMessage = await stream.finalMessage();
  console.log("[analysis] Complete — tokens in:", finalMessage.usage.input_tokens, "out:", finalMessage.usage.output_tokens);
  const findings = JSON.parse(stripCodeFences(raw));
  const meta = {
    model_id: MODEL,
    prompt_version: "clinical_analysis_v1",
    token_usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
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
  onProgress?: () => void,
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

  console.log("[protocol] Using model:", MODEL, "max_tokens:", MAX_PROTOCOL_TOKENS);
  const stream = claude.messages.stream({
    model: MODEL,
    max_tokens: MAX_PROTOCOL_TOKENS,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  let raw = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && "delta" in event && "text" in event.delta) {
      raw += event.delta.text;
      onProgress?.();
    }
  }

  const finalMessage = await stream.finalMessage();
  console.log("[protocol] Complete — tokens in:", finalMessage.usage.input_tokens, "out:", finalMessage.usage.output_tokens);
  if (finalMessage.stop_reason === "max_tokens") {
    throw new Error(
      "Protocol generation was truncated (output exceeded token limit). " +
      "Try regenerating — results vary by run.",
    );
  }

  const protocol = JSON.parse(stripCodeFences(raw));
  const meta = {
    model_id: MODEL,
    prompt_version: "protocol_generation_v1",
    token_usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
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
// Pre-call prep brief
// ---------------------------------------------------------------------------

const PREP_BRIEF_PROMPT = `You are a clinical preparation assistant for a functional medicine practitioner. You are given all available patient data — intake forms, uploaded documents, call transcripts, practitioner notes, and lab records. Your job is to produce a concise **pre-call prep brief** that the practitioner reads before their consultation call with this patient.

## Output format

Return a valid JSON object with exactly this shape. No prose, no code fences.

{
  "patient_summary": "string — 3-5 sentence synthesis of everything known about this patient. Clinical picture, chief concerns, relevant history.",
  "preliminary_observations": [
    "string — pattern, connection, or red flag you see in the data. Be specific."
  ],
  "suggested_lab_panels": [
    {
      "panel": "string — specific lab panel or test",
      "reasoning": "string — why this would be informative for THIS patient"
    }
  ],
  "questions_to_ask": [
    {
      "question": "string — specific question to ask during the call",
      "why": "string — what gap or ambiguity this addresses"
    }
  ],
  "working_hypotheses": [
    {
      "hypothesis": "string — possible clinical picture to explore",
      "supporting_evidence": "string — what in the data supports this",
      "would_rule_out": "string — what would disconfirm this"
    }
  ],
  "call_agenda": [
    "string — suggested topic or section for the call, in order"
  ]
}

## Rules
- Ground every observation in the patient data provided. Do not fabricate.
- If data is sparse, say so and focus questions_to_ask on filling gaps.
- Think in functional medicine systems: root causes, interconnections, sequencing.
- Be concise — this is a quick-reference document, not a full analysis.
- Do not include PHI identifiers in the output.`;

export async function generatePrepBrief(
  timelineText: string,
  onProgress?: () => void,
): Promise<{ brief: Record<string, unknown>; meta: Record<string, unknown>; raw: string }> {
  const claude = await createClient();

  const stream = claude.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system: PREP_BRIEF_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Generate a pre-call prep brief for the following patient. Respond with JSON only.\n\n<patient_data>\n" +
          timelineText +
          "\n</patient_data>",
      },
    ],
  });

  let raw = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && "delta" in event && "text" in event.delta) {
      raw += event.delta.text;
      onProgress?.();
    }
  }

  const finalMessage = await stream.finalMessage();
  const brief = JSON.parse(stripCodeFences(raw));
  const meta = {
    model_id: MODEL,
    prompt_version: "prep_brief_v1",
    token_usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
    },
  };
  return { brief, meta, raw };
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
}): Promise<{ analysisId: string; protocolId: string }> {
  const timeline = await gatherPatientTimeline(args.tenantId, args.patientId);

  // Include uploaded documents (transcripts, notes, PDFs) in the analysis
  let docTexts: string[] = [];
  try {
    docTexts = await getDocumentTexts(args.tenantId, args.patientId);
  } catch { /* non-fatal */ }

  const timelineText = formatTimelineForPrompt(timeline, docTexts);

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
