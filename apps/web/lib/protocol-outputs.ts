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
import { callModel, loadPrompt, stripCodeFences } from "./llm";
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
// Generation function
// ---------------------------------------------------------------------------

async function generateWithPrompt(
  promptVersion: string,
  protocolContent: Record<string, unknown>,
  preferencesText?: string,
): Promise<{ content: Record<string, unknown>; meta: { modelId: string; promptVersion: string; tokenUsage: Record<string, unknown> } }> {
  let fullSystemPrompt = loadPrompt(promptVersion);
  if (preferencesText) {
    fullSystemPrompt += "\n\n" + preferencesText;
  }

  const response = await callModel({
    model: MODEL,
    maxTokens: 8000,
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
    timeoutMs: 300_000,
  });

  const content = JSON.parse(stripCodeFences(response.text));

  return {
    content,
    meta: {
      modelId: MODEL,
      promptVersion,
      tokenUsage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
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
    promptVersion: string;
  }> = [
    { type: "client_doc", promptVersion: "client_doc_v1" },
    { type: "call_deck", promptVersion: "call_deck_v1" },
    { type: "follow_up_email", promptVersion: "follow_up_email_v1" },
  ];

  // Run all three in parallel
  await Promise.allSettled(
    tasks.map(async (task) => {
      const outputId = await insertOutput(tenantId, protocolId, patientId, task.type);
      try {
        const { content, meta } = await generateWithPrompt(task.promptVersion, fullProtocol, prefsText || undefined);
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
