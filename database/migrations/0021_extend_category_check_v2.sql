-- 0021_extend_category_check_v2.sql
--
-- Closes #191. Extends the clinical_knowledge.category CHECK constraint
-- to accept the v2 lens categories that `app/knowledge/db.py`'s
-- VALID_CATEGORIES set already accepts in Python. Pre-fix, Python passed
-- v2-shaped rows through to INSERT and the DB rejected them — every
-- `*-v2.jsonl` file in `database/seed/knowledge/` failed to load with
-- `CheckViolation`. Surfaced during May 11 smoke test Step 9.
--
-- Same pattern as migration 0019 extending review_type. Idempotent:
-- DROP CONSTRAINT IF EXISTS before re-creating.

BEGIN;

ALTER TABLE clinical_knowledge
  DROP CONSTRAINT IF EXISTS clinical_knowledge_category_check;

ALTER TABLE clinical_knowledge
  ADD CONSTRAINT clinical_knowledge_category_check
  CHECK (category IN (
    -- v1 categories (existing)
    'protocol_pattern',
    'supplement_protocol',
    'lab_interpretation',
    'clinical_sequencing',
    'dietary_recommendation',
    'lifestyle_intervention',
    'other',
    -- v2 extraction lenses (new — match Python VALID_CATEGORIES)
    'interpretation_pattern',
    'conditional_reasoning',
    'case_based_qa',
    'clinical_feedback',
    'resource_recommendation'
  ));

COMMIT;
