-- 0030_intake_docs_verified.sql — FR-18: clinician verification flag on intake_documents.
-- Brownfield-safe: column may already exist from apps/web/drizzle intake DDL.

ALTER TABLE intake_documents
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN intake_documents.is_verified IS
  'TR-8 / FR-18: true when clinician verified extracted text (zero outstanding flagged spans or explicit dismissal).';
