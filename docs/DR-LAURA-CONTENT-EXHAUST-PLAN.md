# Dr. Laura Content Exhaust Plan

**Created:** May 11, 2026 (late night, post-smoke-test session)
**Status:** Priority 0 — MVP launch-blocking
**Owner:** Ryan (procurement + scheduling), Claude Code (execution), Cowork (planning + diffs)

---

## Why this exists

The moat IS Dr. Laura's curated content. Everything else is infrastructure. As of tonight, ~30-40% of what she's shared is actually in the knowledge base. Her original April-14 Slack dump has sat partially-unprocessed for almost a month while we built foundation engineering on top of it. That order is backwards — the foundation work was prerequisite, but content ingestion should now be the dominant workstream until exhausted.

**The rule from here forward:** Dr. Laura content ingestion runs continuously in the background. Other work (Layer A.3 security, Layer D engineering, etc.) happens alongside it but never gates it. Whoever is doing engineering work always has "what's the latest from Dr. Laura's Drive?" as a parallel concern.

---

## Inventory — what's in Dr. Laura's Drive (as of May 12, 2026)

### Folder 1: "Slack Export - Mentorship" (Drive folder `161VCvz43IVXDGuO3M2JPZamp1K5HZCGe`)

Shared April 14, 2026.

#### Already ingested (~21 channels, 1,144 entries)
gut-health, hormones, supplements, sleep, skin, metabolism, detox, protocols, serum_testing, brain-health, chronicdisease, fertility, fitness-and-exercise, nervoussystemregulation, peptides, plant-medicine, case-studies, fat-loss-and-metabolism, coachingskills, clientfeedbackrequests, biohacking_and_longevity, nutrition-and-meal-planning, metabolic-health-and-blood-sugar

#### Queued, NOT ingested (~12 channels, estimated 360-500 more entries)
livecallschedule-topics, call_replays, announcements, booksandresources, products-and-brands-we-love, hormoneai, entrepreneurgrowthtopics, collaborations-and-referrals, systemsandprocesses, mindset, whhps_certification, plus several others. JSONL files exist in `database/seed/knowledge/`; just need to run `load_knowledge.py` once #191 (v1/v2 categories) lands.

#### Slack metadata files (need separate handling, NOT ingested)
- `canvases.json` (24KB) — **Slack Canvases are curated structured docs people pin to channels. Higher signal-to-noise than regular messages.** Worth its own ingestion pass.
- `users.json` (76KB) — user roster; useful for attribution, not for knowledge extraction
- `channels.json` (42KB) — channel metadata; useful for ingestion tooling
- `huddle_transcripts.json` (6 bytes — effectively empty, ignore)
- `file_conversations.json` (4 bytes — empty, ignore)
- `lists.json` (6 bytes — empty, ignore)
- `integration_logs.json` (5.6KB — not knowledge content, ignore)

### Folder 2: "Clinical Signal Sources" (Drive folder `1f4PY0gvedz-FX8qouKCfARATmXKIYsFf`)

Shared May 12, 2026 (about an hour ago as of writing). **This folder is actively being populated.** Dr. Laura is uploading curriculum content specifically for the project.

#### Certification Materials subfolder (`16ebCp1hcpHAXuvcCwPO5ayY_jMHElEzr`)

Three PDFs already there (~6MB total):
- `Clinical_Foundation_Intake,_Pattern_Recognition_&_Testing_Roadmap.pdf` (1.2MB)
- `Module_1_A_Systems-Biology_Approach_to_Hormones.pdf` (1.5MB)
- `module 2 The HPA Axis and Stress Resilience.pdf` (3.6MB)

Pure moat content. Zero licensing or DRM friction. Directly Dr. Laura's teaching framework.

#### Academy for Anti-Aging Medicine Longevity Fellowship Curriculum Slide Decks subfolder (`1LDtmrxsuDnBRVYKpuhX-mj8G2EHwfCiJ`)

Institutional-grade fellowship curriculum, currently with:
- Module 1: endocrinology (subfolder)
- Module 2: neurovascular and metabolic synergy (subfolder)

Dr. Laura is actively adding modules — expect this to grow.

---

## Ingestion gap

