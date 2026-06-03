-- 0003_intake_token_rate_limits_and_verify.sql
-- Postgres-backed token rate limiting + SECURITY DEFINER lookups for API-1 verify.
--
-- Run after 0002_rls.sql:
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0003_intake_token_rate_limits_and_verify.sql

BEGIN;

CREATE TABLE IF NOT EXISTS intake_token_rate_limits (
  bucket_key     TEXT PRIMARY KEY,
  failure_count  INTEGER NOT NULL DEFAULT 0,
  locked_until   TIMESTAMPTZ,
  success_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_token_rate_limits_locked_until_idx
  ON intake_token_rate_limits (locked_until)
  WHERE locked_until IS NOT NULL;

-- Token verify runs before tenant context is known; RLS blocks hash lookup otherwise.
CREATE OR REPLACE FUNCTION lookup_intake_token_by_hash(p_token_hash text)
RETURNS SETOF intake_tokens
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
    FROM intake_tokens
   WHERE token_hash = p_token_hash
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION lookup_intake_token_by_id(p_token_id uuid)
RETURNS SETOF intake_tokens
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
    FROM intake_tokens
   WHERE id = p_token_id
   LIMIT 1;
$$;

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
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION lookup_intake_token_by_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_intake_token_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_active_intake_token_by_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_intake_token_by_hash(text) TO app_user;
GRANT EXECUTE ON FUNCTION lookup_intake_token_by_id(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION lookup_active_intake_token_by_patient(uuid) TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_token_rate_limits TO app_user;

COMMIT;
