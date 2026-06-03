-- 0004_intake_synthesis_resolved.sql — Document Phase 7 synthesis persistence (JSONB).
-- No new columns: synthesis lives at intake_data.step_two._synthesis_resolved.

BEGIN;

COMMENT ON COLUMN patients.intake_data IS
  'JSONB intake payload. Top-level: _provenance, _ai_confirmations, _analysis_degraded. '
  'step_two._question_plan_resolved: resolved Step-2 plan. '
  'step_two._synthesis_resolved: { clinical_summary, suggested_next_steps, model_id, prompt_version, generated_at }.';

COMMIT;
