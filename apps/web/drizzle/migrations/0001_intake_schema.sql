-- 0001_intake_schema.sql — Intake module schema (PRD §4).
-- Brownfield-safe: reconciles with legacy migrations 0002, 0006, 0001.
-- Apply after existing database/migrations/* via psql or drizzle-kit migrate.
--
-- Run:
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0001_intake_schema.sql
-- Then:
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0002_rls.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- patients.intake_status (PRD §4.1)
-- ---------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS intake_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_intake_status_check;
ALTER TABLE patients ADD CONSTRAINT patients_intake_status_check
  CHECK (intake_status IN (
    'not_started',
    'step1_complete',
    'step2_complete',
    'labs_pending',
    'reviewed'
  ));

COMMENT ON COLUMN patients.intake_data IS
  'JSONB intake payload. Intake module keys: _provenance, _ai_confirmations, _analysis_degraded (PRD §4.1).';

-- ---------------------------------------------------------------------------
-- intake_tokens (PRD §4.2 — SEC-18)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intake_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_by    UUID NOT NULL REFERENCES practitioners(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  use_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS intake_tokens_tenant_idx ON intake_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS intake_tokens_patient_idx ON intake_tokens(patient_id);

DROP INDEX IF EXISTS one_active_token_per_patient;
-- Note: `now()` is not IMMUTABLE in PostgreSQL index predicates, so expiry is
-- enforced in intake-token.ts verify(); this index guards one non-revoked token.
CREATE UNIQUE INDEX one_active_token_per_patient
  ON intake_tokens (patient_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- intake_documents — extend legacy 0006 table toward PRD §4.3
-- ---------------------------------------------------------------------------
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS s3_key TEXT;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS corrections_made BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS flagged_spans JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES practitioners(id);
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE intake_documents
SET file_type = doc_type
WHERE file_type IS NULL AND doc_type IS NOT NULL;

UPDATE intake_documents
SET s3_key = blob_url
WHERE s3_key IS NULL AND blob_url IS NOT NULL;

UPDATE intake_documents
SET created_at = uploaded_at
WHERE created_at IS NULL;

ALTER TABLE intake_documents
  ALTER COLUMN created_at SET DEFAULT now();

UPDATE intake_documents
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE intake_documents
  ALTER COLUMN created_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- document_chunks — extend legacy 0006 table toward PRD §4.4
-- ---------------------------------------------------------------------------
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_text TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS token_range int4range;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page INTEGER;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS time_range TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);

UPDATE document_chunks
SET chunk_text = text_content
WHERE chunk_text IS NULL AND text_content IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- processing_jobs (PRD §4.5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES intake_documents(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  engine        TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  baa_verified  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_document_idx ON processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS processing_jobs_tenant_idx ON processing_jobs(tenant_id);

-- audit_log: legacy table from 0001_auth.sql — Drizzle maps PRD fields to existing
-- columns (practitioner_id, resource_type, resource_id, metadata). No DDL here.

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_tokens, processing_jobs TO app_user;

COMMIT;
