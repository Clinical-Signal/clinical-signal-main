-- 0005_intake_token_status.sql — Magic-link lifecycle (pending / completed / expired).
--
-- Run after 0003:
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0005_intake_token_status.sql

BEGIN;

ALTER TABLE intake_tokens
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE intake_tokens
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE intake_tokens DROP CONSTRAINT IF EXISTS intake_tokens_status_check;
ALTER TABLE intake_tokens ADD CONSTRAINT intake_tokens_status_check
  CHECK (status IN ('pending', 'completed', 'expired'));

COMMENT ON COLUMN intake_tokens.status IS
  'Magic-link lifecycle: pending (usable), completed (submitted), expired (TTL/policy).';

COMMENT ON COLUMN intake_tokens.completed_at IS
  'Set when the patient submits the final intake step; link is then invalidated.';

DROP INDEX IF EXISTS one_active_token_per_patient;
CREATE UNIQUE INDEX one_active_token_per_patient
  ON intake_tokens (patient_id)
  WHERE revoked_at IS NULL AND status = 'pending';

CREATE OR REPLACE FUNCTION lookup_active_intake_token_by_patient(p_patient_id uuid)
RETURNS SETOF intake_tokens
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
    FROM intake_tokens
   WHERE patient_id = p_patient_id
     AND revoked_at IS NULL
     AND status = 'pending'
   LIMIT 1;
$$;

COMMIT;
