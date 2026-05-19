# Handoff prompt for Claude Code — Historical batch ingestion

Paste everything below the line into the Claude Code session that already has Drive MCP loaded. (If you've opened a fresh session, ensure Drive MCP is available before pasting — this prompt depends on `mcp__drive__download_file_content`, `mcp__drive__search_files`, and `mcp__drive__get_file_metadata`.)

---

## Task: Single-pass historical batch — ingest Dr. Laura's curated content from Drive into the KB

This is the moat. The goal of this PR is "Dr. Laura's curated content is in the knowledge base end-to-end" — not a phase, not infrastructure, just the data load. Phase 1 hardening (PR #215) already shipped the foundation (content-hash dedup, `knowledge_sources` registry, source_id wiring); this prompt executes the bulk historical load against that foundation.

When you're done, the KB should grow by approximately 800-2000 new entries (Slack canvases + the `mindset` channel + 3 Certification PDFs + 3 Peptide Workshop PDFs + Fellowship Module 1 endocrinology + Fellowship Module 2 neurovascular), with full provenance on every entry. Estimated execution time: 4-7 hours (most of it LLM extraction across the Fellowship PDFs). Estimated API cost: $60-120.

## Read first

- `CLAUDE.md` — project overview, moat framing, working principles
- `docs/HISTORICAL-BATCH-INGEST-DESIGN.md` — strategic design including the four decisions and the Phase 1-7 phase plan (Phase 1 done in PR #215; this prompt collapses Phases 2-4 into one execution, defers Phases 5-7)
- `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md` — original content inventory from May 11
- `docs/CLAUDE-CODE-PROMPT-INGEST-CANVAS.md` — earlier draft of a canvas-ingestion design; reference, may need updates
- `services/analysis-engine/scripts/ingest_knowledge.py`, `ingest_pdf.py`, `load_knowledge.py`, `backfill_knowledge_sources.py` — existing pipeline
- `services/analysis-engine/app/knowledge/db.py` — `insert_knowledge_item`, `get_or_create_source`, `post_ingest_finalize` (all updated by PR #215)

## Scope (firm — don't expand without surfacing)

**IN scope for this PR:**

1. `canvases.json` from the Slack export — ingest as Slack-canvas content (~24KB, ~50-100 entries expected).
2. The `mindset` Slack channel — 51 daily JSONs (~261KB), the only in-scope clinical channel not yet in the KB.
3. The 3 Certification Materials PDFs already staged at `database/seed/dr-laura-drive/certification-materials/` — run `ingest_pdf.py` against each.
4. The Peptide Workshop content — 3 PDFs from the "Peptide Workshop + Accompanying documents" folder in Drive: `PeptideQuickReferenceGuide.pdf`, `Peptides_A_2026_Clinical_Deep_Dive SLIDE DECK.pdf`, `Peptides in Practice Full Recording TRANSCRIPT.pdf`.
5. **Fellowship Curriculum slide decks — Module 1 endocrinology + Module 2 neurovascular** from the "Academy for Anti-Aging Medicine Longevity Fellowship Curriculum Slide Decks" folder. Dr. Laura curated these and teaches from them in her mentorship program; her editorial endorsement is the moat signal. Attribution rule: `leader_id = Dr. Laura`, with the original speaker captured in entry `metadata` (see "Fellowship attribution model" below).
6. Re-running the 29 clinical Slack channels through the ingest pipeline so dedup-by-content-hash confirms idempotency and any drift is corrected. (Most produce zero new entries; that's correct behavior.)

**OUT of scope — do not touch:**

- **8 non-clinical Slack channels:** `welcome`, `celebrations-`, `urgent`, `collaborations-and-referrals`, `entrepreneurgrowthtopics`, `money`, `systemsandprocesses`, `whhps_certification`. Community/business/operations content, not clinical knowledge. Including them would noise protocol retrieval. (Cowork made this call after the survey; revisit later if there's evidence retrieval quality benefits from including them.)
- The 3 empty Slack placeholder JSONs (`huddle_transcripts.json`, `lists.json`, `file_conversations.json`), `.DS_Store`, the `Hormone AI NotebookLM Sources` folder (empty).
- The 21 Slack channels already loaded with rich content — they'll dedup-skip naturally; don't re-extract.
- C.3 conflict detection — separate workstream (Phase 7 in the design doc).
- Drive watcher — separate workstream (Phase 5 in the design doc).
- Future external-leader workstream (e.g., direct ingestion of Gottfried books, Cole books). Those still get their own leader rows when we get to them. The Fellowship inclusion here is specifically Dr.-Laura-curated material; it does not establish a pattern of attributing arbitrary external content to her.

## Fellowship attribution model

The Fellowship decks (Module 1 + Module 2) are external speakers' presentations that Dr. Laura curated and uses in her teaching. We attribute to her as curator, but preserve the original speaker for citation richness.

For every Fellowship entry, set:

- `leader_id = <Dr. Laura UUID>` (per the existing slug `'dr-laura'` lookup pattern)
- `source_channel = 'fellowship-module-1'` or `'fellowship-module-2'`
- `source_type = 'course_module'`
- Metadata fields:
  - `metadata.original_speaker` = the lecturer name parsed from the PDF filename (e.g., `"Perlmutter"`, `"LePine"`, `"Guarneri"`, `"Houston"`, `"Davis"`, `"Krishnan"`, `"Minich"`, `"Shade"`)
  - `metadata.original_presentation` = the lecture title from the filename (e.g., `"Heart Brain"`, `"GI Microbiome"`, `"Hypertension Part 1 and 2"`)
  - `metadata.curated_by` = `"Dr. Laura"` (explicit endorsement marker)
  - `metadata.curation_source` = `"Academy for Anti-Aging Medicine Longevity Fellowship - Module 1"` or `"...- Module 2"`

This lets retrieval surface citations like "Per Dr. Laura's Module 2 teaching, originally presented by Perlmutter" — rich and accurate. It also lets future analytics queries find all content originally from a given speaker even though they're not a separate leader row.

One `knowledge_sources` row per PDF (not per module) — each speaker's deck is its own source within the module. Use `get_or_create_source(tenant_id, source_type='course_module', title=<sanitized filename>, leader_id=<Dr. Laura>, file_path=<local path>, metadata={'module': 1 or 2, 'original_speaker': ..., 'original_presentation': ...})`.

## Pre-work: discover the Slack channel extraction recipe

Before any ingestion can run on the `mindset` channel, you need to know how the existing 21 channels' raw daily Slack JSONs got converted into `-v2.jsonl` extraction-ready files. `ingest_knowledge.py` likely doesn't read raw Slack export JSONs directly.

Steps:

1. Read `services/analysis-engine/scripts/ingest_knowledge.py` carefully. Determine the expected input format.
2. Check `git log --all --oneline -- 'services/analysis-engine/scripts/*' -- 'database/seed/knowledge/*'` to find any historical preprocessing script that may have been deleted or moved.
3. Open one of the existing v2 JSONL files (e.g., `database/seed/knowledge/gut-health-v2.jsonl`) and one of Dr. Laura's raw daily Slack JSONs (download a sample via Drive MCP from the `gut-health` subfolder). Confirm the transformation.
4. Decide: does `ingest_knowledge.py` need a preprocessing step, or does it handle raw daily JSONs already?

If a converter is needed, write a small one at `services/analysis-engine/scripts/slack_export_to_text.py`:
- Accepts a path to a Slack channel subfolder containing `YYYY-MM-DD.json` files
- Reads `users.json` from the parent for username resolution
- Concatenates messages across all daily files in chronological order
- Resolves user IDs (`U0XXXXX`) to display names
- Skips bot messages, system messages, and empty messages
- Emits plain text in whatever shape `ingest_knowledge.py` consumes
- One CLI invocation produces one channel's text

Document the recipe in `docs/SLACK-EXTRACTION-RECIPE.md` so future-you (or a contractor) can re-run it on new channels.

## Execution sequence

### Step 1 — Stage files from Drive

Use Drive MCP to download and save into the repo's seed directories. Don't fetch what's already in repo (Cert PDFs — sizes were verified byte-identical to local during the survey).

**Slack content** → save to `database/seed/dr-laura-slack/raw-export/`:

- `canvases.json` (from Slack Export top level inside the unpacked folder)
- `users.json` (needed for username resolution by the converter)
- `channels.json` (metadata, ingestion tooling)
- The entire `mindset/` channel subfolder (51 daily JSONs)

**Peptide Workshop** → save to `database/seed/dr-laura-drive/peptide-workshop/`:

- `PeptideQuickReferenceGuide.pdf` (~11 MB)
- `Peptides_A_2026_Clinical_Deep_Dive SLIDE DECK.pdf` (~3.4 MB)
- `Peptides in Practice Full Recording TRANSCRIPT.pdf` (~25 KB)

The 11MB Quick Reference Guide is above the comfortable Drive MCP threshold. Use the documented streaming pattern (`cat ~/.claude/projects/.../tool-results/<id>.json | jq -r '.content' | base64 -d > <target>`) per the exhaust plan's notes if direct base64 return overflows context.

**Fellowship decks** → save to `database/seed/dr-laura-drive/fellowship-curriculum/`:

- **Module 1** (`module-1-endocrinology/`): the only Drive content is `1 Slide Per Page.zip` (~128 MB). Download the zip, save locally, then `unzip` it into the module-1 directory. Result should be N individual PDFs (number unknown until unzipped — survey didn't enumerate the zip contents). Discard the zip after successful unpack.
- **Module 2** (`module-2-neurovascular/`): download the 12 individual PDFs directly. Skip `Module II Bulk Download (1).zip` — the 12 unpacked PDFs are redundant with it. The 12 PDFs:
  - `Perlmutter Heart Brain.pdf` (20.04 MB)
  - `LePine GI Microbiome.pdf` (31.56 MB)
  - `Guarneri Women and Heart Disease.pdf` (29.68 MB)
  - `Houston Coronary Heart Disease.pdf` (21.35 MB)
  - `Houston Hypertension Cases.pdf` (2.31 MB)
  - `Houston Hypertension Part 1 and 2.pdf` (5.59 MB)
  - `Houston Dyslipidemia.pdf` (4.91 MB)
  - `Houston Vascular Aging & CVD.pdf` (5.30 MB)
  - `Davis Nitrative Stress.pdf` (7.49 MB)
  - `Krishnan Cartilage Inflammation Healthspan.pdf` (3.59 MB)
  - `Minich Nutrition and CHD.pdf` (4.73 MB)
  - `Shade Liposomal Delivery Solutions (Non-CME).pdf` (6.20 MB)

Most Module 2 PDFs are 20MB+ and well above the Drive MCP comfortable threshold. Use the streaming pattern for any file over 5MB.

Verify after staging: `find database/seed/dr-laura-drive/fellowship-curriculum -type f -name '*.pdf' | wc -l` should return at least 12 plus whatever Module 1 unpacked to.

**Cert PDFs** → already in `database/seed/dr-laura-drive/certification-materials/`. Skip re-download. Verify checksums match Drive (you already did this in the survey — proceed).

After staging, run a quick `find database/seed/dr-laura-slack database/seed/dr-laura-drive -type f | wc -l` to confirm everything landed.

### Step 2 — Build `ingest_canvas.py`

If not already present at `services/analysis-engine/scripts/ingest_canvas.py`, build it per the spec in `docs/CLAUDE-CODE-PROMPT-INGEST-CANVAS.md`, with these requirements layered on top:

- Each canvas page produces one or more knowledge entries (the canvas may be long; chunk if needed).
- One `knowledge_sources` row per canvas via `get_or_create_source(tenant_id, source_type='slack_thread', title='Slack Canvas: <canvas title>', leader_id=<Dr. Laura UUID>, metadata={'channel': <channel_name>, 'canvas_id': <id>})`. (Canvases logically belong to a channel; use that as the channel attribution. If a canvas isn't channel-bound, use `'workspace'` as the channel.)
- Write `source_id` on every entry per the Phase 1 pattern.
- Compute `content_hash` via the same `hashlib.sha256(content.encode('utf-8')).hexdigest()` path as `insert_knowledge_item` so dedup works across re-runs.
- Output JSONL in the shape `load_knowledge.py` consumes, then `load_knowledge.py` handles the actual insert + `post_ingest_finalize` hook.

Note on source_type: the migration 0016 CHECK constraint allows `'slack_thread'` but not `'slack_canvas'`. Use `'slack_thread'` with the metadata field disambiguating that this is canvas content. (Alternative: extend the enum via a migration — out of scope for this PR; record as a tech-debt follow-up issue.)

### Step 3 — Run the `mindset` channel ingestion

1. Run your preprocessing script (or `ingest_knowledge.py` directly if it handles raw JSONs) over `database/seed/dr-laura-slack/raw-export/mindset/` to produce `database/seed/knowledge/mindset-v2.jsonl`.
2. Spot-check the first 5 entries for quality before loading the full file.
3. Run `python scripts/load_knowledge.py --file database/seed/knowledge/mindset-v2.jsonl --tenant 00000000-0000-0000-0000-000000000001`.
4. `post_ingest_finalize` runs automatically (autotag → recompute → enqueue). Capture the summary counts.

Expected: ~30-80 new entries, all tagged with at least one knowledge_domain, ~5-15 routed to review queue if confidence is low.

### Step 4 — Run canvases ingestion

```bash
python scripts/ingest_canvas.py --input database/seed/dr-laura-slack/raw-export/canvases.json
python scripts/load_knowledge.py --file <canvases-output.jsonl> --tenant 00000000-0000-0000-0000-000000000001
```

Expected: ~50-100 new entries depending on canvas content density.

### Step 5 — Run Cert PDF ingestion

For each of the 3 Cert PDFs in `database/seed/dr-laura-drive/certification-materials/`:

```bash
python scripts/ingest_pdf.py \
  --input database/seed/dr-laura-drive/certification-materials/<filename>.pdf \
  --tenant 00000000-0000-0000-0000-000000000001 \
  --source-channel certification-materials \
  --source-type course_module
```

Run the smallest first (`Clinical_Foundation_Intake_Pattern_Recognition_Testing_Roadmap.pdf` at 1.17 MB) and spot-check before running the other two. Expected: ~50-150 entries each, ~$2-4 API cost each.

### Step 6 — Run Peptide Workshop ingestion

For each of the 3 Peptide PDFs in `database/seed/dr-laura-drive/peptide-workshop/`:

```bash
python scripts/ingest_pdf.py \
  --input database/seed/dr-laura-drive/peptide-workshop/<filename>.pdf \
  --tenant 00000000-0000-0000-0000-000000000001 \
  --source-channel peptide-workshop \
  --source-type course_module  # use 'training_recording' for the TRANSCRIPT pdf
```

For the transcript PDF, use `--source-type training_recording`. Expected: ~30-100 entries total across the 3 files.

### Step 7 — Run Fellowship Curriculum ingestion

This is the largest single step in the batch. Module 1's unpacked PDFs + Module 2's 12 PDFs may produce 500-1500 new entries. Run in order, smallest files first, to catch any issues early.

**For every Fellowship PDF, pass these extra flags to `ingest_pdf.py`** so the attribution metadata lands correctly:

- `--source-channel fellowship-module-1` or `fellowship-module-2`
- `--source-type course_module`
- `--metadata-original-speaker "<speaker name parsed from filename>"` — e.g., `"Perlmutter"` for `Perlmutter Heart Brain.pdf`
- `--metadata-original-presentation "<title parsed from filename>"` — e.g., `"Heart Brain"`
- `--metadata-curated-by "Dr. Laura"`
- `--metadata-curation-source "Academy for Anti-Aging Medicine Longevity Fellowship - Module 1"` (or Module 2)

If `ingest_pdf.py` doesn't currently accept `--metadata-*` flags, extend it to do so. The flags should map directly into the `metadata` JSONB field on each entry. Keep the change backward-compatible (defaulting to empty/null metadata when flags aren't passed).

**Execution order** (smallest → largest per module, to catch issues before sinking time into the big PDFs):

Module 2 first (already unpacked, smaller files first):
1. `Houston Hypertension Cases.pdf` (2.3 MB)
2. `Krishnan Cartilage Inflammation Healthspan.pdf` (3.6 MB)
3. `Houston Dyslipidemia.pdf` (4.9 MB)
4. `Minich Nutrition and CHD.pdf` (4.7 MB)
5. `Houston Vascular Aging & CVD.pdf` (5.3 MB)
6. `Houston Hypertension Part 1 and 2.pdf` (5.6 MB)
7. `Shade Liposomal Delivery Solutions (Non-CME).pdf` (6.2 MB)
8. `Davis Nitrative Stress.pdf` (7.5 MB)
9. `Perlmutter Heart Brain.pdf` (20.0 MB)
10. `Houston Coronary Heart Disease.pdf` (21.4 MB)
11. `Guarneri Women and Heart Disease.pdf` (29.7 MB)
12. `LePine GI Microbiome.pdf` (31.6 MB)

**Spot-check after PDF #1.** Read the first 10 extracted entries from Houston Hypertension Cases. Confirm:
- Content is coherent (not garbled OCR artifacts)
- `metadata.original_speaker` = `"Houston"`, `metadata.original_presentation` = `"Hypertension Cases"`, `metadata.curated_by` = `"Dr. Laura"`
- `leader_id` resolves to Dr. Laura
- Categories assigned by `post_ingest_finalize` are reasonable

If quality is good, continue through the list. If quality is bad (garbled text, missing structure), STOP and investigate before sinking more PDFs. The largest PDFs may need chunking strategy adjustment for very long decks — `ingest_pdf.py`'s current heading-aware chunking should handle 30MB PDFs, but verify on the first big one (Perlmutter at 20MB) before running the largest three.

Module 1 — unzip first, then ingest:

```bash
mkdir -p database/seed/dr-laura-drive/fellowship-curriculum/module-1-endocrinology
cd database/seed/dr-laura-drive/fellowship-curriculum/module-1-endocrinology
unzip "1 Slide Per Page.zip"
ls *.pdf  # confirm what was inside
```

Then run `ingest_pdf.py` on each unpacked PDF, smallest first, using the same `--source-channel fellowship-module-1` and `--metadata-*` pattern. The original speaker for each Module 1 PDF must be parsed from the unpacked filename — if the filename doesn't make the speaker obvious, default `metadata.original_speaker = "Unknown"` and flag the file in the PR body for Cowork/Ryan to resolve attribution later.

Expected total for Step 7: 500-1500 new entries depending on slide density. API cost likely $30-70.

### Step 8 — Re-run already-loaded channels for idempotency proof

Loop over the existing v2 JSONLs in `database/seed/knowledge/` for the 28 already-loaded clinical channels. Re-run `load_knowledge.py` against each. Per PR #215's content-hash dedup, this should produce zero new entries — that's the proof the foundation is intact.

If any re-run produces > 0 new entries, stop and investigate — that's a dedup bug.

## Verification before opening the PR

Run each and paste the output into the PR body.

### Check 1 — Corpus growth

```sql
SELECT
  COUNT(*) AS total_entries,
  COUNT(DISTINCT source_id) AS total_sources,
  COUNT(DISTINCT source_channel) AS distinct_channels,
  MIN(created_at) AS earliest_entry,
  MAX(created_at) AS latest_entry
FROM clinical_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
```

Expected: entries grew from ~2,663 (post PR #215) by 800-2000 (with Fellowship Module 1 + 2 included; the range is wide because Module 1's contents are unknown until unzipped). Sources grew from 33 by ~18-30 (canvases, mindset, peptide-workshop, certification-materials, plus one source per Fellowship PDF). Every entry has `source_id` set (verify the COUNT(DISTINCT source_id) equals or is close to expected source count).

### Check 2 — No orphans

```sql
SELECT COUNT(*) AS orphans
FROM clinical_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND (source_id IS NULL OR source_channel IS NULL);
```

Expected: 0.

### Check 3 — Domain coverage

```sql
SELECT
  unnest(domains) AS domain,
  COUNT(*) AS n
FROM clinical_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '2 hours'
GROUP BY 1
ORDER BY n DESC;
```

Expected: new entries spread across domains. Significant counts in `hormones`, `nervous_system`, `gut`, `metabolism` (consistent with the new content topics). If any new entries have empty `domains = '{}'`, that's an autotag failure — investigate.

### Check 4 — Re-run idempotency

After Step 8 completes, run:

```sql
SELECT COUNT(*) AS expected_zero
FROM clinical_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND created_at > now() - interval '30 minutes'
  AND source_channel IN (
    'gut-health', 'hormones', 'supplements', /* ...28 already-loaded channels */
  );
```

Expected: 0 (re-running already-loaded channels added nothing).

### Check 5 — Review queue health

```sql
SELECT
  review_type,
  status,
  COUNT(*) AS n
FROM knowledge_review_queue
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY 1, 2
ORDER BY 1, 2;
```

Expected: some new `low_confidence` and `low_faithfulness` entries from the batch. Look at counts; if a single category (e.g., Cert PDF Module 2) accounts for >50% of review-queue adds, the chunker may be misbehaving on that file — flag in the PR body.

### Check 6 — Spot-check 5 new entries per source

For each new `knowledge_sources` row created in this PR, pull 5 entries and read them. Confirm:
- Content is coherent (not LLM hallucination of structure)
- `source_channel` and `source_id` are correct
- `category` and `domains` are reasonable
- `metadata` has the expected fields populated

This is a manual eyeball check. Paste the 5×N entries into the PR for Cowork/Ryan to review.

## Hard constraints

- **Idempotent across the entire run.** Every step must be safe to re-run.
- **No corruption of existing 2,663 rows.** Re-runs that hit existing content_hashes must be no-ops.
- **Dr. Laura attribution only.** Every new entry gets `leader_id = <Dr. Laura UUID>` via `get_or_create_source(leader_id=...)`. No external-leader content sneaks in.
- **Stay in scope.** If you encounter content during Drive MCP fetches that suggests Fellowship/external-leader material, do not ingest it. Flag it in the PR body and stop.
- **No PHI involved.** Standard tenant safety patterns apply.
- **Branch:** `feat/historical-batch-ingestion`. Draft PR. Don't merge.

## Out of scope (repeated for emphasis)

- Fellowship slide decks — separate PR with proper external-leader attribution
- Non-clinical Slack channels (the 8 listed above)
- Conflict detection (C.3) — separate workstream
- Drive watcher (P0.6) — separate workstream
- Schema changes (adding `slack_canvas` to source_type enum) — flag as tech-debt issue, don't address here

## Deliverable

Draft PR titled "Historical batch — Dr. Laura's curated content into the KB" with:

- Six verification check outputs
- Spot-check entries from Check 6
- A summary table: rows before / rows after / new sources / API cost per file group
- A note on the Slack extraction recipe you discovered (and the `docs/SLACK-EXTRACTION-RECIPE.md` if you built one)
- Any flagged content you encountered and skipped (per "Stay in scope" above)
- A note on the `slack_canvas` source_type schema decision (flagged tech-debt issue or not)

Tag Ryan for review. Don't merge until he confirms the spot-check entries look like real Dr. Laura content and the KB growth numbers match expectations.

After this lands, Dr. Laura's curated Layer 1 content is in the KB — including Fellowship material under her curator attribution. Next steps then become: Phase 5 (Drive watcher for new content she adds going forward) and Phase 7 (C.3 conflict detection + Dr. Laura resolution UI). Future direct external-leader work (e.g., direct ingestion of Gottfried's *Hormone Cure*, Cole's *Gut Feelings*) — content Dr. Laura has NOT curated — remains a separate Layer 1 expansion workstream that creates proper leader rows for each author. That's Phase 8.
