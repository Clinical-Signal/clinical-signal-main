# Handoff prompt for Claude Code — A.3.6 Partial index on prep_brief metadata

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Add a partial index to speed up prep_brief lookups

Per `docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md`. Two hot paths repeatedly query `intake_documents WHERE patient_id = ? AND metadata->>'type' = 'prep_brief'`:

- `apps/web/lib/patients.ts:55` — patient list page does this in an EXISTS subquery for *every* patient row in the list
- `apps/web/lib/intake.ts:144` — intake hub page does this with ORDER BY uploaded_at DESC LIMIT 1

A partial index on these conditions makes both queries materially faster as the corpus grows. The original `ISSUES-FROM-REVIEW.md` recommendation also included a composite `(tenant_id, patient_id, created_at)` index — investigation determined that's low-value (RLS already scopes per-tenant, existing single-column patient_id index covers the dominant pattern). **Skip the composite index. Build only the partial.**

## Implementation

Single migration file. Find the next available migration number — at end of session, head of main was `0017` (knowledge_leaders seed). If C.1.6 has merged, it might be `0018`. If A.3.5 didn't actually need work (per investigation), don't take that number. Pick the next available number after checking `database/migrations/`.

### Migration

```sql
-- 00XX_intake_docs_prep_brief_index.sql
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
-- Idempotent.

CREATE INDEX IF NOT EXISTS intake_docs_prep_brief_idx
  ON intake_documents(patient_id, uploaded_at DESC)
  WHERE metadata->>'type' = 'prep_brief';
```

That's it. One CREATE INDEX, idempotent, partial on the prep_brief predicate, sorted descending by uploaded_at to match the LIMIT 1 query's ORDER BY.

## Hard constraints

- **No application code changes.** This is purely a database optimization. PostgreSQL's planner picks up the index automatically.
- **Idempotent.** `IF NOT EXISTS` so re-applying is safe.
- **Branch:** `feat/a36-prep-brief-partial-index`. Draft PR. Don't merge.

## Verification

1. Apply the migration to the dev DB:

```bash
docker compose exec -T postgres psql -U clinical_signal -d clinical_signal \
  -f /migrations/00XX_intake_docs_prep_brief_index.sql
```

2. Verify the index exists:

```sql
\d intake_documents
-- Should show "intake_docs_prep_brief_idx" in the index list
```

3. Verify EXPLAIN uses it for the prep_brief query:

```sql
EXPLAIN (FORMAT TEXT) SELECT EXISTS(
  SELECT 1 FROM intake_documents
   WHERE patient_id = (SELECT id FROM patients LIMIT 1)
     AND metadata->>'type' = 'prep_brief'
);
-- Should reference "intake_docs_prep_brief_idx" in the plan
```

If EXPLAIN doesn't pick up the index, the issue might be that the dev DB is too small for the planner to bother — it'll fall back to seq scan on tiny tables. That's fine; the index exists for when production data volume justifies it.

## Deliverable

- New migration `database/migrations/00XX_intake_docs_prep_brief_index.sql` (with the right number)
- Draft PR titled "A.3.6 — Partial index on intake_documents for prep_brief lookups" with the EXPLAIN output in the description

When done, paste the PR URL.
