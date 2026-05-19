# P0.6 — `sync_drive_content.py` Drive Watcher Design

**Status:** Design / pre-build. Implementation in three Claude Code phases.
**Owner:** Cowork (design), Claude Code (implementation).
**MVP gate:** Issue #203 — completes the content-exhaust workstream by making content ingestion hands-off.

## Goal

Detect new content in Dr. Laura's "Clinical Signal Sources" Google Drive folder, automatically pull it, run the appropriate ingest script, and load the resulting JSONL into the `clinical_knowledge` table. Run hourly. Idempotent across runs (no duplicate ingestion). No manual steps once set up.

## Why this is the MVP gate

Without the watcher, content ingestion is a manual ritual: Dr. Laura uploads a file to Drive, then someone has to remember to download it, run `ingest_pdf.py`, run `load_knowledge.py`, verify, etc. With the watcher running on a schedule, every new file Dr. Laura drops in the Drive folder gets picked up within an hour and lands in the knowledge base without human attention. This is what makes the moat content layer actually compounding rather than batch-and-forget.

## Architecture

Three Claude Code phases, each a separate PR. Sub-task decomposition per the project's working principles.

### Phase 0 — Manual setup (Ryan, ~10 min)

This is the prerequisite. Cannot be automated. Has to happen before any code can be written.

