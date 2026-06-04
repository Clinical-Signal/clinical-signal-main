/**
 * Patient intake extensions (PRD §4.1).
 *
 * The `patients` table is owned by legacy SQL (`database/migrations/0002_core_schema.sql`).
 * Intake DDL lives in `drizzle/migrations/0001_intake_schema.sql`.
 *
 * ## `intake_status` (TEXT + CHECK)
 *
 * Tracks practitioner-facing intake lifecycle (not magic-link `intake_tokens.status`).
 */
export const intakeStatusValues = [
  "not_started",
  "step1_complete",
  "step2_complete",
  "labs_pending",
  "reviewed",
] as const;

export type IntakeStatus = (typeof intakeStatusValues)[number];

/** SQL fragment for migrations — keep in sync with `intakeStatusValues`. */
export const PATIENTS_INTAKE_STATUS_CHECK_SQL = `
  CHECK (intake_status IN (
    'not_started',
    'step1_complete',
    'step2_complete',
    'labs_pending',
    'reviewed'
  ))
`.trim();

/**
 * ## `intake_data` (JSONB) — documented top-level keys
 *
 * | Key | Type | Purpose |
 * |-----|------|---------|
 * | `_provenance` | `Record<fieldPath, "patient" \| "clinician" \| "ai">` | Per-field source (S-6) |
 * | `_ai_confirmations` | `Record<fieldPath, { confirmed, by, at }>` | Clinician confirm gate (DoD-10) |
 * | `_analysis_degraded` | `boolean` | LLM analyze fell back to deterministic plan |
 *
 * Step payloads (`step_one`, `step_two`, etc.) are validated in `lib/intake/schemas/`.
 *
 * ### `step_two` reserved keys (see `lib/intake/step-two-storage.ts`)
 *
 * | Key | Purpose |
 * |-----|---------|
 * | `_question_plan_resolved` | Resolved Step-2 module plan |
 * | `_synthesis_resolved` | Persisted clinical synthesis (Phase 7): `clinical_summary`, `suggested_next_steps`, `model_id`, `prompt_version`, `generated_at` |
 * | `answers` | Patient Step-2 module answers |
 */
export const INTAKE_DATA_JSONB_KEYS = [
  "_provenance",
  "_ai_confirmations",
  "_analysis_degraded",
] as const;

export type IntakeDataJsonbKey = (typeof INTAKE_DATA_JSONB_KEYS)[number];

export type IntakeProvenanceSource = "patient" | "clinician" | "ai";

export type IntakeAiConfirmation = {
  confirmed: boolean;
  by: string;
  at: string;
};
