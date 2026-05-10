-- 0020_intake_docs_prep_brief_index.sql
-- A.3.6 partial index — speeds up prep_brief lookups in patient list page
-- and intake hub page. Investigation: docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md
--
-- Two query patterns this targets:
--   1. lib/patients.ts:55 — EXISTS(SELECT 1 FROM intake_documents d
--                                  WHERE d.patient_id = p.id
--                                    AND d.metadata->>'type' = 'prep_brief')
--      runs once per patient in the practitioner's patient list.
--   2. lib/intake.ts:144 — SELECT d.uploaded_at FROM intake_documents d
--                          WHERE d.patient_id = p.id
--                            AND d.metadata->>'type' = 'prep_brief'
--                          ORDER BY d.uploaded_at DESC LIMIT 1
--      runs on every visit to the intake hub page.
--
-- The composite (tenant_id, patient_id, created_at) index from the original
-- ISSUES-FROM-REVIEW.md recommendation was investigated and skipped: RLS
-- already scopes per-tenant and the existing single-column patient_id index
-- covers the dominant access pattern. Only the partial index for prep_brief
-- predicates ships here.
--
-- Idempotent.

CREATE INDEX IF NOT EXISTS intake_docs_prep_brief_idx
  ON intake_documents(patient_id, uploaded_at DESC)
  WHERE metadata->>'type' = 'prep_brief';
