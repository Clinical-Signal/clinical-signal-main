-- 0019_extend_review_type_enum.sql
--
-- C.1.5 (Knowledge Orchestrator Layer C). The original
-- knowledge_review_queue.review_type CHECK from migration 0016 covered
-- {new_entries, conflict, low_confidence, correction_needed,
-- periodic_audit}. C.1.5's auto-flag step adds a new flag for borderline
-- faithfulness scores (set by the C.1.4 ingestion pass), so we extend
-- the enum with 'low_faithfulness'.
--
-- Idempotent: drops and re-creates the constraint so re-running this
-- migration is safe regardless of whether the constraint is already in
-- the extended state.

BEGIN;

ALTER TABLE knowledge_review_queue
  DROP CONSTRAINT IF EXISTS knowledge_review_queue_review_type_check;

ALTER TABLE knowledge_review_queue
  ADD CONSTRAINT knowledge_review_queue_review_type_check
  CHECK (review_type IN (
    'new_entries',
    'conflict',
    'low_confidence',
    'low_faithfulness',
    'correction_needed',
    'periodic_audit'
  ));

COMMIT;
