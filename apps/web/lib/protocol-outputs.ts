// Protocol derivative output generation.
//
// When a practitioner approves a protocol, we auto-generate three outputs:
//   1. client_doc — standalone patient-friendly document (regenerated from
//      the approved/edited clinical protocol so edits are reflected)
//   2. call_deck — 5-7 slide content blocks for the practitioner call
//   3. follow_up_email — email draft summarizing the plan
//
// Each output is generated via a focused Claude prompt and stored in the
// protocol_outputs table.

import { withTenant } from "./db";
import { recordDerivativeGenerated } from "./timeline";
import { getActivePreferencesForPrompt } from "./preferences";

const MODEL = "claude-sonnet-4-5-20250929";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export type OutputType = "client_doc" | "call_deck" | "follow_up_email";
export type OutputStatus = "generating" | "complete" | "failed" | "regenerating";

export interface ProtocolOutput {
  id: string;
  protocolId: string;
  patientId: string;
  outputType: OutputType;
  content: Record<string, unknown>;
  status: OutputStatus;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

async function insertOutput(
  tenantId: string,
  protocolId: string,
  patientId: string,
  outputType: OutputType,
): Promise<string> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO protocol_outputs (tenant_id, protocol_id, patient_id, output_type, status)
       VALUES ($1, $2, $3, $4, 'generating')
       RETURNING id`,
      [tenantId, protocolId, patientId, outputType],
    );
    return rows[0]!.id;
  });
}

async function completeOutput(
  tenantId: string,
  outputId: string,
  content: Record<string, unknown>,
  meta: { modelId: string; promptVersion: string; tokenUsage: Record<string, unknown> },
): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE protocol_outputs
          SET content = $2::jsonb,
              model_id = $3,
              prompt_version = $4,
              token_usage = $5::jsonb,
              status = 'complete',
              completed_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [outputId, JSON.stringify(content), meta.modelId, meta.promptVersion, JSON.stringify(meta.tokenUsage)],
    );
  });
}

async function failOutput(tenantId: string, outputId: string, error: string): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE protocol_outputs
          SET status = 'failed', error_message = $2, updated_at = now()
        WHERE id = $1`,
      [outputId, error],
    );
  });
}

