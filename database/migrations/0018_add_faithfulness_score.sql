-- 0018_add_faithfulness_score.sql
--
-- C.1.4 Layer C foundation work. Adds three columns on clinical_knowledge
-- so the ingestion pipeline can record how faithfully each extracted
-- entry represents its source chunk (separately from the composite
-- confidence_score added in 0016, which measures retrieval ranking).
--
-- Existing 1,144 rows pre-date this column and stay NULL — retroactive
-- backfill is optional and lives in
-- services/analysis-engine/scripts/recompute_faithfulness.py.
--
-- All changes are additive and idempotent.

BEGIN;

ALTER TABLE clinical_knowledge
  ADD COLUMN IF NOT EXISTS faithfulness_score NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS faithfulness_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS faithfulness_notes TEXT;

-- Partial index so the auto-flag-low-faithfulness step in C.1.5 can find
-- review-flagged rows cheaply without scanning the NULLs from pre-C.1.4
-- entries.
CREATE INDEX IF NOT EXISTS clinical_knowledge_faithfulness_idx
  ON clinical_knowledge(faithfulness_score)
  WHERE faithfulness_score IS NOT NULL;

COMMIT;
