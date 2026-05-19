# Handoff prompt for Claude Code — Batch Phase 1: pre-batch hardening

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Pre-batch hardening for the historical KO content ingest

This is Phase 1 of the historical-batch ingest plan defined in `docs/HISTORICAL-BATCH-INGEST-DESIGN.md`. It gates Phases 2-7 (Slack remainder, canvases, certification PDFs, Drive watcher, conflict detection). Two code workstreams in one PR:

1. **Tighten dedup** on `clinical_knowledge` so re-runs of any ingest are idempotent.
2. **Wire `knowledge_sources` writes** so every entry has rich provenance and protocol citations become source-queryable.

There's also a third Ryan-handled task in parallel (Google service account provisioning) — see "Parallel Ryan task" at the end. You'll write a verification script for it.

## Why this matters

Per `HISTORICAL-BATCH-INGEST-DESIGN.md`:

> "This is our moat — getting it right matters more than getting it fast."

Two latent problems will compound across the upcoming ~700-1500 new entries (Slack remainder + canvases + 3 PDFs + rolling Fellowship decks) if we don't fix them first:

- **Re-runs produce duplicates.** Current dedup key is `(tenant_id, source_chunk_hash, title)`. LLM-generated titles vary between extraction runs, so re-ingesting the same chunk creates a duplicate row. We *will* re-run things during the batch (extraction tweaks, schema fixes, accidental double-loads), and a duplicate corpus distorts confidence scoring (corroboration self-joins count dupes as agreements) and pollutes retrieval.

- **`knowledge_sources` is empty.** Migration 0016 defines the registry but no code writes to it. Provenance lives only in the `_source` JSONB blob on each entry, which means citations in protocol generation will be opaque ("source: gut-health-v2.jsonl chunk 47") rather than rich ("Dr. Laura, #gut-health canvas: GI MAP interpretation"). External-leader ingestion (Gottfried, Cole, Hyman) will only make this worse — eleven books producing thousands of orphan entries.

Fixing both *before* the batch is far cheaper than backfilling after.

## Read first

Before writing code, read these for context:

