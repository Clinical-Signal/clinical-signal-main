/**
 * Post-generation safety validation pass.
 *
 * After a protocol is generated, this module runs a second AI call that
 * cross-checks every recommended supplement and intervention against:
 *   - Patient's current medications (drug-supplement interactions)
 *   - Allergies and sensitivities
 *   - Pregnancy/nursing/TTC status
 *   - Red-flag lab values requiring conventional referral
 *   - Dose ceiling violations
 *
 * Returns structured warnings the practitioner sees before approving.
 * This is a safety net — the protocol prompt already checks these, but
 * a dedicated validation pass catches what the first pass might miss.
 */

import { callModel, loadPrompt, stripCodeFences } from "./llm";

const SAFETY_MODEL = "claude-sonnet-4-5-20250929";
const MAX_SAFETY_TOKENS = 4000;
const PROMPT_VERSION = "safety_validation_v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SafetySeverity = "critical" | "warning" | "info";

export interface SafetyWarning {
  severity: SafetySeverity;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  supplements_involved: string[];
  medications_involved: string[];
}

export interface SafetyValidationResult {
  warnings: SafetyWarning[];
  passed: boolean;
  summary: string;
  meta: {
    model_id: string;
    prompt_version: string;
    token_usage: { input_tokens: number; output_tokens: number };
    validated_at: string;
  };
}

// ---------------------------------------------------------------------------
// Validation function
// ---------------------------------------------------------------------------

/**
 * Run a safety validation pass on a generated protocol.
 * Called after protocol generation, before the practitioner sees the result.
 */
export async function runSafetyValidation(
  findings: Record<string, unknown>,
  protocol: Record<string, unknown>,
): Promise<SafetyValidationResult> {
  // Extract just the safety-relevant parts to keep input small
  const safetyContext = {
    current_medications: findings.current_medications ?? [],
    safety_considerations: findings.safety_considerations ?? {},
    red_flags: findings.red_flags ?? [],
    allergies: (findings.safety_considerations as Record<string, unknown>)?.allergies ?? [],
  };

  const clinicalProtocol = protocol.clinical_protocol as Record<string, unknown> | undefined;
  const protocolContext = {
    supplement_protocol: clinicalProtocol?.supplement_protocol ?? [],
    daily_protocol: clinicalProtocol?.daily_protocol ?? {},
    dietary_recommendations: clinicalProtocol?.dietary_recommendations ?? [],
    safety_review: clinicalProtocol?.safety_review ?? {},
  };

  const userContent =
    "Review this protocol for safety issues. Check every supplement against the patient's medications, allergies, and safety flags. Respond with JSON only.\n\n" +
    "<patient_safety_data>\n" +
    JSON.stringify(safetyContext, null, 2) +
    "\n</patient_safety_data>\n\n" +
    "<protocol>\n" +
    JSON.stringify(protocolContext, null, 2) +
    "\n</protocol>";

  console.log("[safety-validation] Starting safety check");
  const t0 = Date.now();

  const response = await callModel({
    model: SAFETY_MODEL,
    maxTokens: MAX_SAFETY_TOKENS,
    system: loadPrompt(PROMPT_VERSION),
    messages: [{ role: "user", content: userContent }],
    timeoutMs: 120_000,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[safety-validation] Complete in", elapsed + "s");

  const parsed = JSON.parse(stripCodeFences(response.text)) as {
    warnings: SafetyWarning[];
    passed: boolean;
    summary: string;
  };

  const result: SafetyValidationResult = {
    warnings: parsed.warnings ?? [],
    passed: parsed.passed ?? parsed.warnings?.length === 0,
    summary: parsed.summary ?? "Safety validation completed",
    meta: {
      model_id: SAFETY_MODEL,
      prompt_version: PROMPT_VERSION,
      token_usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
      },
      validated_at: new Date().toISOString(),
    },
  };

  const criticalCount = result.warnings.filter((w) => w.severity === "critical").length;
  const warningCount = result.warnings.filter((w) => w.severity === "warning").length;
  console.log(
    "[safety-validation] Result:",
    criticalCount, "critical,",
    warningCount, "warnings,",
    result.warnings.length - criticalCount - warningCount, "info",
  );

  return result;
}