export async function getProtocolOutputs(
  tenantId: string,
  protocolId: string,
): Promise<ProtocolOutput[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      protocol_id: string;
      patient_id: string;
      output_type: OutputType;
      content: Record<string, unknown>;
      status: OutputStatus;
      error_message: string | null;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, protocol_id, patient_id, output_type, content, status,
              error_message, created_at, completed_at
         FROM protocol_outputs
        WHERE protocol_id = $1
        ORDER BY created_at`,
      [protocolId],
    );
    return rows.map((r) => ({
      id: r.id,
      protocolId: r.protocol_id,
      patientId: r.patient_id,
      outputType: r.output_type,
      content: r.content,
      status: r.status,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  });
}

// ---------------------------------------------------------------------------
// Claude client
// ---------------------------------------------------------------------------

async function createClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key, timeout: 300_000 });
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
// Prompts
// ---------------------------------------------------------------------------

const CLIENT_DOC_PROMPT = `You are a clinical communication specialist for a functional medicine practice. You receive an approved clinical protocol and transform it into a standalone, patient-friendly document.

This document will be given directly to the patient. It must:
- Use warm, clear, non-clinical language
- Be organized by daily routine (morning, meals, evening)
- Break the plan into manageable phases/layers
- Include specific, actionable instructions (not vague advice)
- Explain WHY each step matters in plain terms
- Include expected outcomes so the patient knows what to look for
- Include clear signals for when to move to the next phase
- End with encouragement and guidance on what to do if something feels off

Do NOT include clinical jargon, mechanism names, or practitioner-only notes.

Return ONLY valid JSON with this shape:
{
  "title": "string - friendly title for the document",
  "greeting": "string - warm 2-3 sentence opening",
  "layers": [
    {
      "layer": 1,
      "title": "string - friendly phase title",
      "why_this_comes_first": "string - plain language explanation",
      "daily_routine": {
        "morning": [{ "action": "string", "why": "string" }],
        "with_meals": [{ "action": "string", "why": "string" }],
        "evening": [{ "action": "string", "why": "string" }]
      },
      "what_to_continue": ["string - carryover from prior layers"],
      "what_to_expect": ["string - specific expected outcomes"],
      "signs_its_working": ["string - observable improvements"],
      "when_to_move_forward": "string - symptom-based criteria"
    }
  ],
  "foods_to_emphasize": ["string"],
  "foods_to_minimize": ["string"],
  "supplement_summary": [
    { "name": "string", "when": "string", "purpose": "string" }
  ],
  "closing": "string - warm closing with encouragement",
  "when_to_contact_us": ["string - guidance on reaching out"],
  "disclaimer": "This plan was developed by your practitioner with AI assistance. It is personalized guidance, not a substitute for medical advice. Always consult your healthcare provider before making changes to your health regimen."
}`;

const CALL_DECK_PROMPT = `You are a presentation specialist for a functional medicine practice. You receive an approved clinical protocol and create a call deck — a set of 5-7 content slides that the practitioner will walk through during their call with the patient.

Each slide should have a clear focus, be scannable at a glance, and support the practitioner's verbal delivery. Think of these as talking-point cards, not dense documents.

Return ONLY valid JSON with this shape:
{
  "title": "string - deck title",
  "slides": [
    {
      "slide_number": 1,
      "title": "string - slide heading",
      "type": "one of: 'overview' | 'findings' | 'plan' | 'actions' | 'supplements' | 'timeline' | 'next_steps'",
      "bullet_points": ["string - 3-6 scannable points"],
      "speaker_notes": "string - what the practitioner should say/emphasize for this slide"
    }
  ],
  "suggested_flow": "string - 2-3 sentence guidance on how to walk through the deck"
}

Slide structure should roughly follow:
1. Patient overview and what we learned
2. Key findings / root cause picture
3. The plan — what we're doing and why (Layer 1)
4. Daily routine breakdown
5. Supplement summary
6. What to expect and timeline
7. Next steps and follow-up`;

const EMAIL_DRAFT_PROMPT = `You are a communication specialist for a functional medicine practice. You receive an approved clinical protocol and draft a warm, professional follow-up email that the practitioner will send to the patient after their consultation call.

The email should:
- Reference key points from the protocol without being exhaustive
- Be warm and personal (not form-letter)
- Summarize what was discussed and the plan going forward
- Include clear next steps
- Be encouraging without being saccharine
- Be concise (aim for 200-300 words)

Return ONLY valid JSON with this shape:
{
  "subject_line": "string - email subject",
  "body": "string - full email body in plain text (use \\n for line breaks)",
  "closing": "string - sign-off line",
  "disclaimer_footer": "This communication contains personalized health guidance developed with AI assistance. It is not a substitute for professional medical advice."
}`;

// ---------------------------------------------------------------------------
// Generation functions
// ---------------------------------------------------------------------------

async function generateWithPrompt(
  systemPrompt: string,
  protocolContent: Record<string, unknown>,
  promptVersion: string,
  preferencesText?: string,
): Promise<{ content: Record<string, unknown>; meta: { modelId: string; promptVersion: string; tokenUsage: Record<string, unknown> } }> {
  const claude = await createClient();

  let fullSystemPrompt = systemPrompt;
  if (preferencesText) {
    fullSystemPrompt += "\n\n" + preferencesText;
  }

  const response = await claude.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: fullSystemPrompt,
    messages: [
      {
        role: "user",
        content:
          "Generate the output based on this approved clinical protocol. Respond with JSON only.\n\n<protocol>\n" +
          JSON.stringify(protocolContent, null, 2) +
          "\n</protocol>",
      },
    ],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const content = JSON.parse(stripCodeFences(raw));

  return {
    content,
    meta: {
      modelId: MODEL,
      promptVersion,
      tokenUsage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator — called from the approve endpoint
// ---------------------------------------------------------------------------

/**
 * Generate all three derivative outputs for an approved protocol.
 * Runs all three in parallel. Each output is independent — if one fails,
 * the others still complete.
 */
export async function generateDerivativeOutputs(args: {
  tenantId: string;
  protocolId: string;
  patientId: string;
  practitionerId: string;
  clinicalContent: Record<string, unknown>;
  clientContent: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, protocolId, patientId, practitionerId, clinicalContent, clientContent } = args;

  // Combine clinical + client content for the AI to work with
  const fullProtocol = {
    clinical_protocol: clinicalContent,
    client_action_plan: clientContent,
  };

  // Load practitioner preferences (non-fatal if it fails)
  let prefsText = "";
  try {
    prefsText = await getActivePreferencesForPrompt(tenantId, practitionerId);
  } catch (prefErr) {
    console.error("[protocol-outputs] Failed to load preferences (non-fatal):", prefErr);
  }

  const tasks: Array<{
    type: OutputType;
    prompt: string;
    promptVersion: string;
  }> = [
    { type: "client_doc", prompt: CLIENT_DOC_PROMPT, promptVersion: "client_doc_v1" },
    { type: "call_deck", prompt: CALL_DECK_PROMPT, promptVersion: "call_deck_v1" },
    { type: "follow_up_email", prompt: EMAIL_DRAFT_PROMPT, promptVersion: "follow_up_email_v1" },
  ];

  // Run all three in parallel
  await Promise.allSettled(
    tasks.map(async (task) => {
      const outputId = await insertOutput(tenantId, protocolId, patientId, task.type);
      try {
        const { content, meta } = await generateWithPrompt(task.prompt, fullProtocol, task.promptVersion, prefsText || undefined);
        await completeOutput(tenantId, outputId, content, meta);

        // Record in timeline (client_doc and call_deck have dedicated event types)
        if (task.type === "client_doc" || task.type === "call_deck") {
          await recordDerivativeGenerated(tenantId, patientId, protocolId, task.type);
        }

        console.log(`[protocol-outputs] ${task.type} generated for protocol ${protocolId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[protocol-outputs] ${task.type} failed:`, msg);
        await failOutput(tenantId, outputId, msg);
      }
    }),
  );
}