- `CLAUDE.md` — project overview, security model, working principles
- `docs/HISTORICAL-BATCH-INGEST-DESIGN.md` — the strategic design this prompt executes against (especially "Strategic decisions" and "Phase 1")
- `docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md` — original gap analysis behind the KO foundation
- `database/migrations/0016_knowledge_orchestrator.sql` — the schema (particularly `knowledge_sources` and `clinical_knowledge` provenance columns)
- `database/migrations/0004_knowledge_graph.sql` line 39 — the existing unique constraint to drop
- `services/analysis-engine/app/knowledge/db.py` — `insert_knowledge_item` (lines 34-92) is what changes
- `services/analysis-engine/scripts/load_knowledge.py` — primary caller of `insert_knowledge_item`
- `services/analysis-engine/scripts/ingest_knowledge.py` — Slack-text → JSONL pipeline
- `services/analysis-engine/scripts/ingest_pdf.py` — PDF → JSONL pipeline (PR #207)

## Deliverables

### 1a. Migration 0022 — add `content_hash` column and dedup on content

**File:** `database/migrations/0022_clinical_knowledge_content_hash_dedup.sql`

**Background on why this approach** (revised May 19 after pre-migration analysis):

The original draft of this prompt proposed tightening dedup to `(tenant_id, source_chunk_hash)`. That was wrong. A single Slack `source_chunk` (one thread) routinely produces multiple distinct knowledge items during extraction — a supplement protocol, a lab interpretation, and a sequencing note can all come from one chunk. The current corpus has ~1,025 such legitimate multi-extract rows across 145 chunk-hash groups. Chunk-only dedup would cap each chunk to one surviving row on re-ingest and destroy them.

The real worry — re-extracting the same item with a varied title — is content-level, not chunk-level. The fix is a new `content_hash` column equal to `sha256(content)`, with the uniqueness contract on `(tenant_id, content_hash)`. `source_chunk_hash` stays as provenance but is no longer part of uniqueness.

Properties:
- Re-extracting an item that produced identical `content` → ON CONFLICT DO NOTHING fires correctly. Solves the actual idempotency worry.
- Different items from the same chunk → distinct content → distinct hashes → all preserved. No data loss.
- Aligns with `ingest_pdf.py` semantics where chunk == item already (one chunk's content_hash == its source_chunk_hash, just different columns).
- Backfillable in the migration itself. Zero pre-migration cleanup.

**The migration:**

```sql
BEGIN;

-- Add the new column (nullable initially so we can backfill)
ALTER TABLE clinical_knowledge
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Backfill from existing content
UPDATE clinical_knowledge
   SET content_hash = encode(sha256(content::bytea), 'hex')
 WHERE content_hash IS NULL;

-- Enforce non-null going forward
ALTER TABLE clinical_knowledge
  ALTER COLUMN content_hash SET NOT NULL;

-- Verify no within-tenant content collisions before adding the unique constraint
-- (this should produce zero rows; if not, surface and stop — corpus has unexpected dupes)
DO $$
DECLARE
  collision_count INT;
BEGIN
  SELECT COUNT(*) INTO collision_count
    FROM (
      SELECT tenant_id, content_hash
        FROM clinical_knowledge
       GROUP BY tenant_id, content_hash
      HAVING COUNT(*) > 1
    ) collisions;
  IF collision_count > 0 THEN
    RAISE EXCEPTION 'Found % (tenant_id, content_hash) collisions; aborting migration. Investigate via: SELECT tenant_id, content_hash, COUNT(*), array_agg(id) FROM clinical_knowledge GROUP BY 1, 2 HAVING COUNT(*) > 1;', collision_count;
  END IF;
END $$;

-- Add the new uniqueness contract
ALTER TABLE clinical_knowledge
  ADD CONSTRAINT clinical_knowledge_tenant_content_unique
  UNIQUE (tenant_id, content_hash);

-- Drop the old uniqueness contract (find the actual constraint name first via \d clinical_knowledge;
-- the name below is what migration 0004 created, but psql may have autogenerated a slightly different one).
ALTER TABLE clinical_knowledge
  DROP CONSTRAINT IF EXISTS clinical_knowledge_tenant_id_source_chunk_hash_title_key;

-- Index on content_hash for the lookup path (UNIQUE constraint creates this implicitly,
-- but be explicit for clarity)

COMMIT;
```

Verify the actual old constraint name first via `\d clinical_knowledge` — the autogenerated name in migration 0004 may differ from the guess above. Pre-migration analysis already confirmed all existing content is distinct, so the embedded DO block should pass cleanly.

### 1b. Update `insert_knowledge_item` to compute and use `content_hash`

**File:** `services/analysis-engine/app/knowledge/db.py`

Two changes:

1. Compute `content_hash` inside the function from the `content` argument. Callers don't need to think about it — they pass `content` as before, the function hashes. Use `hashlib.sha256(content.encode('utf-8')).hexdigest()` for consistency with the migration's PostgreSQL `encode(sha256(content::bytea), 'hex')` (both produce the same hex string for the same byte sequence; verify with a quick interactive check on a sample row).

2. Change the INSERT to include `content_hash` and change the `ON CONFLICT (tenant_id, source_chunk_hash, title)` clause at line 73 to `ON CONFLICT (tenant_id, content_hash)`. Update the function's docstring to reflect the new dedup semantics — "idempotent on (tenant_id, content_hash); re-extracting the same content produces no new row regardless of title variation."

`source_chunk_hash` stays as a function argument and column write. It's still useful as provenance ("which source chunk did this come from") even though it no longer participates in uniqueness. Type remains `str | None`. The semantics that `source_chunk_hash IS NULL` means "no provenance known" stay intact and unproblematic.

### 1c. Add `get_or_create_source` to `db.py`

**File:** `services/analysis-engine/app/knowledge/db.py`

New function:

```python
def get_or_create_source(
    tenant_id: str,
    source_type: str,
    title: str,
    *,
    leader_id: str | None = None,
    url: str | None = None,
    file_path: str | None = None,
    raw_text_hash: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Get-or-create a knowledge_sources row, return its UUID.

    Idempotent on (tenant_id, raw_text_hash) when raw_text_hash is provided
    (the table's existing UNIQUE constraint). When raw_text_hash is None,
    falls back to lookup by (tenant_id, source_type, title) before inserting.

    source_type must be one of the values in migration 0016 lines 41-45:
      'book', 'podcast_episode', 'youtube_video', 'article', 'blog_post',
      'course_module', 'training_recording', 'clinical_case', 'slack_thread',
      'research_paper', 'protocol_template', 'other'.

    Returns the source UUID. Sets ingestion_status='ingesting' on create;
    callers should update to 'extracted' after their ingest loop completes.
    """
```

Implementation notes:
- Wrap in `tenant_conn(tenant_id)` same pattern as `insert_knowledge_item`
- For the lookup-by-title fallback, log a warning if it matches multiple rows (shouldn't happen but is possible since there's no UNIQUE on `(tenant_id, source_type, title)` — design choice)
- Validate `source_type` against an allowed set defined as a module constant; raise `ValueError` if invalid

Add a second function for the status update:

```python
def mark_source_extracted(tenant_id: str, source_id: str, entry_count: int) -> None:
    """Mark a knowledge_sources row as extracted and record the entry count."""
```

### 1d. Add `source_id` to `insert_knowledge_item`

Extend the function signature with `source_id: str | None = None` and include it in the INSERT. Existing callers that don't supply it get NULL — but after this PR, every caller in the codebase *should* supply it (the post-ingest finalize step from C.1.6 will flag NULLs to the review queue eventually; for now, log a warning if `source_id` is None).

### 1e. Wire `get_or_create_source` into the three ingest scripts

Each script gets a small refactor:

**`scripts/load_knowledge.py`** — most common path. Currently iterates JSONL files and calls `insert_knowledge_item` per record. Add a per-file `get_or_create_source` call before the record loop:

- For Slack JSONLs (filename pattern `*-v1.jsonl` or `*-v2.jsonl` or just the channel name), use `source_type='slack_thread'`, `title=channel_name`, `file_path=<jsonl path>`, `raw_text_hash=<sha256 of the JSONL file contents>`.
- Capture the returned `source_id` and pass it on every `insert_knowledge_item` call for records from that file.
- After the file's records are loaded, call `mark_source_extracted(tenant_id, source_id, count)`.

**`scripts/ingest_knowledge.py`** — Slack-text → JSONL. This script produces JSONL but doesn't insert; the source row should be created by `load_knowledge.py` consuming its output, so no change needed here unless you find the script does insert directly somewhere.

**`scripts/ingest_pdf.py`** (PR #207) — PDF → JSONL. Similar to `load_knowledge.py`: when ingesting a PDF, create one `knowledge_sources` row before extraction starts. Use `source_type='course_module'` for the certification PDFs (they're Dr. Laura's course material) — make this configurable via a `--source-type` CLI flag with a sensible default. `title` = the PDF's base filename (sanitized). `file_path` = the PDF path. `raw_text_hash` = sha256 of the extracted text (deterministic across runs). Pass `source_id` through to each chunk's `insert_knowledge_item` call.

### 1f. Backfill script for the 1,144 existing rows

**File:** `services/analysis-engine/scripts/backfill_knowledge_sources.py`

The 1,144 existing `clinical_knowledge` rows have `source_id IS NULL`. Backfill them.

Logic:
1. Connect to dev DB (use the same `tenant_conn` pattern). Hardcode the dev tenant_id (`00000000-0000-0000-0000-000000000001`) or accept it as a CLI arg.
2. Group existing rows by `source_channel`. Each unique `source_channel` becomes one `knowledge_sources` row.
3. For each group:
   - Call `get_or_create_source(tenant_id, source_type='slack_thread', title=<source_channel>, metadata={'backfilled': True, 'entry_count_at_backfill': <N>})`
   - `UPDATE clinical_knowledge SET source_id = <new_source_id> WHERE tenant_id = ? AND source_channel = ?`
   - Print a summary line per channel
4. After all groups processed: assert that no rows remain with `source_id IS NULL` AND `source_channel IS NOT NULL`. If any do, report.
5. Rows with `source_channel IS NULL` (if any) get logged but left alone — they're a separate cleanup.

Also set `leader_id` on the created source rows. Migration 0017 backfilled `leader_id` on every `clinical_knowledge` row to Dr. Laura's UUID; pull that UUID via `SELECT id FROM knowledge_leaders WHERE slug = 'dr-laura' AND tenant_id = ?` and pass it to `get_or_create_source`.

Make the script idempotent — running it twice should be a no-op the second time. The `get_or_create_source` function handles source-row dedup; the UPDATE should be `WHERE source_id IS NULL` so it doesn't re-assign already-set rows.

### 1g. Verify the post-ingest finalize hook still works

`post_ingest_finalize` (PR #186, `app/knowledge/db.py:500`) runs autotag → recompute → enqueue after every load. None of the Phase 1 changes should affect its behavior, but you need to verify:

- Load a small JSONL file end-to-end after all Phase 1 changes are in
- Confirm `post_ingest_finalize` runs and reports the expected counts
- Confirm new entries have `source_id` set (from Phase 1e changes) AND `domains` populated AND `confidence_score` recomputed AND review-queue entries created where appropriate

If anything regresses, debug before opening the PR.

## Hard constraints

- **No PHI involved.** Knowledge content only. Standard tenant safety patterns (`tenant_conn`, `set_config('app.current_tenant_id', ...)`) apply.
- **Backward compatible at the data level.** Existing 1,144 rows must still be queryable through all existing retrieval paths (`searchKnowledgeBase` in `apps/web/lib/analysis.ts`, the `search_knowledge` Python function). No retrieval behavior change in this PR — just adding provenance richness.
- **Idempotent end-to-end.** The defining property of this work. Verify:
  - Re-running `load_knowledge.py` on the same JSONL produces zero new clinical_knowledge rows AND zero new knowledge_sources rows.
  - Re-running `backfill_knowledge_sources.py` is a no-op.
- **Don't change extraction logic.** No prompt edits. No chunker edits. Just plumbing.
- **Don't change `post_ingest_finalize` behavior.** It's load-bearing; touching it expands scope.
- **Branch:** `feat/batch-phase-1-hardening`. Draft PR. Don't merge.
- **TypeScript strict mode** isn't relevant here (Python only) but mypy/ruff if the project uses them — run them.

## Out of scope

- Don't build `ingest_canvas.py` — that's Phase 3.
- Don't build `sync_drive_content.py` — that's Phase 5.
- Don't touch C.3 conflict detection — that's Phase 7.
- Don't update the TypeScript retrieval layer (`searchKnowledgeBase`, `formatKbContext`). Citation richness from `knowledge_sources` is a follow-up; this PR establishes the data, not the surfacing.
- Don't recalibrate `LOW_CONFIDENCE_THRESHOLD` — that's a post-batch decision per Open Question #5 in the design doc.
- Don't touch external-leader content. No leader_id changes beyond what migration 0017 already did.

## Verification before you call it done

Run each check and paste output into the PR body.

### Check 1: Pre-migration content uniqueness

The migration's embedded `DO` block enforces this, but run it standalone first to catch issues without an abort:

```sql
SELECT COUNT(*) AS collision_groups
  FROM (
    SELECT tenant_id, encode(sha256(content::bytea), 'hex') AS h
      FROM clinical_knowledge
     GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) c;
```

Expected: 0. If non-zero, investigate — pre-existing exact-content duplicates would have come from a prior re-ingest under the old constraint when the same chunk was re-extracted with a different title. Inspect the colliding pairs and decide whether to drop the older row before applying the migration.

### Check 2: Migration applies cleanly

```bash
docker compose exec db psql -U postgres -d clinical_signal -f /migrations/0022_clinical_knowledge_content_hash_dedup.sql
docker compose exec db psql -U postgres -d clinical_signal -c "\d clinical_knowledge"
```

Verify:
- `content_hash` column is present, NOT NULL
- New constraint `clinical_knowledge_tenant_content_unique` on `(tenant_id, content_hash)` is present
- Old constraint on `(tenant_id, source_chunk_hash, title)` is gone
- All 2,667 existing rows have non-null `content_hash` populated (spot-check: `SELECT COUNT(*) FROM clinical_knowledge WHERE content_hash IS NULL;` → 0)

### Check 3: Dedup is now idempotent

Pick a small JSONL from `database/seed/knowledge/` (the smallest by line count) and re-load it:

```bash
docker compose exec analysis python scripts/load_knowledge.py --file database/seed/knowledge/<smallest>.jsonl --tenant 00000000-0000-0000-0000-000000000001
```

Expected output: zero new rows. Both `INSERT ... RETURNING` returning nothing AND `post_ingest_finalize` reporting zero new domains/scores/queue entries.

### Check 4: Backfill ran cleanly

```bash
docker compose exec analysis python scripts/backfill_knowledge_sources.py --tenant 00000000-0000-0000-0000-000000000001
```

Then verify:

```sql
SELECT COUNT(*) AS null_source_rows
  FROM clinical_knowledge
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND source_id IS NULL
   AND source_channel IS NOT NULL;
-- Expect: 0

SELECT COUNT(*) AS source_rows
  FROM knowledge_sources
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
-- Expect: ~21 (one per Slack channel currently in the corpus)

SELECT source_type, COUNT(*) AS n_sources, SUM(entry_count) AS total_entries
  FROM knowledge_sources
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
 GROUP BY source_type;
-- Expect: 'slack_thread', ~21, ~1144
```

### Check 5: Backfill is idempotent

Re-run `backfill_knowledge_sources.py`. Expected output: all-zero counts. No new sources created, no rows updated.

### Check 6: Fresh ingest writes source_id

Load a JSONL fresh (one not already in the corpus, if one exists — otherwise create a tiny synthetic JSONL with 3 entries):

```bash
docker compose exec analysis python scripts/load_knowledge.py --file <fresh.jsonl> --tenant 00000000-0000-0000-0000-000000000001
```

Verify the new rows have non-null `source_id`:

```sql
SELECT id, title, source_id IS NOT NULL AS has_source
  FROM clinical_knowledge
 WHERE created_at > now() - interval '5 minutes';
-- Expect: every row has_source = true
```

### Check 7: PDF ingest writes source_id

```bash
docker compose exec analysis python scripts/ingest_pdf.py \
  --input database/seed/dr-laura-drive/certification-materials/Clinical_Foundation_Intake_Pattern_Recognition_Testing_Roadmap.pdf \
  --tenant 00000000-0000-0000-0000-000000000001 \
  --source-channel certification-materials \
  --source-type course_module \
  --dry-run
```

Should produce JSONL output (not load yet — that's Phase 4). If `--dry-run` doesn't exist, skip this check and move to Check 8.

### Check 8: post_ingest_finalize still works

After Check 6's load, confirm:

```sql
SELECT
  (SELECT COUNT(*) FROM clinical_knowledge WHERE domains = '{}'::text[]) AS untagged,
  (SELECT COUNT(*) FROM clinical_knowledge WHERE confidence_score = 0.50) AS default_score,
  (SELECT COUNT(*) FROM knowledge_review_queue WHERE created_at > now() - interval '5 minutes') AS new_queue;
```

Verify domains were autotagged (untagged should be 0 or very small), confidence scores recomputed (default_score reasonable), and review queue populated where needed.

## Suggested commit sequence

1. **`feat: migration 0022 — content_hash column + dedup on (tenant_id, content_hash)`** — schema change with backfill + db.py change to compute content_hash and update ON CONFLICT.
2. **`feat: get_or_create_source + mark_source_extracted in app/knowledge/db.py`** — new functions, no callers yet.
3. **`feat: wire source_id into load_knowledge.py and ingest_pdf.py`** — both scripts now create sources and pass source_id to inserts.
4. **`feat: backfill_knowledge_sources.py for existing 1,144 rows`** — backfill script + a `--dry-run` flag.
5. **`feat: verify_drive_access.py for service-account verification`** — see "Parallel Ryan task" below.

Five commits, one PR titled "Batch Phase 1 — Pre-batch hardening (dedup + knowledge_sources)".

## Parallel Ryan task: Google service account

In parallel with your code work, Ryan is setting up a Google service account in Cloud Console so the Drive watcher (Phase 5) has the auth path ready. You don't drive this part, but you write the verification script so Ryan can prove the setup works.

**File:** `services/analysis-engine/scripts/verify_drive_access.py`

A small script that:
- Reads service account credentials from a JSON key file at a configurable path (default `infrastructure/secrets/google-service-account.json` — confirm the path with Ryan; it must be `.gitignore`d)
- Uses `google-api-python-client` + `google-auth` to instantiate a Drive service
- Lists the contents of the two known Drive folders:
  - `161VCvz43IVXDGuO3M2JPZamp1K5HZCGe` (Slack Export - Mentorship)
  - `1f4PY0gvedz-FX8qouKCfARATmXKIYsFf` (Clinical Signal Sources)
- Prints file count + first 5 filenames per folder
- Exits 0 on success, non-zero with a clear error message on failure (file not found, permission denied, API not enabled, etc.)

Also:
- Add `infrastructure/secrets/` to `.gitignore` if not already there
- Add the Python dependencies to `services/analysis-engine/requirements.txt` (or wherever Python deps live)
- Add a `.env.example` entry pointing at the credentials path

Ryan runs this script after Cloud Console setup. If it lists files from both folders, Phase 1c is complete.

## When you're done

Open a draft PR against `main` titled "Batch Phase 1 — Pre-batch hardening (dedup + knowledge_sources)". PR body should contain:

- Verification output from all eight checks above
- The output of the backfill summary (which channels became which sources, with entry counts)
- Confirmation that `grep -rn "ON CONFLICT (tenant_id, source_chunk_hash, title)" services/` returns empty (the old conflict key is gone) and that `ON CONFLICT (tenant_id, content_hash)` is the only remaining ON CONFLICT in `insert_knowledge_item`
- Pre-migration corpus size noted (currently ~2,667 rows, up from the 1,144 mentioned in older docs as P0.2 has been loading queued Slack channels) — confirms backfill scope
- A note on whether `verify_drive_access.py` has been tested against a real service account yet (depends on Ryan's Cloud Console progress; OK to merge without that signal — the script's testable in isolation)

Tag Ryan for review. Don't merge until he confirms the design-doc verification gate is met.

After this lands, Phase 2 (Slack remainder load) can run immediately, and Phase 1c (service account) unblocks Phase 5 (Drive watcher) whenever Ryan finishes the Cloud Console steps.