| Source | Estimated size | Ingested? | Blockers |
|---|---|---|---|
| Slack channels (loaded) | 1,144 entries | ✓ Yes | None |
| Slack channels (queued) | 360-500 entries | ❌ No | #191 v1/v2 category fix needed first |
| Slack canvases.json | 24KB | ❌ No | No canvas-ingestion path exists |
| Slack whhps_certification | tiny | ❌ No | Trivial — pickup once #191 lands |
| Certification Materials (3 PDFs) | ~6MB | ❌ No | No PDF→knowledge-entry ingestion path exists |
| Fellowship slide decks | Unknown, growing | ❌ No | No slide-deck ingestion path exists |

---

## Required engineering work

### Phase 1 — Unblock the existing-format ingestion (this week)

1. **Fix #191** — v1/v2 category constraint drift. Trivial migration. Without it, the queued Slack channels (which include v2-format JSONLs) can't load.
2. **Run `load_knowledge.py`** on each remaining queued JSONL in `database/seed/knowledge/`. Each load now triggers the C.1.6 post-ingest finalize hook (autotag + recompute + enqueue). Expected ~360-500 additional entries, ~$10-15 in API costs.

After Phase 1: Slack content is fully ingested. ~1,500-1,700 entries in the KB, all tagged + scored + queue-eligible.

### Phase 2 — Add PDF ingestion pipeline (this week)

The Certification Materials PDFs need a new ingestion path. The existing `ingest_knowledge.py` expects JSONL input; we need to extract text from PDFs and chunk them into the same shape.

Implementation:
- New script `services/analysis-engine/scripts/ingest_pdf.py`
- Uses pdftotext (poppler) or pypdf to extract text — keep it simple, no OCR needed since these are digital PDFs not scans
- Chunks by section heading or paragraph (reuse the existing chunkText logic where possible)
- Produces JSONL in the same shape as Slack JSONL: `{title, content, category, source_channel, source_chunk_hash, metadata}`
- Then standard `load_knowledge.py` picks it up

The `source_channel` field for PDF content should reflect provenance — e.g., `certification-materials` or `fellowship-module-1`. Worth a new column or metadata field to distinguish source types more cleanly than overloading `source_channel`, but for MVP, overloading works.

Estimated effort: 1-2 days for a clean ingest_pdf.py + chunking heuristics that produce usable knowledge entries.

### Phase 3 — Add Slack Canvas ingestion (small, optional for MVP)

Slack canvases.json contains structured documents in Slack's JSON format. Parse, extract text, chunk, ingest. Similar pattern to ingest_pdf.py but simpler (already JSON). Estimated effort: half day.

### Phase 4 — Add Drive watcher (this week or early next, before launch)

Automate the "Dr. Laura uploads new content → it gets ingested" loop. Options in order of complexity:

**(a) Manual trigger** (lowest effort, fine for MVP)
- Documented one-command workflow: `python scripts/sync_drive_content.py`
- Lists files in the two known Drive folders, downloads new/changed ones to `database/seed/dr-laura-drive/`, runs ingestion
- Practitioner or Ryan runs it whenever they upload new content
- ~1 day to build

**(b) Polling cron job** (recommended for MVP)
- Same script as (a), but runs on a schedule (e.g., every hour or every 4 hours)
- Logs new ingestions to a file Dr. Laura can review
- Sends Ryan a notification when new content is detected and ingested
- ~1-2 days to build (the script is the same, just add scheduling + notification)

**(c) Drive push notifications / webhook** (overengineered for MVP)
- Use Google Drive's Changes API or push notifications
- Real-time, but requires a public webhook endpoint
- Skip for MVP; revisit if polling latency becomes a real issue

**Recommendation: (b) polling cron, hourly.** Cheap to build, low latency to detect new content, doesn't require any new infrastructure.

### Implementation: Drive watcher details

