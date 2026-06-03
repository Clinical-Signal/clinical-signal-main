/**
 * Patient intake extensions (PRD §4.1).
 *
 * The `patients` table is owned by legacy SQL migrations (`0002_core_schema.sql`).
 * Drizzle documents the intake columns here; `0001_intake_schema.sql` adds
 * `intake_status` when missing.
 *
 * `intake_data` JSONB top-level keys (documented contract):
 * - `_provenance`:      Record<fieldPath, "patient" | "clinician" | "ai">
 * - `_ai_confirmations`: Record<fieldPath, { confirmed: boolean; by: uuid; at: timestamptz }>
 * - `_analysis_degraded`: boolean
 * - `step_two._synthesis_resolved`: persisted clinical synthesis (Phase 7)
 */
export const intakeStatusValues = [
  "not_started",
  "step1_complete",
  "step2_complete",
  "labs_pending",
  "reviewed",
] as const;

export type IntakeStatus = (typeof intakeStatusValues)[number];

export const INTAKE_DATA_JSONB_KEYS = [
  "_provenance",
  "_ai_confirmations",
  "_analysis_degraded",
] as const;

export type IntakeDataJsonbKey = (typeof INTAKE_DATA_JSONB_KEYS)[number];