1. **Create a Google Cloud project** (if one doesn't already exist for Clinical Signal).
2. **Enable the Drive API** on the project.
3. **Create a service account.** Give it a name like `clinical-signal-drive-watcher`.
4. **Generate a JSON key file** for the service account. Download it.
5. **Share the Drive folder with the service account's email address.** Read-only access. The service account email looks like `clinical-signal-drive-watcher@<project-id>.iam.gserviceaccount.com`.
6. **Store the JSON key file securely.** Two places:
   - Local dev: `~/clinical-signal-main/.env.local` referenced via `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`. The key file itself goes in `~/clinical-signal-main/secrets/drive-watcher-key.json` and is **gitignored** (the `secrets/` directory should be in `.gitignore`).
   - Production (Aptible): uploaded as an environment secret, mounted at `/secrets/drive-watcher-key.json`.

Detailed step-by-step walkthrough lives in this doc's companion `docs/CLAUDE-CODE-PROMPT-DRIVE-WATCHER-PHASE-0.md` — that's the version you actually paste into Claude Code for help, but the manual Google Cloud Console clicks have to be done by a human.

### Phase 1 — DB state + auth skeleton

**Scope:** Migration for state table, auth helper, polling loop skeleton, no actual ingestion yet.

- New migration `0018_drive_sync_state.sql` adding:
  ```sql
  CREATE TABLE drive_sync_state (
    drive_file_id   TEXT PRIMARY KEY,
    file_name       TEXT NOT NULL,
    file_md5        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    drive_modified_at TIMESTAMPTZ NOT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_processed_at TIMESTAMPTZ,
    status          TEXT NOT NULL CHECK (status IN
                      ('pending','processing','loaded','failed','skipped')),
    failure_reason  TEXT,
    knowledge_entries_inserted INT DEFAULT 0,
    folder_id       TEXT NOT NULL,
    UNIQUE (drive_file_id, file_md5)
  );
  CREATE INDEX idx_drive_sync_state_status ON drive_sync_state (status);
  CREATE INDEX idx_drive_sync_state_folder ON drive_sync_state (folder_id);
  ```
- New script `services/analysis-engine/scripts/sync_drive_content.py` with:
  - Drive client auth via `google-oauth2` + `google-api-python-client` (service account flow)
  - `list_folder_contents(folder_id)` — paginated, returns `[{id, name, md5Checksum, mimeType, modifiedTime}, ...]`
  - `compare_against_state(files)` — returns the list of files that are new or changed since last run
  - `--dry-run` flag that lists what would be ingested without doing anything
  - Empty dispatch function (Phase 2 fills it in)

- **Verification:** Run `--dry-run` against the production Drive folder. Expected output: list of files currently in the folder, all marked "would ingest" on first run (state table empty). Run a second time after a no-op write to `drive_sync_state` — expected: empty list (no files have changed).

- **Phase 1 deliverables:** Migration 0018, sync_drive_content.py skeleton, ingestion-deferred. Branch `feat/drive-watcher-phase-1`. Draft PR.

### Phase 2 — Dispatch + ingestion + idempotency

**Scope:** Actually pull and ingest files.

- File-type dispatch:
  - `application/pdf` → download file, call `ingest_pdf.py` with appropriate args, call `load_knowledge.py` on the resulting JSONL
  - `application/vnd.google-apps.document` (Google Doc) → export as PDF via Drive API, then PDF path
  - `application/vnd.google-apps.presentation` (Google Slides) → export as PDF via Drive API, then PDF path
  - Everything else → status='skipped', log the mime_type
- Download files to a temp directory (`/tmp/drive-watcher/<file_id>/...`); clean up after each file.
- For each file: update `drive_sync_state` row through states `pending → processing → loaded` (or `failed` with `failure_reason`).
- Idempotency: never reprocess a file whose `(drive_file_id, file_md5)` tuple already exists with `status='loaded'`. If `md5` changed, treat as a new file (re-ingest); the `source_chunk_hash` dedup inside `load_knowledge.py` will handle content-level dedup.
- `--folder-id <id>` flag, required. Default folder ID lives in an environment variable `DRIVE_WATCH_FOLDER_ID` set in `.env`.

**Verification:** Run end-to-end against the production folder. Expected on first real run: every Module PDF + Clinical_Foundation PDF re-ingested (since they're not in `drive_sync_state` yet), `clinical_knowledge` row count increases by the chunk count, all entries attributed to Dr. Laura. On second run immediately after: zero new ingestion. Add a synthetic new PDF to the folder, re-run, confirm only that one file is processed.

**Phase 2 deliverables:** Updated sync_drive_content.py with full dispatch, end-to-end smoke test result in the PR body. Branch `feat/drive-watcher-phase-2`. Draft PR.

### Phase 3 — Scheduling + observability

**Scope:** Make it actually run hourly.

- Add cron entry to `infrastructure/docker/Dockerfile.engine` or (cleaner) a separate `drive-watcher` service in `docker-compose.yml` that runs the script in a loop with `sleep 3600`.
- Production scheduling: Aptible scheduled task `*/60 * * * *` calling `python scripts/sync_drive_content.py --folder-id $DRIVE_WATCH_FOLDER_ID` (or whatever cron syntax Aptible expects).
- Observability:
  - Structured log lines (`[drive-watcher] start folder=<id>`, `[drive-watcher] file_seen ...`, `[drive-watcher] dispatched ...`, `[drive-watcher] done inserted=N skipped=M failed=K`)
  - One-line summary metric: count of files processed per run, written to a new `drive_sync_runs` table (or just relied on by querying `drive_sync_state` with `last_processed_at` filters)
  - Failure alerting: if `status='failed'` count > 0 in last run, log loud warning. (Email/Slack alerts are post-MVP.)

**Verification:** Local Docker `up` with the new service. Wait 60+ minutes. Check logs for two cycle starts. Confirm idempotency held.

**Phase 3 deliverables:** Compose change, optional `drive_sync_runs` table, README notes on the new service. Branch `feat/drive-watcher-phase-3`. Draft PR.

## Authentication note

The Drive MCP we used yesterday to pull the Certification PDFs runs interactively from inside Cowork. **It's not reusable for a background watcher.** Background services need direct service-account auth via a JSON key. This is exactly the "you can't operate without setting up Phase 0 first" gating step.

## Folder ID(s) to watch

Single folder for MVP. Folder name: "Clinical Signal Sources" in Dr. Laura's Drive. ID needs to be captured at Phase 0 step 5 and stored in `.env` as `DRIVE_WATCH_FOLDER_ID`. Multi-folder watching is post-MVP.

## What this does NOT do

Deliberately out of scope for the MVP version:

- **Slack canvas full-body fetching** — deferred (Issue #210). Will be added as a separate "watched source" of type 'slack' in a post-MVP iteration.
- **Webhook-based push notifications** — Drive supports push notifications, but they require an HTTPS endpoint reachable from Google, which complicates the local-dev story. Polling is fine for hourly cadence.
- **PHI scanning** — these are Dr. Laura's own content files, non-PHI by construction. If she ever drops a patient chart into the folder by accident, the existing audit log + manual review queue catches it after the fact.
- **Auto-classification of arbitrary file types** — anything not in the PDF/GoogleDoc/Slides triumvirate gets `status='skipped'`. Add new types as Dr. Laura's content patterns evolve.
- **Retry with exponential backoff** — Phase 1/2/3 just records failures. A separate post-MVP retry pass can pick failed rows back up.

## Success criteria for closing Issue #203's "Drive watcher operational" line item

1. Service runs continuously (hourly cycle) in local Docker for 24 hours without crashing
2. New file added to Drive folder appears in `clinical_knowledge` within 90 minutes
3. Idempotency verified: re-running on no-change folder produces zero new rows
4. All entries attributed to Dr. Laura (`leader_id` not NULL)
5. Production deployment plan documented (Aptible scheduled task config in `docs/`)

All five must hold. Quality-gated, not date-driven.
