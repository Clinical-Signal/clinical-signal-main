-- 0002_core_schema.sql — core PHI entities per ARCHITECTURE.md.
-- Builds on 0001_auth.sql (tenants, practitioners, sessions, audit_log).
--
-- Tenant isolation is enforced by RLS using the session GUC
-- `app.current_tenant_id`. The app sets this on every connection it
-- checks out from the pool after resolving the signed-in practitioner.
-- The superuser bypasses RLS, so seed and migrations run as the owner.

\connect clinical_signal

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE RESTRICT,
  -- pgcrypto-encrypted blobs. Keyed by a server-held symmetric key passed
  -- as an argument to pgp_sym_decrypt at read time. The key never lives in
  -- the DB; it is supplied by the application per query.
  name_encrypted BYTEA NOT NULL,
  dob_encrypted BYTEA,
  -- Search aid: lowercased SHA-256 of name for lookup without decryption.
  -- Deterministic hash is acceptable here because the input space (names)
  -- is large enough and the hash is not a reversible key.
  name_search_hash TEXT NOT NULL,
  intake_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','intake_pending','labs_pending','analysis_ready','protocol_draft','active','archived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patients_tenant_idx ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS patients_practitioner_idx ON patients(practitioner_id);
CREATE INDEX IF NOT EXISTS patients_name_hash_idx ON patients(name_search_hash);

-- ---------------------------------------------------------------------------
-- Records (uploaded clinical documents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL
    CHECK (record_type IN ('lab','clinical_note','imaging','intake_form','other')),
  source_file_key TEXT,
  extracted_text_encrypted BYTEA,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_date DATE,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  processing_error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS records_patient_idx ON records(patient_id);
CREATE INDEX IF NOT EXISTS records_tenant_idx ON records(tenant_id);
CREATE INDEX IF NOT EXISTS records_date_idx ON records(patient_id, record_date DESC);

-- Embeddings over extracted record text. Split out so we can reindex without
-- touching the source record row and so embedding model/version is explicit.
CREATE TABLE IF NOT EXISTS record_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text_encrypted BYTEA NOT NULL,
  embedding vector(1536) NOT NULL,
  model_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, chunk_index, model_id)
);
CREATE INDEX IF NOT EXISTS record_embeddings_tenant_idx ON record_embeddings(tenant_id);
-- IVFFlat index for ANN cosine search. Lists is tuned for small-to-mid corpora;
-- revisit once we have >100k chunks.
CREATE INDEX IF NOT EXISTS record_embeddings_vec_idx
  ON record_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Analyses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE RESTRICT,
  analysis_type TEXT NOT NULL
    CHECK (analysis_type IN ('full_history','focused','follow_up')),
  input_record_ids UUID[] NOT NULL DEFAULT '{}',
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_ai_response_encrypted BYTEA,
  model_id TEXT,
  prompt_version TEXT,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','complete','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS analyses_patient_idx ON analyses(patient_id);
CREATE INDEX IF NOT EXISTS analyses_tenant_idx ON analyses(tenant_id);

CREATE TABLE IF NOT EXISTS analysis_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_embeddings_tenant_idx ON analysis_embeddings(tenant_id);
CREATE INDEX IF NOT EXISTS analysis_embeddings_vec_idx
  ON analysis_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ---------------------------------------------------------------------------
-- Protocols
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  -- Two outputs per ARCHITECTURE.md / CLAUDE.md: clinical + client-facing.
  clinical_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','finalized')),
  version INTEGER NOT NULL DEFAULT 1,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protocols_patient_idx ON protocols(patient_id);
CREATE INDEX IF NOT EXISTS protocols_tenant_idx ON protocols(tenant_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- Enable RLS on every PHI table. Policies read the session GUC
-- `app.current_tenant_id` which the app sets per checkout.
--
-- FORCE ROW LEVEL SECURITY means even the table owner is subject to policy
-- when connected as a non-superuser. We keep migrations running as the DB
-- owner (which IS a superuser in local dev), so migrations still work.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'patients','records','record_embeddings',
    'analyses','analysis_embeddings','protocols'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_isolation ON %1$I;
      CREATE POLICY tenant_isolation ON %1$I
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    $p$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Non-superuser application role
-- ---------------------------------------------------------------------------
-- The init DB user (POSTGRES_USER) is a superuser and therefore bypasses RLS.
-- The app connects as `app_user` (created here) so tenant_isolation policies
-- actually apply. Password is dev-only; production uses a secrets manager.
DO $r$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN NOSUPERUSER NOINHERIT PASSWORD 'app_user_dev_password';
  END IF;
END
$r$;

GRANT CONNECT ON DATABASE clinical_signal TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- audit_log is append-only from the app; it intentionally does NOT have RLS.
-- Admin/compliance access goes through a separate read role added in a later
-- compliance issue.

-- ---------------------------------------------------------------------------
-- Helper: touch updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_touch ON patients;
CREATE TRIGGER patients_touch BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS protocols_touch ON protocols;
CREATE TRIGGER protocols_touch BEFORE UPDATE ON protocols
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
