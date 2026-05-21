-- 0023_tighten_knowledge_dedup.sql
--
-- Tightens dedup on clinical_knowledge ahead of the historical batch
-- ingest. The old UNIQUE (tenant_id, source_chunk_hash, title) from
-- migration 0004 was brittle: LLM-generated titles vary between
-- extraction runs, so re-ingesting the same chunk could create a
-- duplicate row.
--
-- The naive fix — dropping title and keying on (tenant_id,
-- source_chunk_hash) alone — would have broken the data model. By
-- design, ingest_knowledge.py emits ONE source_chunk_hash per joined
-- Slack chunk and the LLM extracts N distinct knowledge items per
-- chunk. The corpus today contains 145 chunks producing 1,170
-- entries total (1,025 "extras") that would be lost to such a
-- constraint on re-ingest.
--
-- Instead we add a per-item content hash and key on that. Same item
-- content (re-ingested) → ON CONFLICT DO NOTHING fires. Different
-- items from the same chunk → distinct content hashes → all preserved.
-- source_chunk_hash stays unchanged as provenance metadata.
--
-- Idempotent: column-add and constraint-drop both use IF (NOT) EXISTS;
-- the backfill is safe to re-run because sha256(content) is
-- deterministic.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New column: per-item content hash.
-- ---------------------------------------------------------------------------

ALTER TABLE clinical_knowledge
  ADD COLUMN IF NOT EXISTS item_content_hash TEXT;

-- Backfill from existing content. convert_to(...,'UTF8') gives us a
-- bytea representation of the text bytes (a direct content::bytea cast
-- interprets the string as hex/escape rather than as raw bytes — wrong
-- for sha256). Matches what hashlib.sha256(content.encode("utf-8"))
-- produces in app/knowledge/db.py:_compute_item_content_hash.
UPDATE clinical_knowledge
   SET item_content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex')
 WHERE item_content_hash IS NULL;

ALTER TABLE clinical_knowledge
  ALTER COLUMN item_content_hash SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 1b. Defensive dedup: drop byte-identical content duplicates before
--     adding the new UNIQUE constraint. Smoke-tested on the dev corpus
--     this removes 4 rows from 2,667 — all from NULL-source_chunk_hash
--     ingestion artifacts where the same content landed twice with
--     different titles. Lossless because the content kept and the
--     content deleted are byte-equal.
--
--     Keep rule: highest faithfulness_score, ties broken by created_at
--     DESC (newest extraction wins on tied scores).
-- ---------------------------------------------------------------------------

DELETE FROM clinical_knowledge ck
 WHERE id NOT IN (
   SELECT DISTINCT ON (tenant_id, item_content_hash) id
     FROM clinical_knowledge
    ORDER BY tenant_id, item_content_hash,
             COALESCE(faithfulness_score, -1) DESC,
             created_at DESC
 );

-- ---------------------------------------------------------------------------
-- 2. Drop the brittle title-based unique, add the content-hash unique.
-- ---------------------------------------------------------------------------

ALTER TABLE clinical_knowledge
  DROP CONSTRAINT IF EXISTS clinical_knowledge_tenant_id_source_chunk_hash_title_key;

ALTER TABLE clinical_knowledge
  ADD CONSTRAINT clinical_knowledge_tenant_item_content_unique
  UNIQUE (tenant_id, item_content_hash);

-- An index on item_content_hash alone (without tenant_id) is useful for
-- cross-tenant analytics in the future; not added now to keep this
-- migration minimal.

COMMIT;
