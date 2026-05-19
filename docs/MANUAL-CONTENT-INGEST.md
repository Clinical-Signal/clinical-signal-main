# Manual Content Ingest — Pre-Watcher Workflow

Until the Drive watcher (deferred from MVP — see deferral issue) is operational, new content added to Dr. Laura's Drive folder needs to be ingested manually. This doc is the runbook.

**Time per file:** about 2-3 minutes of human attention plus 1-5 minutes of automated processing.

## When to run this

Run it whenever Dr. Laura adds new content to the "Clinical Signal Sources" Drive folder (or any other source folder we treat as authoritative). A reasonable cadence is weekly — pick a fixed time (Friday afternoon, for example) and check the folder for new files.

## Step-by-step

### Step 1 — Find new files

Open Dr. Laura's "Clinical Signal Sources" Drive folder in your browser. Files added since the last ingestion run are the ones whose "Last modified" timestamp is newer than `database/seed/dr-laura-drive/.last_ingest_at` (track this manually in a comment for now, or just look at recently-modified files).

### Step 2 — Download files into the repo

For each new file, download it into `~/clinical-signal-main/database/seed/dr-laura-drive/<subfolder>/` where `<subfolder>` mirrors the Drive folder structure (e.g., `certification-materials/`, `fellowship-modules/`).

Use the Drive download button or `gdrive` CLI if you prefer. The Drive MCP in Cowork can also pull files directly — ask Cowork "pull file X from Dr. Laura's Drive into the certification-materials folder" and it'll handle it.

### Step 3 — Run the appropriate ingest script

For PDFs:

```bash
cd ~/clinical-signal-main
docker compose exec -T analysis-engine python scripts/ingest_pdf.py \
  database/seed/dr-laura-drive/<subfolder>/<filename>.pdf \
  --leader-slug dr-laura \
  --source-channel <subfolder-name> \
  --source-title "<human-readable title>" \
  --output /tmp/<filename>.jsonl
```

For Google Docs / Google Slides: export from Drive as PDF first, then follow the PDF path above.

For Slack canvases (if/when Slack canvas full-body ingestion is built per Issue #210): use `ingest_canvas.py`.

### Step 4 — Load JSONL into the database

```bash
docker compose exec -T analysis-engine python scripts/load_knowledge.py /tmp/<filename>.jsonl
```

Watch for these log lines:
- `[load] done inserted=N` — N should be > 0
- `[finalize/autotag] ...`
- `[finalize/confidence] ...`
- `[finalize/enqueue] ...`

If any of these are missing, check the error and re-run.

### Step 5 — Verify

```sql
-- Run via: docker compose exec -T db psql -U postgres -d clinical_signal -c "<query>"

SELECT _source->>'file' AS source_file, COUNT(*), AVG(confidence_score)
  FROM clinical_knowledge
 WHERE _source->>'file' = '<filename>.pdf'
 GROUP BY 1;
```

Expected: row count matches the JSONL line count, average confidence is in a reasonable range (0.55-0.75 typical).

### Step 6 — Update tracking

After ingest succeeds, update `database/seed/dr-laura-drive/.last_ingest_at` with the current timestamp (`echo "$(date -u +%FT%TZ)" > database/seed/dr-laura-drive/.last_ingest_at`) and commit it. This is the manual stand-in for the `drive_sync_state` table the watcher would maintain.

Commit the new file(s) themselves too — repo is the source of truth until the watcher exists.

## Anti-patterns to avoid

- **Don't run `ingest_pdf.py` twice on the same file** — the idempotency key (`source_chunk_hash = sha256(content)`) dedups at the entry level, so re-running is safe, but it wastes API budget on the classification calls.
- **Don't skip the leader-id check after load** — if `clinical_knowledge.leader_id` is NULL on new rows, you have a regression. The post-ingest finalize chain (PR #186) should attribute correctly, but verify with: `SELECT COUNT(*) FILTER (WHERE leader_id IS NULL) FROM clinical_knowledge WHERE _source->>'file' = '<filename>.pdf';` — must be 0.
- **Don't ingest patient files this way** — this workflow is for Dr. Laura's curated knowledge content (her IP, her teaching materials, her protocols). Patient records have a totally separate pipeline (`intake_documents`, patient PDF upload, lab extraction). Don't cross the streams.

## When to upgrade to the watcher

Revisit the deferred watcher when one of these triggers fires:
- Content cadence picks up (more than ~1 new file per week consistently)
- Dr. Laura's frustration with manual delay justifies the engineering investment
- A new content source comes online that's harder to manually monitor (Substack RSS, podcast transcripts, etc.)
- Aptible production deployment requires automated content sync for compliance / audit reasons

At that point, see `docs/SYNC-DRIVE-CONTENT-DESIGN.md` for the architecture and `docs/DRIVE-WATCHER-PHASE-0-WALKTHROUGH.md` for the auth setup. Both docs were authored at the time of the original deferral and should be reviewed-and-updated before Phase 1 implementation begins, since some assumptions (Google Workspace policies, MCP availability) may have changed.
