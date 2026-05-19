# Handoff prompt for Claude Code — D.1 Practitioner knowledge schema migration

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Schema migration for per-practitioner private knowledge layer (Layer D)

Per `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` and `docs/MVP-PRIORITIZATION-2026-05-08.md` rev 6 — Layer D is the durable defensive moat. This is the schema foundation. After this lands, D.2 (upload endpoint), D.3 (extraction pipeline), D.4 (cross-layer retrieval), and D.5 (management UI) can ship in sequence.

**Read first:** `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` for the full design rationale, including why three separate tables instead of adding a column to `clinical_knowledge`.

## Implementation

Single migration file with three tables. Find the next available migration number — at end of session main was at `0017`. If C.1.6 has merged or A.3.6 has merged, take the next number after.

### Migration content

The full schema is in `LAYER-D-PRACTITIONER-EXTENSIBILITY.md` under "Schema design." Three tables:

1. **`practitioner_uploads`** — tracks raw files practitioners upload (metadata only; files in S3)
2. **`practitioner_knowledge`** — extracted entries scoped per practitioner (mirrors `clinical_knowledge` shape with `practitioner_id` instead of `leader_id`)
3. **`practitioner_conflict_resolutions`** — practitioner's prior decisions on Layer C vs Layer D conflicts, so the same conflict doesn't re-prompt forever

Copy the SQL exactly from the design doc (Schema design section). All three tables use:
- `IF NOT EXISTS` for idempotency
- `tenant_id` FK to tenants with ON DELETE CASCADE
- `practitioner_id` FK to practitioners with ON DELETE CASCADE
- RLS policies using `app.current_tenant_id` GUC (matches the post-migration-0012 pattern)

### Vector column on practitioner_knowledge

The design doc specifies `embedding vector(384)` on `practitioner_knowledge`. Match the existing `clinical_knowledge` embedding dimension exactly — check `database/migrations/0004_knowledge_graph.sql` for the canonical dimension to use. If 0004 uses `vector(384)`, use 384. If it differs, match it exactly (cross-layer retrieval will need same-dimension embeddings to compare).

### Index strategy

Per the design doc:
- `practitioner_knowledge_practitioner_idx ON (tenant_id, practitioner_id)` — primary access pattern
- `practitioner_knowledge_embedding_idx USING ivfflat(embedding vector_cosine_ops)` — for retrieval similarity queries
- `practitioner_knowledge_domains_idx USING GIN(domains)` — for domain-filtered retrieval
- `practitioner_uploads_practitioner_idx ON (tenant_id, practitioner_id)` — for the management UI
- `practitioner_uploads_status_idx ON (upload_status)` — for finding stuck uploads
- `practitioner_conflict_resolutions_practitioner_idx ON (tenant_id, practitioner_id)` — for retrieval-time lookups

## Hard constraints

- **Idempotent.** `IF NOT EXISTS` everywhere, including indexes.
- **Match existing patterns.** Use the same RLS policy style as `clinical_knowledge` (after migration 0012's GUC fix). Use the same tenant_id pattern. Use the same `gen_random_uuid()` for primary keys.
- **Don't add anything not in the design doc.** No "useful" columns or indexes that aren't specified — keep the schema minimal so future changes are easy. Anything missing can be added in a follow-up migration.
- **Vector dimension matches `clinical_knowledge`** — verify by reading 0004 first.
- **Branch:** `feat/d1-practitioner-knowledge-schema`. Draft PR. Don't merge.

## Verification

1. Apply the migration to the dev DB:

```bash
docker compose exec -T postgres psql -U clinical_signal -d clinical_signal \
  -f /migrations/00XX_practitioner_knowledge.sql
```

2. Verify all three tables exist with correct columns:

```sql
\d practitioner_uploads
\d practitioner_knowledge
\d practitioner_conflict_resolutions
```

3. Verify RLS is enabled and policies are present:

```sql
SELECT tablename, policyname, qual
  FROM pg_policies
 WHERE tablename IN ('practitioner_uploads', 'practitioner_knowledge', 'practitioner_conflict_resolutions');
```

4. Re-run the migration — should be a no-op (idempotency check).

5. Cross-tenant test (critical for the privacy invariant):
   - As tenant A: insert a row into `practitioner_knowledge`
   - As tenant B (set the GUC accordingly): SELECT from `practitioner_knowledge` — should return zero rows

## Deliverable

- New migration `database/migrations/00XX_practitioner_knowledge.sql`
- Draft PR titled "D.1 — Practitioner knowledge schema (Layer D foundation)"
- PR body: verification output (all three `\d` queries, the RLS policy query, the cross-tenant test result)

When done, paste the PR URL. After this merges, D.2 (upload endpoint) is unblocked.
