# MVP Prioritization — Get Dr. Laura to Production

**Created:** May 8, 2026
**Last updated:** May 8, 2026 (rev 2 — post PR #172)
**Author:** Working session with Ryan
**Optimizing for:** Dr. Laura using Clinical Signal with **real patients on Aptible**, end-to-end, with no showstopper bugs.

This doc supersedes `MVP-EXECUTION-PLAN.md` (April 27) and `docs/MVP-STATUS-AND-PRIORITIES.md` (May 3) for sequencing. Those remain authoritative for context and what's already done.

### Revision history

- **Rev 7 (May 12, post-smoke-test + content-exhaust reframe)** — Content ingestion is now **Priority 0**, above Layer A. The moat is Dr. Laura's curated content; the foundation engineering shipped this weekend was prerequisite, not the work itself. Issue #203 makes "exhaust Dr. Laura Drive content" a launch-blocking MVP quality gate. All external-leader content acquisition (Gottfried, Cole, Hyman, etc.) explicitly deferred until the gate is met. May 11 smoke test caught and tracked 7 latent bugs (#191-200 range), all pre-existing — none from the May 8-10 merge batch. See `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md` for operational details.
- **Rev 6 (May 10, post moat-reframe conversation + #172 merge)** — Two-layer moat formalized in CLAUDE.md: Clinical Signal core (Layer 1, what we've been building as KO) + per-practitioner private knowledge extensibility (Layer D, **new MVP workstream**). Conflict-surfacing as a product design principle: when practitioner content contradicts core, surface to practitioner with supporting details, let them decide — symmetric across layers. C.3 reframed to include both centralized conflict resolution (Dr. Laura tiebreaker for Layer 1 source disagreements) AND inline conflict surfacing at protocol-generation time (practitioner sees Layer 1 vs Layer 2 contradictions during their workflow). Date-based ship plan replaced with phase-based quality gates per Ryan's "want something great, not fast" framing. Cost-impact note added as separate doc. **PR #172 (LLM refactor) actually merged on May 10** — corrects rev 5 which prematurely claimed it was merged. C.1.6 status corrected: handoff prompt drafted at `docs/CLAUDE-CODE-PROMPT-C2-PREP-POST-INGEST-FINALIZE.md` but **not yet started** (no branch, no PR). Rev 5 incorrectly claimed C.1.6 was in flight.
- **Rev 5 (May 10, after foundation merge)** — Layer C foundation (C.1.1 through C.1.5) all merged to `main`. Added C.1.6 (post-ingest finalize wiring, in-flight as a draft PR) — bundles the autotag + recompute + enqueue steps into a single post-load hook so external leader ingestion (C.2) lands clean from the first run. C.2 reframed: split into C.2-prep (engineering, in flight) and C.2 proper (the actual ingestion runs, blocked on Dr. Laura confirming source-file procurement). All eight follow-up issues filed (#178 cost optimization, #179 scripts hygiene, #180 prod-corpus retro, #182 intra-floor differentiation, #183 threshold revisit, #184 docs/migration drift, plus the two earlier intake-related ones). Distribution finding from C.1.5 captured: composite-confidence formula produces near-bimodal distribution on dev corpus; threshold tuned to 0.51 as a temporary calibration with a comment marking the revert condition.
- **Rev 4 (May 8, very late)** — Layer C rewritten based on `docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md`. Reality: KO schema is fully built, application code is essentially zero. Every existing entry is at confidence 0.50, review_status 'unreviewed', no leader_id. Layer C now has explicit foundation engineering (~3-5 days) that gates external leader ingestion. Dr. Laura's role corrected: she resolves conflicts and spot-checks flagged extractions, not bulk-approves entries. Step 0 seed migration `database/migrations/0017_seed_knowledge_leaders.sql` is staged.
- **Rev 3 (May 8, late evening)** — Layer-based restructure to reflect the moat framing (protocol accuracy + completeness + practitioner/client experience). Knowledge Orchestrator promoted into MVP as a parallel workstream (data ingestion immediate, prompt integration weeks 4-5). Practitioner document upload audit added to MVP. Patient-facing intake (#169), patient-side file upload (#170), client health PDF (#171), and intake polish (T4.2-T4.4) explicitly moved to Phase 1.5 (post-launch).
- **Rev 2 (May 8, post-dinner)** — PR #172 (LLM client centralization + prompt externalization) shipped on `refactor/centralize-llm-client`, awaits behavioral-equivalence verification before merge out of draft. Issue #166 (Goals section removal) code applied locally — PR status unknown to this doc, please update.
- **Rev 1 (May 8)** — initial prioritization

---

## 1. Where we are right now

Concrete state, verified against `git log` + actual file inspection on May 8:

- **Codebase: ~85–90% complete.** Sprints 1–5 shipped. Sprint 5.5 (knowledge orchestrator schema, protocol-renderer redesign, audit-log fixes, intake-spinner fix) is mostly merged.
- **Already done since May 3 status doc:**
  - SSL cert validation on DB connections (`lib/db.ts:31-35`, commits `2b3bb68` / `ad2d92d`) — closes ISSUES-FROM-REVIEW #1.2
  - RLS GUC mismatch fix (migration `0012_fix_rls_guc_name.sql`, also `0015_fix_preferences_rls.sql`) — closes #1.1
  - AI source attribution + safety checklists + prompt versioning (commit `8634f57`) — closes #2.1, #2.5
  - Audit log encrypted-name fix, settings/audit page crash fixes, intake submit spinner hang
  - Knowledge Orchestrator schema (migration `0016`) — but not wired into prompts yet
- **Done in this session (May 8 → May 10):**
  - **PR #172 — LLM client centralization** merged. All `@anthropic-ai/sdk` calls in `apps/web/` go through `lib/llm.ts`; 10 prompts externalized to `lib/prompts/*.md`. Behavioral-equivalence procedure attached as a comment for pre-merge sanity check.
  - **T4.1 / Issue #166** — Goals section removed from intake form. Code applied locally; PR status TBD.
  - **Layer C foundation — all five engineering items shipped (C.1.1 through C.1.5).** Migration `0017_seed_knowledge_leaders` + PRs #175, #176, #177, #181 all merged to main. KO foundation went from "schema with no app code" to "every entry tagged, scored, faithfulness-checked, and review-queue-eligible" in one session.
  - **C.1.6 — post-ingest finalize wiring** in flight as a draft PR. Bundles autotag + recompute + enqueue into a single post-load hook so external leader ingestion lands clean from the first run.
  - **9 follow-up issues filed and labeled:** #173 (practitioner upload audit), #178 (cost optimization), #179 (scripts hygiene), #180 (prod-corpus retro), #182 (intra-floor differentiation), #183 (threshold revisit), #184 (docs/migration drift), plus the `documentation`, `knowledge-orchestrator`, `tech-debt`, `performance`, `audit`, `practitioner-experience` labels created where missing.
- **Filed earlier in session (May 8) — Dr. Laura intake QA round 2:** issues #165–#171 from `github-issues-intake-feedback.md`.
- **Production blockers still open:** S3 migration, Aptible deploy, Anthropic BAA, ~5 remaining security/quality items.

**The MVP is functional today on Railway/Neon/Vercel-Blob with synthetic data.** Everything below is about getting it onto Aptible with real patient data, plus closing the intake UX gaps Dr. Laura just flagged.

---

## 2. How I sequenced this (rev 7 — content ingestion is Priority 0)

Per CLAUDE.md, the moat has two halves: **Clinical Signal core** (curated knowledge base — Layer 1) and **per-practitioner extensibility** (Layer 2 — the durable defense). Both are MVP scope.

**The honest reframe (rev 7):** Dr. Laura shared the original Slack export April 14. By May 11, only ~30-40% of her shared content was actually in the KB. The foundation engineering shipped over the weekend was prerequisite work, but **content ingestion has lagged behind everything else and is now the dominant workstream until exhausted.** External leaders (Gottfried, Cole, Hyman, etc.) are explicitly blocked from ingestion until Issue #203's MVP gate is met.

**Priority 0 (continuous, blocks launch) — Exhaust Dr. Laura's curated content.** Tracked in Issue #203 + `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md`. Runs in parallel with everything below; no other workstream should ever gate on it being "complete" because content ingestion is by nature continuous. But the MVP gate criteria in #203 must be met before launch.

Below that, four layers:

- **Layer A — Preconditions to ship.** Compliance, infra, security. Required, but not the moat. The cost of admission, not the product.
- **Layer B — Protect the moat.** Anything that prevents the protocols from being silently wrong, incomplete, or unsafe. Safety validation, truncation detection, doc chunking, extraction quality, drug interactions, red-flag thresholds.
- **Layer C — Build the Clinical Signal core (Layer 1 of the moat).** Knowledge Orchestrator engineering (foundation done) + ingestion of curated content (Slack, leader books, public domain). Plus practitioner upload friction fixes — friction in Dr. Laura's workflow erodes both her time and the data quality going into protocol generation.
- **Layer D — Build per-practitioner extensibility (Layer 2 of the moat).** New as of rev 6. Per-practitioner private knowledge layer with simple PDF/Word upload, retrieval logic that combines core + practitioner layer with conflict surfacing, basic UI for practitioner to manage their layer. **MVP scope** — the durable defensive moat depends on this; deferring it to Phase 1.5 leaves the launched product feeling generic.

**Phase 1.5** absorbs work that's moat-relevant but not launch-critical: client-facing intake agent (#169 reframed as agent-driven, not form), patient-side file upload (#170), client health PDF (#171), practitioner annotation tools, and intake polish (T4.2-T4.4).

**Phase 2** is the dynamic wellness interface for clients — third touchpoint in the Practitioner's Companion vision. Patient portal + AI-driven check-ins + data flowing back to practitioner.

Launch is **quality-gated, not date-driven** (per CLAUDE.md). A phase ships when its quality gates are met (criteria in Section 4 below). Date emerges from when those become true, not from a calendar.

---

## 3. The prioritized backlog (rev 7 — Priority 0 + layered)

### Priority 0 — Exhaust Dr. Laura curated content (continuous, blocks launch)

Tracked in **Issue #203** (MVP gate) + `docs/DR-LAURA-CONTENT-EXHAUST-PLAN.md`. Until the gate is met, no external-leader content acquisition (Gottfried, Cole, Hyman, Patrick, Huberman, Holmes) should happen. External leaders layer on top of a fully-ingested Dr. Laura corpus, not alongside.

| # | Item | Effort | Status |
|---|---|---|---|
| P0.1 | **Fix #191 v1/v2 category constraint** — unblocks loading queued *-v2.jsonl Slack files | 30 min | ✓ PR #204 merged May 12 |
| P0.2 | **Bulk-load all queued Slack JSONLs** — ~10-14 channels, ~360-500 entries expected | 30 min | In progress May 12 |
| P0.3 | **Build `ingest_pdf.py`** — extracts text from Dr. Laura's Certification Materials PDFs and other PDF sources, produces JSONL the existing pipeline consumes | 1-2 days | Handoff prompt in flight |
| P0.4 | **Ingest 3 Certification Materials PDFs** (already staged in `database/seed/dr-laura-drive/`) | 30 min once P0.3 ready | Pending |
| P0.5 | **Build `ingest_canvas.py`** — extracts knowledge from Slack canvases.json (24KB of curated structured docs) | half day | Pending |
| P0.6 | **Build `sync_drive_content.py`** — polling Drive watcher (hourly cron) that auto-ingests new content from the two known Drive folder IDs | 1-2 days | Pending |
| P0.7 | **Ingest Fellowship slide decks** as Dr. Laura uploads them (Module 1 endocrinology, Module 2 neurovascular/metabolic, plus more) | rolling | Awaiting Dr. Laura upload completion |

**MVP-gate criteria** (per Issue #203): all queued Slack channels loaded, canvases.json ingested, all Certification PDFs ingested, Fellowship slides ingested rolling, Drive watcher running on schedule, KB at 2,000+ entries all Dr. Laura curated.

---

### In-flight (finish before opening new fronts)

| # | Item | Effort | Status |
|---|---|---|---|
| IF.1 | PR #172 behavioral-equivalence verification | 15 min | ✓ Procedure attached to PR as comment; ✓ PR #172 merged |
| IF.2 | PR #172 merge | 5 min | ✓ Done |
| IF.3 | Issue #166 (Goals removal) — finalize: verify `npx tsc --noEmit`, commit on a branch, open PR, merge. | 15 min | Code applied locally by Cowork; PR status TBD |
| IF.4 | File the practitioner-upload audit issue | 5 min | ✓ Filed as Issue #173 |
| IF.5 | **PR #181 (C.1.5) merge** once review queue verification looks healthy | 5 min | ✓ Merged at `17121e9` (May 10) |
| IF.6 | **C.1.6 (post-ingest finalize wiring)** — handoff prompt drafted at `docs/CLAUDE-CODE-PROMPT-C2-PREP-POST-INGEST-FINALIZE.md`. Not yet started. | half day to ship | Ready to kick off in Claude Code whenever Ryan wants |

---

### Layer A — Preconditions to ship

Required before real PHI flows. Necessary, but this is the cost of admission, not the moat.

#### A.1 — Compliance gates

| # | Item | Effort | Owner |
|---|---|---|---|
| A.1.1 | **Anthropic BAA executed** | 1 hr to initiate, then async waiting | Ryan (legal) |
| A.1.2 | **AWS account under BAA** + S3 bucket (encryption, versioning, no public access, IAM least-priv user) | half day | Ryan + dev |

#### A.2 — Critical-path infrastructure

| # | Item | Effort | Notes |
|---|---|---|---|
| A.2.1 | **Migrate file storage Vercel Blob → S3** (lib/records.ts, lib/intake-documents.ts; pre-signed URLs short TTL; store S3 keys not URLs — also closes ISSUES-FROM-REVIEW #3.3) | 2 days | Blocks Aptible deploy |
| A.2.2 | **Provision Aptible HIPAA env**, Docker deploy, env vars, custom domain + TLS | 1 day | |
| A.2.3 | **Migrate Postgres Neon → Aptible**, run all 16 migrations, verify RLS on a fresh DB | 1 day | After A.2.2 |
| A.2.4 | **End-to-end smoke test on Aptible**: signup → patient → intake → labs → protocol → approve → outputs | half day | Gate before Dr. Laura touches it |

#### A.3 — Remaining security/data-integrity gaps

**Re-verified May 11 against current code** — see `docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md`. Two items already done; one item partially done (labs OK, intake-docs needs work); one item scope reduced. Net: 4 small PRs instead of 6.

| # | Item | Status | Handoff prompt |
|---|---|---|---|
| A.3.1 | protocolId→patient ownership check on outputs route | OPEN | `docs/CLAUDE-CODE-PROMPT-A31-OUTPUTS-OWNERSHIP-CHECK.md` |
| A.3.2 | Sanitize error messages on 3 generation routes | ✓ DONE — `sanitizeStreamError` + `apiError` in `lib/api-error.ts` already prevent leakage. The `err.message` lines in those routes are for server-side logging only. | n/a |
| A.3.3 | Content-type validation — labs (`lib/records.ts`) already check magic bytes; intake-docs route does NOT | OPEN (intake-docs only) | `docs/CLAUDE-CODE-PROMPT-A33-INTAKE-DOCS-MAGIC-BYTES.md` |
| A.3.4 | Validate & sanitize practitioner preferences before prompt injection | OPEN | `docs/CLAUDE-CODE-PROMPT-A34-PREFERENCES-SANITIZATION.md` |
| A.3.5 | FK constraints on intake_documents and protocol_outputs | ✓ DONE — both tables have full FK constraints with appropriate CASCADE/SET NULL behavior | n/a |
| A.3.6 | Composite indexes — original `(tenant_id, patient_id, created_at)` recommendation is low-value (RLS scoping already handles it). Partial index on prep_brief metadata IS valuable | OPEN (partial index only) | `docs/CLAUDE-CODE-PROMPT-A36-PREP-BRIEF-PARTIAL-INDEX.md` |

---

### Layer B — Protect the moat

Anything that prevents protocols from being silently wrong, incomplete, or unsafe. **These are MVP, not deferred.** Promoted out of the old "Tier 5" and out of T7 deferred.

| # | Item | Effort | Why this is moat-protection |
|---|---|---|---|
| B.1 | **Post-generation safety validation pass** — cross-check supplements vs. patient flags, surface conflicts in protocol editor | 4-6 hr | Highest-leverage clinical-safety win. "Is this protocol safe to follow?" |
| B.2 | **Detect & handle output truncation** — flag in metadata, warn practitioner, log expected vs. present sections | 2-3 hr | Currently `salvageJson()` silently closes brackets; can drop entire layers. Direct completeness win. |
| B.3 | **Smarter document chunking** (#2.4 — promoted from T7 deferred) — replace naive 8K head-truncation with section-aware extraction | 4-6 hr | 8K head-truncation drops critical lab values from long PDFs. Direct completeness win for protocol *inputs*. |
| B.4 | **Extraction quality validation** (#2.9 — promoted from T7 deferred) — heuristic check on `insertDocument()` for OCR quality, length, character distribution | 2-3 hr | Bad OCR silently feeds garbage to clinical analysis. Garbage in → worse protocols. |
| B.5 | **Drug-interaction checklist in prep brief prompt** (#2.6) — duplicate the explicit list from `PROTOCOL_GENERATION_V1` into `PREP_BRIEF_PROMPT` | 1 hr | Trivial, high-leverage safety win. |
| B.6 | **Explicit red-flag thresholds** (#2.7) — vital sign / lab cutoffs, symptom combos | 1-2 hr | Prevents under-flagging of borderline cases. |
| B.7 | **Disclaimer audit** (#2.5 from earlier list) — verify every output surface has it | 1 hr | Compliance + practitioner trust |
| B.8 | **SMART outcomes enforcement in client action plan** (#2.8) — prompt guidance + validation that layer outcomes are specific | 1 hr | "Sleep through the night" not "improved sleep." Direct client-experience win. |

Layer B total: ~17-25 hours. Should ship in MVP weeks 1-3, in parallel with Layer A.

---

### Layer C — Build the moat

The structural investments that make Clinical Signal *differentiated*, not just *functional*. Five sub-workstreams. Per the May 8 investigation, the schema is fully built but the application code is essentially zero — so foundation engineering (C.1) gates external leader ingestion (C.3) gates prompt integration (C.4).

#### C.1 — KO foundation engineering ✓ COMPLETE (May 10)

All five items shipped May 10. Without these, the 1,144 existing entries would sit unattributed at confidence 0.50, and ingesting more content would just add to a pile of orphaned rows.

| # | Item | Status |
|---|---|---|
| C.1.1 | Step 0 seed migration — `database/migrations/0017_seed_knowledge_leaders.sql`. Inserts 6 knowledge_domains, 7 knowledge_leaders, backfills `leader_id` on 1,144 Slack entries → Dr. Laura. | ✓ Applied to dev DB |
| C.1.2 | Auto-tag domains on existing 1,144 entries — channel-as-prior + LLM for cross-cutting. ~50/50 split, 100% coverage, ~$2.50 spend. | ✓ PR #175 merged |
| C.1.3 | Composite confidence scoring — formula from schema-design doc, with corroboration threshold tuned (0.85 → 0.70) and source-aware review_bonus (Dr. Laura's content treated as source-validated by default). | ✓ PR #176 merged |
| C.1.4 | Faithfulness check on new ingestions — three-dimensional scoring (recall / precision / nuance), composite is `min()` of the three. Reject < 0.50, review-flag 0.50-0.75, accept ≥ 0.75. | ✓ PR #177 merged |
| C.1.5 | Auto-flag low-confidence + low-faithfulness entries to `knowledge_review_queue`. Threshold tuned to 0.51 temporarily (revert condition tracked in #183). | ✓ PR #181 merged |

**Distribution finding from C.1.5 captured for the record:** the composite-confidence formula produces a near-bimodal distribution on the dev corpus — 633 entries collapse to a single floor value (~0.68) because every internal+unreviewed+zero-corroboration entry scores identically. Threshold dropped to 0.51 as a temporary calibration; condition for reverting to 0.75 is "external leader content + reviews create real distribution variance" (tracked in #183).

#### C.1.6 — Post-ingest finalize wiring (in flight as draft PR)

The five C.1 items above were built as one-shot scripts. C.1.6 wires them together so they happen automatically as part of the ingestion pipeline — not as manual operator steps after each load. **Necessary precondition for C.2** so external leader ingestions land in a clean, fully-scored state from the first run.

| # | Item | Effort | Status |
|---|---|---|---|
| C.1.6.1 | New `post_ingest_finalize(conn, tenant_id)` library function in `app/knowledge/db.py` — calls autotag → recompute → enqueue in order. | 2-3 hours | In draft PR |
| C.1.6.2 | Refactor existing standalone scripts to extract callable functions (CLI behavior preserved). | 2-3 hours | In draft PR |
| C.1.6.3 | Wire `post_ingest_finalize` into `load_knowledge.py` post-load hook (replaces existing isolated enqueue call from C.1.5). | 1 hour | In draft PR |

Without C.1.6, every external leader ingestion (Gottfried, Cole, Hyman, etc.) would require the operator to run three scripts after `load_knowledge.py`. For 11+ books that's dozens of manual steps and many opportunities to forget one.

#### C.2 — Knowledge Orchestrator: data ingestion (kicks off after C.1.6 wiring lands)

Runs continuously once C.1.6 wiring is in place. Owner: Ryan for now (per May 8 decision). Each ingestion run automatically lands clean (tagged, scored, queue-eligible) thanks to C.1.6.

| # | Item | Effort | Owner / cadence | Blocked on |
|---|---|---|---|---|
| C.2.1 | **Load remaining queued Slack channels** (livecallschedule-topics, call_replays, hormoneai, products-and-brands-we-love, booksandresources). JSONL files already exist in `database/seed/knowledge/`. | 1-2 hr per channel | Ryan | C.1.6 merge |
| C.2.2 | **Course materials & training docs** (currently `⏳ QUEUED` in `KNOWLEDGE_SOURCES.md`) | TBD pending file inventory | Ryan + Dr. Laura sources files | Dr. Laura procurement |
| C.2.3 | **External leader ingestion — Hormones × Sara Gottfried (*The Hormone Cure*)** as the first external pair. Run on one chapter first to validate; then scale. Requires multi-leader ingestion support in `ingest_knowledge.py` (CLI flags for `--leader` and `--source`, write to `knowledge_sources` table). | 2-3 days for full book + iteration | Ryan | Dr. Laura procurement (waiting on her to confirm format she has the book in) |
| C.2.4 | **External leader ingestion — Gut × Will Cole (*Gut Feelings*)** as the second pair. Reuses `gut-dysbiosis-proof-of-concept.md` as a template for what good extraction looks like for that domain. | 2-3 days | Ryan | C.2.3 ships first to validate the multi-leader path |
| C.2.5 | **Public-domain sources** — research papers, clinical guidelines, textbook excerpts (where licensing permits). Licensing position TBD per Ryan May 10. | TBD, ongoing | Ryan | Licensing position + format procurement |

The longer C.2 runs, the deeper the moat. Tracked in `KNOWLEDGE_SOURCES.md`.

#### C.3 — Conflict detection + resolution workflow (~3-5 days, lands alongside C.2)

Per the conflict-surfacing principle in CLAUDE.md: contradictions get surfaced to the right human at the right moment, not silently merged. Two surfaces, two scopes:

- **Centralized resolution (Dr. Laura)** — when external leaders within Layer 1 disagree (Gottfried says X, Cole says Y on the same topic), Dr. Laura is the tiebreaker. Resolves in a dedicated UI, decisions persisted into `knowledge_conflicts` with `resolution_type`. Affects all practitioners' protocol generation going forward.
- **Inline resolution (each practitioner)** — when retrieved Layer 1 content contradicts the practitioner's own Layer 2 content during their protocol generation, surface inline with sources cited. Practitioner makes the call in their own UI; their decisions persist into their Layer D state so the same conflict doesn't re-prompt forever.

| # | Item | Effort | Notes |
|---|---|---|---|
| C.3.1 | **Conflict detection v1 (graph-walk heuristic)** — for each `(domain, target_concept)`, compare `relationship_type`/`strength` across `leader_id`s; flag direct contradictions (`treats` vs. `contraindicates`, opposing `precedes`) into `knowledge_conflicts`. Operates within Layer 1 only. | 1-3 days | Depends on C.1.1 (leader_ids populated). Currently `knowledge_conflicts` table is empty. |
| C.3.2 | **Dr. Laura centralized conflict-resolution UI** at `/dashboard/knowledge/conflicts` — pending rows side-by-side, resolution dropdown writing `resolution_type` + `resolution_text`. Mirror the audit-log page style. Also where she spot-checks flagged extractions from `knowledge_review_queue`. | 1-3 days | |
| C.3.3 | **Inline conflict surfacing at protocol generation** — when retrieval pulls a Layer 1 entry that contradicts a Layer 2 entry for the same concept, render both positions in the protocol editor with citations, ask the practitioner to choose. Persist their choice in their Layer D resolution state. **Tightly coupled to Layer D.** | 2-3 days | Depends on Layer D existing. Cross-layer concern. |
| C.3.4 | **Embedding-based contradiction detection (LLM judge pass on high-similarity entries with opposing recommendations)** | > 3 days | **Deferred to iteration 2.** Real evaluation work. C.3.1 catches the obvious cases first; this catches the subtle ones once volume justifies the build. |

#### C.4 — KO prompt integration (MVP weeks 3-4, after foundation lands)

Wires the populated knowledge_graph into protocol generation. Easier post-PR-#172 because prompts are externalized files now.

| # | Item | Effort | Notes |
|---|---|---|---|
| C.4.1 | **Retrieval logic** — given patient context (intake + symptoms + labs), query `clinical_knowledge` for relevant entries. Filter by domain, rank by confidence_score, dedupe near-duplicates. | 3-4 days | |
| C.4.2 | **Prompt injection** — splice retrieved knowledge into protocol generation prompt with citations. Update `lib/prompts/protocol_generation_v1.md`. | 2-3 days | Easier post-PR-#172 |
| C.4.3 | **Citation surfacing in output** — protocol shows "this recommendation cites [source]" so Dr. Laura can audit | 1-2 days | Practitioner trust + iteration loop |
| C.4.4 | **Regression check on protocol output with vs. without KO injection** on the same patient — manual eyeball | 30 min | Same pattern as PR #172 verification |

#### C.5 — Practitioner upload friction (audit-then-fix)

| # | Item | Effort | Notes |
|---|---|---|---|
| C.5.1 | **Run the practitioner upload audit** — Issue #173 in GitHub. Dr. Laura runs it on a synthetic patient. | 30-45 min | |
| C.5.2 | **File scoped fix issues for each failed capability** | 5 min per issue | |
| C.5.3 | **Implement fixes prioritized by frequency × severity** | TBD post-audit, likely 1-3 days total | |

---

### Layer D — Per-practitioner extensibility (NEW in rev 6, MVP scope)

The durable defensive moat. A practitioner uploads their own protocols, methodology docs, sample case notes, etc. into a private knowledge layer scoped to them. Their Layer D content combines with Clinical Signal core (Layer C) at protocol-generation time, with conflict surfacing per C.3.3.

Per Ryan May 10: practitioner content is **private by default, no Clinical Signal review.** It's their workspace. Start simple — a place to upload PDFs and Word docs. UX iterates later.

See `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` for the engineering design (schema, retrieval, UI sketch).

| # | Item | Effort | Notes |
|---|---|---|---|
| D.1 | **Schema migration** — `practitioner_knowledge` table (per-practitioner-scoped, similar shape to `clinical_knowledge` but with `practitioner_id` foreign key + RLS policies). Plus `practitioner_uploads` for the raw source files. | 1 day | Mirrors patterns from migration 0016 and 0010 |
| D.2 | **Upload endpoint + storage** — practitioner uploads PDFs / Word docs from their settings page; files land in S3 with encryption (Layer A.2.1 path); raw text extracted and stored. | 1-2 days | Reuses A.3.3 content-type validation, A.2.1 S3 path |
| D.3 | **Extraction pipeline for practitioner content** — same `ingest_knowledge.py` pattern but writes to `practitioner_knowledge` instead of `clinical_knowledge`. Includes faithfulness check (C.1.4) and confidence scoring (C.1.3). Runs C.1.6 finalize for the practitioner's tenant after each upload. | 1-2 days | Heavy reuse of C.1 foundation |
| D.4 | **Retrieval logic — combine Layer C + Layer D** — at protocol generation time, query both `clinical_knowledge` (Layer C, all leaders) AND `practitioner_knowledge` (Layer D, this practitioner only). Detect cross-layer conflicts per C.3.3 logic. Pass both sets to the model with provenance tags. | 1-2 days | Depends on C.4.1 retrieval refactor; could be built together |
| D.5 | **Practitioner Layer D management UI** at `/dashboard/knowledge/my-uploads` — list their uploads, see extraction status, view their entries, delete or re-upload. Basic, not pretty. | 1-2 days | |
| D.6 | **Conflict-surfacing in protocol editor** (this is C.3.3, listed here as well because Layer D is its dependency) — when a Layer C entry contradicts a Layer D entry, the protocol editor shows both with citations, asks practitioner to pick. | covered under C.3.3 | |

Layer D total: ~6-9 days of engineering. Adds ~1-2 weeks to the MVP timeline. Per Ryan: worth it; this is the moat.

---

### Phase 1.5 — Post-launch (weeks 7-9)

Moat-relevant but not launch-critical. Sequence after MVP ships and Dr. Laura has been using it for 1-2 weeks with real patients (so usage data informs which to prioritize first).

| # | Item | Source | Effort | Notes |
|---|---|---|---|---|
| P15.1 | **Scoped #169 — client-facing intake** (patient access flow + patient UI + read-only practitioner review + completion notification) | Issue #169 | 1.5-2 weeks | Excludes annotation tooling (highlight/flag/notes/reviewed-marks) which becomes P15.5 |
| P15.2 | **#170 — patient-side file upload during intake** | Issue #170 | 3-5 days | Depends on P15.1 |
| P15.3 | **#171 — auto-generate client health record PDF** | Issue #171 | 2-3 days | Depends on P15.1 |
| P15.4 | **#167 — metabolism deep dive gate** (T4.2 from rev 1) | Issue #167 | 1 hr | Diff already drafted in `docs/INTAKE-QUICK-WINS-IMPLEMENTATION.md` |
| P15.5 | **#168 — sleep wearable questions** (T4.3 from rev 1) | Issue #168 | 1-2 hr | Diff already drafted in same doc |
| P15.6 | **#165 — multi-activity exercise field** (T4.4 from rev 1) | Issue #165 | 3-4 hr | Includes data migration |
| P15.7 | **Practitioner annotation tooling for client-facing intake** (highlight, flag, notes per section, mark-as-reviewed) | Sub-tasks of #169 | 1 week | The cut-from-MVP piece of #169 |

### Deferred indefinitely (post-MVP, not Phase 1.5)

| # | Item | Why deferred |
|---|---|---|
| D.1 | Pagination on list endpoints (ISSUES-FROM-REVIEW #4.2) | Caseload of 5-15 clients makes this a non-issue at current scale |
| D.2 | Connection pool sizing (#4.1) | Single-practitioner load |
| D.3 | Audit log viewer polish (#5b) | Logging works; viewer can iterate |
| D.4 | `chunkText()` table-aware splitting (#2.10) | Layer B.3 covers the higher-leverage chunking work |
| D.5 | Prompt-edit feedback loop telemetry (#15b) | Already storing edits; analysis layer can come when there's volume |
| D.6 | Protocol version race condition (#3.4) | Single-practitioner concurrency; not a real risk |
| D.7 | Frontend polish (#5.x) | Real but not moat |
| D.8 | Protocol-quality regression test framework | Build when there's a second practitioner or second developer; manual eyeball check (PR #172 pattern) is enough at this scale |

---

## 4. Quality gates per phase (rev 6 — replaces date-based ship plan)

Per CLAUDE.md, launch is quality-gated, not date-driven. A phase is ready when its concrete quality criteria are met. Date emerges from when those become true.

**Status as of May 10 (end of session):** Layer C foundation (C.1.1-C.1.5) merged. PR #172 (LLM refactor) merged. C.1.6 prompt drafted, not yet started. Layer D not yet started. Layer A and Layer B have not begun. Issue #166 (Goals removal) edits applied locally, not yet PR'd.

### Phase 1 — MVP (quality gates)

**MVP is ready when ALL of the following are true:**

**Foundation gates** (largely done):
- ✅ Layer C foundation (C.1.1-C.1.5) merged
- ⏳ C.1.6 (post-ingest finalize wiring) merged
- ⏳ Issue #166 (Goals removal) merged

**Compliance gates** (none can be skipped):
- ⏳ Anthropic BAA executed
- ⏳ AWS account under BAA + encrypted S3 bucket provisioned
- ⏳ Aptible HIPAA env provisioned, Postgres migrated, all migrations applied
- ⏳ End-to-end smoke test on Aptible passes (signup → patient → intake → labs → protocol → approve → outputs)
- ⏳ All Layer A.3 security gaps closed (output authz, error sanitization, content-type validation, preferences sanitization, FK constraints, indexes)

**Moat-protection gates** (cutting these is false economy):
- ⏳ Safety validation pass live (B.1) — supplement-vs-medication interactions surfaced in protocol editor
- ⏳ Truncation detection live (B.2) — large protocols flagged, not silently truncated
- ⏳ Smarter doc chunking (B.3) — full lab data fed into analysis, not head-truncated at 8K
- ⏳ Extraction quality validation (B.4) — bad OCR/extractions caught, not silently fed to clinical analysis
- ⏳ Drug-interaction checklist in prep brief (B.5)
- ⏳ Disclaimer audit complete (B.7) — every output surface has it

**Layer C — Clinical Signal core (Layer 1 of moat):**
- ⏳ At least 2 external leaders ingested (Gottfried *Hormone Cure* + Cole *Gut Feelings* minimum) so the moat is more than just Dr. Laura's content
- ⏳ Conflict detection v1 (C.3.1) operational on the multi-leader corpus
- ⏳ Dr. Laura's centralized conflict-resolution UI (C.3.2) functional — she can resolve at least 5 real conflicts end-to-end
- ⏳ KO prompt integration (C.4) live — protocols cite sources, retrieval works, generation produces measurably-different output with vs. without KO injection

**Layer D — per-practitioner extensibility (Layer 2 of moat):**
- ⏳ Practitioner can upload PDFs/Word docs to their private layer (D.2)
- ⏳ Uploaded content is extracted, scored, and influences their next protocol generation (D.3-D.4)
- ⏳ Inline conflict surfacing (C.3.3) works — when Layer 1 contradicts Layer D in a protocol, both positions render with citations
- ⏳ Practitioner can manage their layer (view, delete, re-upload) via D.5 UI

**Practitioner experience gates:**
- ⏳ Practitioner upload audit (#173) complete + critical fixes shipped — Dr. Laura can upload labs/docs without friction
- ⏳ Dr. Laura full-flow test on Aptible: she walks through end-to-end with a real synthetic patient + her own uploaded methodology in Layer D, and would actually use the output with her real clients

**Phase 1 ships when every box above is checked.** Estimated: ~4-5 weeks from May 11 if focused full-time, longer if not. No date commitment.

### Phase 1.5 — Patient-facing intake agent (post-MVP)

**Phase 1.5 is ready when ALL of the following are true:**

- Patient can access intake via magic link without creating an account
- Intake is agent-driven (between guided form and free-form chat per Ryan May 10) — agent asks structured questions but uses dialogue for follow-ups
- Practitioner gets notified when patient submits + can review submitted data
- Auto-generated client health PDF (#171) is produced from the intake
- Patient-side file upload during intake works (#170) — voice memos, supplement photos, past labs

Estimated: 2-3 weeks of focused work after MVP ships. Tracks toward Issue #169 reframed as agent-driven.

### Phase 2 — Dynamic wellness interface for clients

**Phase 2 is ready when ALL of the following are true:**

- Patient portal: view their approved protocol, check off habits, log symptoms
- Scheduled AI-drafted check-ins; practitioner can edit/send
- Symptom/progress data flows back to practitioner's dashboard
- Foundation for outcome tracking established

Estimated: 4-6 weeks of focused work after Phase 1.5. Marks the platform as a true Practitioner's Companion across full client lifecycle.

### Phase 3 — Team + integrations (future)

Multi-practitioner accounts, FullScript / Rupa Health integration, wearable integration. No quality gates defined yet.

### Continuous workstreams (parallel to all phases)

- C.2 KO data ingestion: Slack channels remaining, then external leader books, then public domain. The longer this runs, the deeper the moat.
- Weekly 30-min Dr. Laura conflict-resolution session, starting once C.3.2 UI is functional.
- Per-practitioner Layer D content accumulating as practitioners onboard.

---

## 5. What can be cut vs. what cannot

**Quality-gated launch means cuts shift work to later phases, not skip it entirely.** Things that can be deferred from MVP to Phase 1.5 if scope pressure mounts:

1. **B.6 red-flag thresholds** — important but iterative; current prompt covers obvious cases
2. **A.3.6 composite indexes** — query times fine at current scale
3. **B.8 SMART outcomes enforcement** — prompt nudge, not a structural fix
4. **C.4 KO prompt integration depth** — could ship Phase 1 with basic retrieval (Layer C entries pulled but not heavily ranked/cited), add full citation surfacing in Phase 1.5

**What absolutely cannot be cut from MVP** (skipping any of these means you can't legally launch, safely launch, or launch with the moat intact):

- A.1.1 (BAA), A.1.2 (AWS) — legal preconditions
- A.2.1-A.2.4 (S3, Aptible, DB migration, smoke test) — infrastructure preconditions
- A.3.1-A.3.4 (security gaps) — HIPAA preconditions
- B.1 (safety validation), B.2 (truncation), B.7 (disclaimer) — clinical safety baseline
- C.3.1 + C.3.2 (conflict detection + Dr. Laura's resolution UI) — moat depends on multi-source content being meaningfully reconciled
- D.1-D.5 (per-practitioner extensibility) — the durable defensive moat. Without Layer D, the launched product is replicable and renewal pressure is high.
- C.3.3 (inline conflict surfacing in protocol editor) — the practitioner-as-authority principle from CLAUDE.md only works if conflicts surface at decision time

**The honest framing:** if any of the cannot-cut items isn't ready, the MVP isn't ready. Per the quality-gate model, that delays launch — it doesn't reduce scope.

---

## 6. Open questions for Ryan

1. **BAA** — has the Anthropic email already been sent? `BAA-EMAIL-DRAFT.md` exists but I don't know if it went out.
2. **Aptible account state** — is the account already provisioned (`.aptible.yml` exists) or just scaffolded?
3. **Dr. Laura's first real patient date** — what's the deadline driving this? "Mid-to-late May" per old status doc, but is there a specific commitment?
4. **Which branch for the Tier 4 quick-win PRs** — straight off `main`, or batch on a `sprint-6/intake-feedback` branch first?

---

## 7. Cross-reference of every open backlog item to its bucket

For traceability when this gets put into GitHub:

| Source | ID/Name | Bucket (rev 3) |
|---|---|---|
| Intake feedback today | #165 multi-activity exercise | P15.6 |
| Intake feedback today | #166 remove Goals section | IF.3 (in-flight) |
| Intake feedback today | #167 metabolism gate | P15.4 |
| Intake feedback today | #168 sleep wearable | P15.5 |
| Intake feedback today | #169 client-facing intake | P15.1 (scoped) + P15.7 (annotation tooling) |
| Intake feedback today | #170 file upload (patient-side) | P15.2 |
| Intake feedback today | #171 client health PDF | P15.3 |
| Today (new) | Practitioner upload audit | C.3.1 |
| ISSUES-FROM-REVIEW | #1.1 RLS GUC | DONE |
| ISSUES-FROM-REVIEW | #1.2 SSL cert validation | DONE |
| ISSUES-FROM-REVIEW | #1.3 sanitize errors | A.3.2 |
| ISSUES-FROM-REVIEW | #1.4 content-type | A.3.3 |
| ISSUES-FROM-REVIEW | #1.5 protocol output authz | A.3.1 |
| ISSUES-FROM-REVIEW | #2.1 doc source attribution | DONE |
| ISSUES-FROM-REVIEW | #2.2 safety validation | **B.1** (was T5.1, promoted to Layer B) |
| ISSUES-FROM-REVIEW | #2.3 truncation detection | **B.2** (was T5.2, promoted) |
| ISSUES-FROM-REVIEW | #2.4 chunking | **B.3** (was T7.5 deferred, **promoted into MVP**) |
| ISSUES-FROM-REVIEW | #2.5 prompt versioning | DONE |
| ISSUES-FROM-REVIEW | #2.6 drug-interaction checklist | B.5 |
| ISSUES-FROM-REVIEW | #2.7 red-flag thresholds | B.6 |
| ISSUES-FROM-REVIEW | #2.8 SMART outcomes | B.8 |
| ISSUES-FROM-REVIEW | #2.9 extraction quality | **B.4** (was T7 deferred, **promoted into MVP**) |
| ISSUES-FROM-REVIEW | #2.10 chunk awareness | D.4 (covered by B.3) |
| ISSUES-FROM-REVIEW | #3.1 FKs | A.3.5 |
| ISSUES-FROM-REVIEW | #3.2 indexes | A.3.6 |
| ISSUES-FROM-REVIEW | #3.3 S3 keys not URLs | folded into A.2.1 |
| ISSUES-FROM-REVIEW | #3.4 version race | D.6 |
| ISSUES-FROM-REVIEW | #4.x production readiness | D.1, D.2 |
| ISSUES-FROM-REVIEW | #5.x frontend polish | D.7 |
| MVP-STATUS doc | foundational checklist save bug | verify on A.2.4 smoke test |
| MVP-STATUS doc | disclaimer placement | B.7 |
| Knowledge Orchestrator | Schema (migration 0016) | DONE |
| Knowledge Orchestrator | C.1.1 seed leaders + domains + backfill | ✓ DONE (migration 0017) |
| Knowledge Orchestrator | C.1.2 autotag domains | ✓ DONE (PR #175) |
| Knowledge Orchestrator | C.1.3 confidence scoring | ✓ DONE (PR #176) |
| Knowledge Orchestrator | C.1.4 faithfulness check | ✓ DONE (PR #177) |
| Knowledge Orchestrator | C.1.5 auto-flag review queue | ✓ DONE (PR #181) |
| Knowledge Orchestrator | C.1.6 post-ingest finalize wiring | Handoff prompt ready, not yet started |
| Knowledge Orchestrator | C.2 data ingestion (Slack remaining + external leader books + public domain) | C.2 (blocked on C.1.6 merge + Dr. Laura procurement) |
| Knowledge Orchestrator | C.3 conflict detection + UI | C.3 (planned post-C.2.3) |
| Knowledge Orchestrator | C.4 prompt integration | C.4 (MVP gate, sequenced after C.2 + C.3 functional) |
| KO follow-ups (filed) | #178 cost optimization, #179 scripts hygiene, #180 prod-corpus retro, #182 intra-floor differentiation, #183 threshold revisit, #184 docs/migration drift | All filed and labeled |
| Today (new) | Protocol-quality regression test framework | Deferred — over-engineering at current scale |
| **Per-practitioner extensibility** | D.1-D.5 (schema, upload, extraction, retrieval, UI) | **Layer D — NEW MVP workstream (rev 6)** |
| **Inline conflict surfacing** | C.3.3 in protocol editor | **MVP gate (rev 6)** — depends on Layer D existing |
| Strategic insight | Methodology-based community targeting (Bredesen, Wahls, IFM-style cohorts) | Future consideration — informs post-MVP leader-content prioritization |
| Two-touchpoint future | Dynamic intake agent (Phase 1.5) + Dynamic wellness interface (Phase 2) | Phase 1.5 + Phase 2 per Ryan May 10 framing |

---

## 8. Companion docs

Operational docs that this prioritization references:

- `docs/PR-172-VERIFICATION-ADDITION.md` — behavioral-equivalence procedure for PR #172
- `docs/INTAKE-QUICK-WINS-IMPLEMENTATION.md` — diffs for #167, #168 (now P15.4, P15.5)
- `docs/AUDIT-ISSUE-PRACTITIONER-UPLOAD.md` + `-BODY.md` — practitioner upload audit issue text and test plan (filed as #173)
- `docs/REFACTOR-LLM-CLIENT-PROMPT.md` — the prompt that produced PR #172
- `docs/INVESTIGATE-KO-EXTRACTION-AND-CONFLICT-PROMPT.md` — investigation prompt that produced the KO foundation scoping
- `docs/KO-EXTRACTION-AND-CONFLICT-INVESTIGATION.md` — investigation report that drove rev 4 of this doc
- `docs/CLAUDE-CODE-PROMPT-C12-AUTOTAG-DOMAINS.md` — handoff prompt for C.1.2 (PR #175)
- `docs/CLAUDE-CODE-PROMPT-C13-CONFIDENCE-SCORING.md` — handoff prompt for C.1.3 (PR #176)
- `docs/CLAUDE-CODE-PROMPT-C14-FAITHFULNESS-CHECK.md` — handoff prompt for C.1.4 (PR #177)
- `docs/CLAUDE-CODE-PROMPT-C15-AUTOFLAG-REVIEW-QUEUE.md` — handoff prompt for C.1.5 (PR #181)
- `docs/CLAUDE-CODE-PROMPT-C2-PREP-POST-INGEST-FINALIZE.md` — handoff prompt for C.1.6 (in flight)
- `KNOWLEDGE_SOURCES.md` — KO ingestion source inventory and status (drives C.2)
- `docs/knowledge-orchestrator/` — schema design, leader catalog, gut-dysbiosis proof-of-concept
