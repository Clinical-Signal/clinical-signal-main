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

const SAFETY_MODEL = "claude-sonnet-4-5-20250929";
const MAX_SAFETY_TOKENS = 4000;

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
// Prompt
// ---------------------------------------------------------------------------

const SAFETY_VALIDATION_PROMPT = `You are a clinical safety reviewer for a functional medicine protocol. You receive:

1. The clinical analysis (which includes current_medications, safety_considerations, red_flags)
2. The generated protocol (supplement_protocol, daily_protocol, dietary_recommendations)

Your ONLY job is to check for safety issues. You are NOT evaluating clinical quality, therapeutic relevance, or protocol structure. You are looking for things that could HARM the patient.

## What to check

### 1. Drug-supplement interactions
Cross-reference EVERY supplement in the protocol against the patient's current_medications. Flag:
- Blood thinners (Warfarin, Eliquis, Plavix) + fish oil, Vitamin E, high-dose garlic, ginkgo, nattokinase, turmeric/curcumin
- SSRIs/SNRIs + 5-HTP, St. John's Wort, high-dose SAMe (serotonin syndrome risk — this is CRITICAL)
- Thyroid medication (Synthroid/levothyroxine) + calcium, iron, magnesium if timing separation is not specified
- Blood pressure medications + CoQ10, hawthorn, high-dose magnesium (potentiation risk)
- Immunosuppressants + immune-stimulating herbs (echinacea, astragalus, medicinal mushrooms)
- Statins + red yeast rice (contains lovastatin — doubled statin dose), CoQ10 depletion not addressed
- Metformin + B12 depletion not addressed
- PPIs + B12, magnesium, calcium depletion not addressed
- Birth control + St. John's Wort (reduces efficacy), B vitamin depletion not addressed
- Lithium + any supplement affecting sodium/fluid balance
- MAOIs + tyramine-containing supplements, high-dose tryptophan
- Anticoagulants + any supplement with antiplatelet activity

### 2. Allergen/sensitivity conflicts
Check every supplement against the patient's reported allergies and sensitivities:
- Shellfish allergy → glucosamine from shellfish
- Soy sensitivity → soy-derived phosphatidylserine, soy lecithin
- Dairy sensitivity → whey protein, casein-based supplements
- Gluten sensitivity → supplements not certified gluten-free when alternative exists
- Nightshade sensitivity → capsaicin, ashwagandha (nightshade family)

### 3. Pregnancy/nursing/TTC contraindications
If patient is pregnant, nursing, or trying to conceive, flag ANY of these:
- Berberine (contraindicated in pregnancy)
- High-dose Vitamin A (retinol >8,000 IU)
- Adaptogens with insufficient pregnancy safety data
- Antimicrobial herbs (oregano oil, wormwood, black walnut)
- High-dose caffeine/green tea extract
- Detox protocols (mobilize toxins that cross placenta)

### 4. Dose ceiling violations
Flag supplements that exceed safe upper limits without explicit justification:
- Vitamin D >5,000 IU/day without lab monitoring mentioned
- Vitamin A (retinol) >10,000 IU/day
- Zinc >40mg/day long-term
- Selenium >200mcg/day
- Iron supplementation without documented deficiency
- Vitamin B6 >100mg/day long-term (neuropathy risk)
- Magnesium >800mg/day total from supplements

### 5. Red-flag labs missed
If the analysis contains red_flags, verify the protocol addresses them appropriately (referral, not just supplements). Check if these critical values are in the data:
- Fasting glucose >126 mg/dL or HbA1c >6.5%
- TSH >10 or <0.1
- Unexplained weight loss >10% in 6 months
- Significantly abnormal liver or kidney function
- Severely abnormal CBC values

## Severity levels
- **critical**: Could cause immediate harm. Drug interaction with serotonin syndrome risk, contraindicated supplement in pregnancy, etc.
- **warning**: Could cause problems. Dose ceiling exceeded, potential interaction that may not be clinically significant but should be reviewed.
- **info**: Not harmful but worth noting. Nutrient depletion from medication not addressed, timing suggestion for absorption.

## Output contract

Return ONLY valid JSON with this shape:

{
  "warnings": [
    {
      "severity": "critical | warning | info",
      "category": "drug_interaction | allergen_conflict | pregnancy_contraindication | dose_ceiling | red_flag_missed | timing_conflict",
      "title": "string — short title, e.g. 'Fish oil + Warfarin interaction'",
      "detail": "string — explain what the risk is",
      "recommendation": "string — what to do (remove, adjust dose, add timing separation, add monitoring)",
      "supplements_involved": ["string — supplement names from the protocol"],
      "medications_involved": ["string — medication names from the analysis"]
    }
  ],
  "passed": "boolean — true if zero critical or warning items (info items are ok)",
  "summary": "string — one sentence: either 'No safety concerns identified' or 'Found N issues requiring practitioner review'"
}

## Rules
- If there are NO safety issues, return an empty warnings array and passed=true.
- Do not flag interactions that the protocol already addresses (e.g., timing separation already specified).
- Do not fabricate interactions. Only flag known, documented drug-supplement interactions.
- Be specific: name the exact supplement and medication, not "a supplement" and "a medication".
- This is a safety-only check. Do not comment on clinical quality, missing recommendations, or protocol structure.`;

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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const claude = new Anthropic({ apiKey: key, timeout: 120_000 });

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

  const response = await claude.messages.create({
    model: SAFETY_MODEL,
    max_tokens: MAX_SAFETY_TOKENS,
    system: SAFETY_VALIDATION_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("[safety-validation] Complete in", elapsed + "s");

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") {
      raw += block.text;
    }
  }

  // Strip code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
    cleaned = cleaned.replace(/\n```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned) as {
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
      prompt_version: "safety_validation_v1",
      token_usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
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
