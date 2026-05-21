# Historical Batch Ingest — Design

**Created:** May 18, 2026
**Status:** Strategic design — operationalizes `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md` (May 11) with four quality decisions locked in by Ryan
**Author:** Cowork planning session with Ryan
**Companions:** `DR-LAURA-CONTENT-EXHAUST-PLAN.md` (operational phases), `MVP-PRIORITIZATION-2026-05-08.md` rev 7 (overall sequencing), `KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md` (original gap analysis)

---

## Why this doc exists

Ryan, May 18: "This is our moat — getting it right matters more than getting it fast."

The May 11 content-exhaust plan laid out the right *operational* phases (Slack remainder → PDF ingest → canvases → Drive watcher) but didn't pick sides on four quality-vs-speed knobs that change the underlying design. This doc captures those decisions, reconciles the phase plan against verified git state (the prioritization doc has drift), and breaks the work into Claude Code handoff prompts.

The two-layer moat from CLAUDE.md sets the bar: Layer 1 is Dr. Laura's curated content, Layer 2 is each practitioner's private extensibility. Layer 1 ingestion is what this doc covers. Getting Layer 1 right *now* matters because:

1. The same patterns apply to Layer 2 — what we build for Dr. Laura's content gets reused for every practitioner's uploads.
2. Re-running the batch later with better idempotency / provenance is expensive (re-extraction $$, manual review time, duplicate cleanup).
3. The moat compounds — every week of clean ingestion adds defensible content; every week of messy ingestion adds cleanup debt.

---

## Reconciled state (verified against `main`, May 18)

`MVP-PRIORITIZATION-2026-05-08.md` rev 7 has meaningful drift. Verified against `git log`:

| Item | Rev 7 status | Git reality |
|---|---|---|
| C.1.6 post-ingest finalize | "in flight as draft PR" | ✅ Merged `ca3a38d` (PR #186) |
| `ingest_pdf.py` | "Handoff prompt in flight" | ✅ Merged `8c6a39b` (PR #207) |
| v1/v2 category fix | "PR #204 merged" | ✅ Confirmed `6b918df` |
| Issue #166 Goals removal | "PR status TBD" | ✅ Merged `82379c0` (PR #188) |
| A.3.1 outputs ownership check | OPEN | ✅ Merged `41ce9b6` (PR #189) |
| A.3.3 intake-docs magic bytes | OPEN | ✅ Merged `245d780` |
| A.3.6 partial index | OPEN | ✅ Merged `c6f4f71` (PR #190) |
| P0.2 Slack remainder load | "In progress May 12" | Branches exist; needs verification of which v2 JSONLs actually loaded |

**Implication:** The "in-flight" section of Rev 7 is essentially done. Layer A.3 security gaps are closing. The blocking surface for the historical batch is much smaller than the doc suggests — most of what's "open" is actually the new work this doc proposes.

Migrations through `0021_extend_category_check_v2.sql` are applied. Ingest scripts in `services/analysis-engine/scripts/`: `ingest_knowledge.py`, `ingest_pdf.py`, `load_knowledge.py`, `autotag_domains.py`, `recompute_confidence.py`, `recompute_faithfulness.py`, `enqueue_review.py`, `build_graph.py`. `post_ingest_finalize` lives at `services/analysis-engine/app/knowledge/db.py:500`. Three certification PDFs staged at `database/seed/dr-laura-drive/certification-materials/`. `database/seed/dr-laura-slack/` exists but contains only `.gitkeep` — **canvases.json is not in the repo**.

---

## Strategic decisions (locked in May 18)

These came out of an AskUserQuestion round with Ryan and define the quality bar for the batch.

**Decision 1 — Idempotency: add `content_hash` column, dedup on `(tenant_id, content_hash)`.**
Today's dedup key is `(tenant_id, source_chunk_hash, title)`. The original Phase 1 prompt (May 18) proposed tightening to `(tenant_id, source_chunk_hash)` — that proposal was wrong. Pre-migration analysis (Claude Code, May 19) found 145 chunk-hash groups containing 1,025 legitimate multi-extract rows: a single Slack thread routinely produces multiple distinct knowledge entries (a supplement protocol AND a lab interpretation AND a sequencing note from one chunk). Chunk-only dedup would cap each chunk to one surviving entry on re-ingest, destroying the corpus. The real worry — re-extracting the same item with a varied title — is content-level, not chunk-level. Right fix: add `content_hash = sha256(content)` column and dedup on `(tenant_id, content_hash)`. Re-extracting an existing item is now a true no-op; different items from the same chunk all survive; varying titles don't matter. Backfillable in migration 0022 with `UPDATE clinical_knowledge SET content_hash = encode(sha256(content::bytea), 'hex')` over the existing 2,667 rows (all distinct content, no cleanup needed). `source_chunk_hash` stays as provenance but is no longer part of the uniqueness contract.

**Decision 2 — Source registry: backfill `knowledge_sources` as we ingest.**
The table is defined in migration 0016 but empty; all provenance currently lives in the `_source` JSONB column. Decision: populate it. One row per Slack channel, canvas page, PDF, slide deck. Sets the precedent for external-leader ingestion. Citations in protocol generation become rich and queryable ("Dr. Laura, #gut-health canvas: GI MAP interpretation") rather than opaque JSONB lookups. ~1 day of script changes.

**Decision 3 — Conflict detection: build C.3.1 graph-walk now, run after the batch.**
Departs from my recommendation to defer. Ryan's call: Dr. Laura's self-contradictions across channels (e.g., supplement sequencing in `#gut-health` vs `#hormones`) are real and worth resolving before launch. Building C.3.1 + C.3.2 now also produces real test data for the resolution UI — better than the alternative of debugging the UI on synthetic conflicts. Adds 2-4 days to the gate, but the time is recovered later because the same work would have to happen alongside external-leader ingestion anyway.

**Decision 4 — Drive access: set up the Google service account now.**
The eventual watcher (P0.6) needs a service account. Setting it up now means one auth path for both the one-time batch and the ongoing watcher. ~30-60 min Cloud Console setup with Ryan. The alternative (Drive MCP + manual downloads now, service account later) means re-deriving the auth path under deadline pressure when the watcher lands.

---

## Phase plan (reconciled, decisions applied)

### Phase 1 — Pre-batch hardening (NEW — gates everything below)

Before any new content ingests, make the changes the four decisions require. These don't change what's already loaded; they change what future ingestions write and how re-runs behave.

**1a. Dedup tightening.** Change the unique constraint / ON CONFLICT key in `app/knowledge/db.py:insert_knowledge_item` from `(tenant_id, source_chunk_hash, title)` to `(tenant_id, source_chunk_hash)`. New migration `0023_tighten_knowledge_dedup.sql` (originally drafted as 0022; renumbered when 0022 was claimed by `0022_practice_first_class.sql` via PR #218). Verify against existing 1,144 rows that no within-hash conflicting titles exist (one-off SQL check before applying).

**1b. `knowledge_sources` write path.** Add `get_or_create_source(conn, tenant_id, source_type, identifier, metadata)` to `app/knowledge/db.py`. Wire it into `load_knowledge.py`, `ingest_knowledge.py`, `ingest_pdf.py`. Set `source_id` FK on every new entry. Backfill `source_id` on the existing 1,144 rows by deriving from `source_channel` + `_source` JSONB (one source row per channel for Slack; sources for future PDFs / canvases will be created at ingest time).

**1c. Service account provisioning.** Ryan + me, 30-60 min in Google Cloud Console. Create project, enable Drive API, create service account, download JSON key (lives at `infrastructure/secrets/` locally, ignored by `.gitignore`, mirrored to Aptible secrets when watcher deploys). Share both Drive folders (`161VCvz43IVXDGuO3M2JPZamp1K5HZCGe` Slack export, `1f4PY0gvedz-FX8qouKCfARATmXKIYsFf` Clinical Signal Sources) with the service account email as Viewer.

**Phase 1 done when:**
- Migration 0022 applied to dev
- `knowledge_sources` populated for 1,144 existing rows (Slack channels seeded as source rows, every clinical_knowledge row has non-null source_id)
- Re-run a JSONL load and observe zero new rows inserted (idempotency proof)
- Service account JSON key on disk, both Drive folders listable via the service account

Estimated effort: 2-3 days. Handoff prompt: new (TBD).

### Phase 2 — Slack remainder (~360-500 entries)

P0.2 from the exhaust plan. Per Phase 1, each load creates source rows and is idempotent.

**2a.** Run `load_knowledge.py` over each remaining v2 JSONL in `database/seed/knowledge/`. The post-ingest finalize hook runs autotag → recompute → enqueue automatically.

**2b.** Spot-check 5 random entries per channel for extraction quality and source attribution.

**2c.** Verify `knowledge_sources` has one row per channel and `knowledge_review_queue` flags low-confidence entries appropriately.

Estimated effort: 30 min execution + 1-2 hours spot-checks. No new code.

### Phase 3 — Slack canvases (~24KB, est. 50-100 entries)

**3a. Locate `canvases.json`.** NOT in the repo currently (`database/seed/dr-laura-slack/` is empty except `.gitkeep`). **Open question #1 below** — Ryan to provide. Once placed at `database/seed/dr-laura-slack/canvases.json`, proceed.

**3b. Build `ingest_canvas.py`.** Handoff prompt exists at `docs/CLAUDE-CODE-PROMPT-INGEST-CANVAS.md` — needs to be updated to write `source_id` per Phase 1 changes. Parse canvases.json → JSONL → `load_knowledge.py`. Each canvas page = one `knowledge_sources` row (`source_type: 'slack_canvas'`).

**3c. Ingest.** Run pipeline, spot-check first 10 entries, then proceed.

Estimated effort: half day build (updating existing prompt) + 30 min ingestion.

### Phase 4 — Certification Materials PDFs (3 files, ~6MB)

Already staged at `database/seed/dr-laura-drive/certification-materials/`:
- `Clinical_Foundation_Intake_Pattern_Recognition_Testing_Roadmap.pdf`
- `Module_1_A_Systems-Biology_Approach_to_Hormones.pdf`
- `Module_2_The_HPA_Axis_and_Stress_Resilience.pdf`

`ingest_pdf.py` exists and works. Per Phase 1, need a small patch to write `source_id`.

**4a.** Run `ingest_pdf.py` on the Clinical Foundation PDF first. Spot-check 10-20 extracted entries for quality.

**4b.** If extraction quality is acceptable, run on the other two PDFs.

**4c.** Verify each PDF produces one `knowledge_sources` row with `source_type: 'course_module'` (or similar). Verify `source_authority` is set high (Dr. Laura's own teaching material).

Estimated effort: 1-2 hours execution + spot-checks. ~$5-10 API cost.

### Phase 5 — Drive watcher (`sync_drive_content.py`)

Handoff prompts exist at `docs/SYNC-DRIVE-CONTENT-DESIGN.md` and `docs/DRIVE-WATCHER-PHASE-0-WALKTHROUGH.md`. With service account ready from Phase 1c, Phase 0 setup steps are obsolete; build straight to Phase 1.

**5a.** Build `services/analysis-engine/scripts/sync_drive_content.py` per existing design. List files in both Drive folders, compare to `database/seed/dr-laura-drive/.ingested.json` manifest, download new/changed, route by file type (PDF / Canvas / JSONL / other). Write a new `knowledge_sources` row per file before delegating to the type-specific ingest script.

**5b.** Schema for the manifest: `{file_id: {modified_time_at_ingestion, content_hash, ingestion_status, source_id, ingested_at}}`. Keep it in the repo so re-running on a fresh checkout is deterministic.

**5c.** Configure cron. Hourly per the exhaust plan recommendation. Aptible scheduled job once deployed.

**5d.** Notification path. Slack DM, email, or simple log file Ryan checks. Start with log file + summary email at end of day; iterate later.

**5e.** Test by uploading a new file to either Drive folder and verifying ingestion within the next cron tick. Verify idempotency by running twice and observing zero changes the second time.

Estimated effort: 1-2 days. Handoff prompt: new.

### Phase 6 — Fellowship slide decks (rolling)

Dr. Laura is actively populating `Academy for Anti-Aging Medicine Longevity Fellowship Curriculum Slide Decks` (Drive folder `1LDtmrxsuDnBRVYKpuhX-mj8G2EHwfCiJ`) — Module 1 endocrinology, Module 2 neurovascular/metabolic, more coming. Watcher handles these once running.

**6a.** Verify the largest current deck downloads cleanly via service account (no MCP-mediated size cap).

**6b.** Determine if image-heavy slides need OCR. Current `ingest_pdf.py` is text-extraction only. **Open question #2 below** — depends on slide format Dr. Laura is using. PPTX-to-PDF exports usually have selectable text; pure-image slides need OCR (currently out of scope).

**6c.** If OCR is needed, file a follow-up — out of scope for this batch. Build a stub that flags image-only PDFs to a manual review queue rather than silently failing.

Estimated effort: rolling; first test 1-2 hours. OCR work is separate if needed.

### Phase 7 — Conflict detection on the loaded corpus (per decision 3)

Builds C.3.1 + C.3.2 from the prioritization doc. Runs *after* Phases 2-6 are stable so it operates on the full Dr. Laura corpus.

**7a. C.3.1 graph-walk detection.** Per `KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md` Question 2: for each `(domain, target_concept)` in `clinical_relationships`, compare `relationship_type` and `strength` across entries. Flag direct contradictions into `knowledge_conflicts`:
- `treats` vs. `contraindicates` for same supplement/intervention + same condition
- Opposing `precedes` relationships in clinical sequencing
- Same entity tagged as both supportive and suppressive of a system

Operates initially against Dr. Laura's content only (single leader). Self-contradictions across channels are the target.

**7b. C.3.2 conflict resolution UI.** New page at `/dashboard/knowledge/conflicts`. Pending conflicts side-by-side with source citations (now possible because `knowledge_sources` is populated from Phase 1). Resolution dropdown writes `resolution_type` + `resolution_text`. Mirror the audit-log page style. Persist resolved conflicts so they don't re-surface.

**7c. First triage session with Dr. Laura.** ~30 minutes, live walkthrough of real conflicts surfaced. Validates the detection logic AND the UI in one shot. Capture her feedback on what's a real conflict vs. context-dependent guidance (the latter shouldn't be flagged as a contradiction).

**7d. Tune detection thresholds** based on signal-to-noise from session 7c. If too many false positives, tighten heuristics. If too few real conflicts surface, loosen.

Estimated effort: 2-4 days build (split: 1-2 days detection, 1-2 days UI) + 30 min session.

---

## Open questions (need answers before phase X can ship)

| # | Question | Blocks |
|---|---|---|
| 1 | Where is the original Slack export bundle, including `canvases.json`? Should we re-download from Drive folder `161VCvz43IVXDGuO3M2JPZamp1K5HZCGe`? | Phase 3 |
| 2 | Fellowship slide deck format — exported PPTX-to-PDF (text selectable) or image-only? Largest expected file size? | Phase 6 |
| 3 | Audio/video content — in scope for the historical batch, or text-only? `KNOWLEDGE_SOURCES.md` lists "recorded calls & transcripts" as queued. No transcription pipeline exists. | Phase 6 (rolling) |
| 4 | Production tenant target — which `tenant_id` does the moat content live under in production? Dev uses `00000000-0000-0000-0000-000000000001`. Migration strategy if different. | All phases if production differs |
| 5 | Faithfulness threshold recalibration — `LOW_CONFIDENCE_THRESHOLD = 0.51` was tuned to the current 1,144-entry corpus (PR #181, with a near-bimodal distribution flagged in #183). Adding ~700-1500 entries may shift the distribution. Recalibrate after Phase 4? | Post-Phase 4 quality |
| 6 | Budget ceiling — Phases 2-4 estimated ~$20-30 API cost. Phases 5-7 add Drive API + conflict-detection LLM calls. Any soft cap to plan around? | Phase 5+ |
| 7 | Notification path for the watcher — Slack DM, email, log file Ryan checks daily, or something else? | Phase 5 |

---

## Verification / MVP gate

Builds on Issue #203 + content-exhaust plan, with quality criteria from this design.

**Content gate (from exhaust plan):**
- All queued Slack channels loaded
- Slack canvases ingested
- All 3 Certification PDFs ingested
- Drive watcher running, picking up new content within 1 hour of upload
- Fellowship decks ingested rolling
- KB at 2,000+ entries, all Dr. Laura curated

**Quality gate (new — from this design):**
- Every entry has a non-null `source_id` FK to `knowledge_sources`
- `knowledge_sources` populated with one row per ingest unit (channel / canvas / PDF / deck)
- Re-running any ingest produces zero new rows (idempotency verified end-to-end)
- C.3.1 detection has surfaced ≥5 real conflicts in Dr. Laura's content
- Dr. Laura has resolved ≥3 of those conflicts via the C.3.2 UI in a live session
- Faithfulness threshold recalibrated against post-batch distribution

**Deferred to Layer C.2.x (external leaders) and Layer D:**
- Multi-leader conflict scenarios (Layer 1 ↔ Layer 1, e.g., Gottfried vs. Cole)
- Layer 1 ↔ Layer 2 conflict surfacing in protocol editor (depends on Layer D existing)
- Practitioner-side knowledge upload pipeline (Layer D entirely)

---

## Handoff prompts to write

Each phase becomes one Claude Code handoff prompt in `docs/`, following the established pattern (goal, current state, constraints, out-of-scope, verification steps).

| Phase | Prompt file | Status |
|---|---|---|
| 1 | `CLAUDE-CODE-PROMPT-BATCH-PHASE-1-HARDENING.md` | TBD — draft next |
| 2 | (no new prompt — execution of existing pipeline) | — |
| 3 | `CLAUDE-CODE-PROMPT-INGEST-CANVAS.md` | Exists — update for `source_id` and locate canvases.json |
| 4 | (no new prompt — execution of existing pipeline) | — |
| 5 | `CLAUDE-CODE-PROMPT-DRIVE-WATCHER.md` | TBD |
| 6 | (no new prompt — rolling execution via watcher) | — |
| 7a | `CLAUDE-CODE-PROMPT-C3-CONFLICT-DETECTION.md` | TBD |
| 7b | `CLAUDE-CODE-PROMPT-C3-CONFLICT-RESOLUTION-UI.md` | TBD |

Phase 1 is the gating prompt — every later phase depends on the dedup + source-registry changes. Draft Phase 1 next.

---

## What this changes about MVP-PRIORITIZATION-2026-05-08.md

Rev 8 of the prioritization doc should:

1. **Mark drift-corrected items as done** — C.1.6, ingest_pdf.py, Issue #166, A.3.1, A.3.3, A.3.6.
2. **Add this design doc as the operational reference for P0.x.** Phase numbers in this doc map to P0.1-P0.7 in the prioritization doc.
3. **Move C.3.1 + C.3.2 above the C.2.x external-leader work** — they now ship as part of Phase 7 of the historical batch, not as a separate "iteration 2."
4. **Add Phase 1 (pre-batch hardening) as a new gate.** It precedes everything else and is the dependency for clean ingestion through Phase 5.
5. **Reflect that the historical batch is now a 5-7 day sequence**, not the "this week" cadence the May 11 exhaust plan implied.

---

## Why this is right

The May 11 exhaust plan got the operational sequence right but treated quality issues (dedup, provenance, conflicts) as cleanup-able later. Ryan's May 18 framing — "this is the moat, get it right" — flips the priority: spend 2-3 extra days now on Phase 1 hardening and Phase 7 conflict surfacing so the moat content is durable, citable, and self-consistent at launch. The cost is small relative to re-running ingestion later under deadline pressure with worse extraction quality and orphaned provenance.

The bet: a launched Clinical Signal where every protocol citation traces cleanly to a specific source and where Dr. Laura's self-contradictions have already been resolved is meaningfully different from a launched product where citations are JSONB scraps and the first multi-source conflict is discovered by Dr. Laura mid-protocol-generation.
