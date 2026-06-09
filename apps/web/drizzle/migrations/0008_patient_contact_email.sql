-- 0008_patient_contact_email.sql — Document clinician-set email for magic-link dispatch.
-- No new columns: email lives at intake_data.contact_email (PHI; not in audit payloads).

BEGIN;

COMMENT ON COLUMN patients.intake_data IS
  'JSONB intake payload. Top-level: _provenance, _ai_confirmations, _analysis_degraded, '
  'contact_email (clinician-set patient email for intake magic-link dispatch). '
  'step_two._question_plan_resolved: resolved Step-2 plan. '
  'step_two._synthesis_resolved: { clinical_summary, suggested_next_steps, model_id, prompt_version, generated_at }.';

COMMIT;
