-- 0001_phase1_supplemental.sql — Extensions, patient intake columns, HNSW, brownfield reconcile.
-- Run AFTER drizzle-generated 0000_phase1_intake.sql on greenfield, OR alone on brownfield DBs
-- that already have legacy intake_documents / document_chunks / audit_log.
--
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0001_phase1_supplemental.sql
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0002_rls.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Fix partial unique index if 0000 was applied without WHERE (drizzle-kit quirk).
DROP INDEX IF EXISTS one_active_token_per_patient;
CREATE UNIQUE INDEX one_active_token_per_patient
  ON intake_tokens (patient_id)
  WHERE revoked_at IS NULL AND status = 'pending';

-- ---------------------------------------------------------------------------
-- patients.intake_status + intake_data contract (PRD §4.1)
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
  'JSONB intake payload. Module keys: _provenance, _ai_confirmations, _analysis_degraded (PRD §4.1).';

-- ---------------------------------------------------------------------------
-- intake_documents — extend legacy 0006 toward PRD §4.3
-- ---------------------------------------------------------------------------
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS s3_key TEXT;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS corrections_made BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS flagged_spans JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE intake_documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE intake_documents SET file_type = doc_type
WHERE file_type IS NULL AND doc_type IS NOT NULL;

UPDATE intake_documents SET s3_key = blob_url
WHERE s3_key IS NULL AND blob_url IS NOT NULL;

UPDATE intake_documents SET created_at = uploaded_at
WHERE created_at IS NULL;

ALTER TABLE intake_documents ALTER COLUMN created_at SET DEFAULT now();
UPDATE intake_documents SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE intake_documents ALTER COLUMN created_at SET NOT NULL;

-- ---------------------------------------------------------------------------
-- document_chunks — extend legacy 0006 toward PRD §4.4
-- ---------------------------------------------------------------------------
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_text TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS token_range int4range;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS page INTEGER;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS time_range TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);

UPDATE document_chunks SET chunk_text = text_content
WHERE chunk_text IS NULL AND text_content IS NOT NULL;

DROP INDEX IF EXISTS document_chunks_embedding_hnsw_idx;
CREATE INDEX document_chunks_embedding_hnsw_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_tokens, processing_jobs TO app_user;

COMMIT;