```python
# services/analysis-engine/scripts/sync_drive_content.py
#
# Usage:
#   python scripts/sync_drive_content.py [--dry-run]
#
# Polls the two known Drive folders, downloads new files, runs ingestion.

DRIVE_FOLDER_IDS = {
    "slack-export-mentorship": "161VCvz43IVXDGuO3M2JPZamp1K5HZCGe",
    "clinical-signal-sources": "1f4PY0gvedz-FX8qouKCfARATmXKIYsFf",
}

INGESTED_MANIFEST = "database/seed/dr-laura-drive/.ingested.json"
# Tracks: file_id -> {modified_time_at_ingestion, content_hash, ingestion_status}

# Process:
# 1. For each folder ID, list files recursively (Drive API)
# 2. Compare to manifest. New files OR files where modified_time > last-seen need (re)processing.
# 3. Download new/changed files to database/seed/dr-laura-drive/<folder>/<filename>
# 4. Route by file type:
#    - .jsonl → load_knowledge.py
#    - .pdf → ingest_pdf.py → load_knowledge.py
#    - canvases.json → ingest_canvas.py → load_knowledge.py
#    - other → skip with warning
# 5. Update manifest after successful ingestion
# 6. Log summary

# Scheduling (separate from script):
#   crontab: 0 * * * * cd /path/to/clinical-signal-main && python services/analysis-engine/scripts/sync_drive_content.py
```

Drive auth: use a service account with read access to the two folder IDs, OR use OAuth with Ryan's account. Service account is more sustainable; OAuth is faster to set up.

#### Drive MCP file-size handling (operational note)

When downloading files via the Drive MCP `download_file_content` tool, the base64-encoded response can overflow Claude Code's context window for files larger than a few MB. The tool harness auto-streams large results to disk under `~/.claude/projects/.../tool-results/<id>.json`, and they can be extracted cleanly with:

```bash
cat ~/.claude/projects/.../tool-results/<id>.json | jq -r '.content' | base64 -d > /target/path/file.pdf
```

Verified working for files up to ~4MB (Module 2 HPA Axis PDF). Pattern probably works for files up to whatever the disk-write limit is, but for the largest Fellowship slide decks (potentially 20-50MB each), worth testing the bound or falling back to direct browser download.

---

## MVP quality gate

The "exhaust Dr. Laura content" gate is met when ALL of the following are true:

- [ ] #191 v1/v2 category fix merged
- [ ] All queued Slack channels loaded (~360-500 entries added)
- [ ] Slack canvases.json content ingested
- [ ] All 3 Certification Materials PDFs ingested (~50-150 entries each, ~$5-10 API cost)
- [ ] Fellowship slide decks ingested as Dr. Laura completes them (rolling)
- [ ] Drive watcher running on a schedule, picking up new content within 4 hours of upload
- [ ] Knowledge base contains 2,000+ entries, all Dr. Laura curated
- [ ] No external leaders ingested yet (Gottfried, Cole, Hyman explicitly deferred until this gate passes)

Target: meet this gate within 7-10 days. Block any new external-leader content acquisition until met.

---

## What this changes about the prioritization doc

Rev 7 of `docs/MVP-PRIORITIZATION-2026-05-08.md` should:

1. Add a "**Priority 0 — Exhaust Dr. Laura content**" section at the top of the work list, ABOVE Layer A.
2. Reframe the schedule: Layer A (compliance/infra), Layer B (moat-protection), Layer A.3 (security), Layer D (extensibility) all continue but now run in parallel with Priority 0, not sequentially before it.
3. Defer all external-leader content acquisition (Gottfried, Cole, Hyman, Patrick, Huberman, Holmes) until Priority 0 quality gate is met.
4. Layer C.2 (KO data ingestion) is essentially re-scoped to Priority 0 + Drive watcher building.

---

## Tonight's concrete starting actions

If we want momentum right now (i.e., before sleep):

1. **File the MVP-gate issue** (5 min, Claude Code) — tracks the gate above
2. **Download the 3 Certification PDFs from Drive into `~/clinical-signal-main/database/seed/dr-laura-drive/`** (5-10 min, Claude Code via Drive MCP or browser download) — stages them for ingestion
3. **Stop for the night.** Tomorrow morning's starting sequence becomes: fix #191 (small) → ingest the queued Slack channels → start building the PDF ingestion script.

Or just file the issue and download the PDFs and call it.

---

## Why this is fair criticism

Dr. Laura shared the Slack export April 14. We're now May 11. That's nearly four weeks where her curated content sat mostly-unprocessed while engineering work happened on top of it. The smoke test caught a bunch of latent bugs (which was real value), but the actual moat — the data — has lagged.

The right pattern from here: Dr. Laura content ingestion is a continuous background workstream, never gated behind other engineering work. Engineering work happens in parallel, not in sequence ahead of it.
