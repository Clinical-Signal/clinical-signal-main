# Cursor Build Plan — Clinical Signal Intake & Readiness Module

> Built against `clinical-signal-intake-CURSOR-READY-PRD-v2.md` (the agent-optimized spec). The companion `.docx` is the upstream engineering handoff; the `.md` resolves its `[EXISTING?]` ambiguities by committing to **greenfield-with-stubs** (A1), so this plan follows the `.md`. When you need authoritative context for clinical or commercial framing, the `.docx` is the source of truth; for what to *build*, the `.md` wins.

## Project at a Glance

- **Stack** (pinned): Next.js 14.2 / TS 5.4 / Tailwind 3.4 / Postgres 15 + pgvector / Drizzle 0.30 / Zod 3.23 / BullMQ 5 + Redis 7 / S3 SDK 3 / Anthropic SDK 0.27 / faster-whisper (Python sidecar).
- **Build mode**: greenfield-with-stubs. Every `[STUB Phase 0]` item ships as a typed stub in §6 Phase 0; no "does this exist?" branching at execution time.
- **Two clinically-gated checkpoints** (human review required, not just green CI): Phase 2 (pure clinical logic) and Phase 6 (gate wiring + degraded-confidence output validation).
- **Non-negotiables, enforced in CI**: C-LOC (no file > 500 LOC), C-SLICE (one slice per file), C-TOKENS (zero raw color literals), C-PHI (no PHI in notifications/logs/system prompts), C-AUDIT (every mutation → `audit_log` + `patient_timeline`).

---

# Part 1 — Implementation Roadmap (Cursor-Feedable Tasks)

The PRD already numbers tasks `0.1 … 8.5`. I keep those IDs as anchors and break them into prompts at the right granularity for the Cursor agent: roughly **one logical unit per prompt** (one file, or one tightly-coupled cluster). Each task lists the **Cursor mode** I'd use, the **files touched**, and the **exit criteria** (which is usually a thin wrapper around the PRD's checkpoint).

A rule of thumb that applies throughout: **stop the agent before it crosses a phase boundary**. The `BUILD & TEST n` checkpoints in the PRD exist because the next phase makes implicit assumptions about what came before. Don't let Composer auto-roll across them.

## Phase 0 — Foundation & Guardrails

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 0.1a | Init pnpm workspace, pin versions in `package.json`, set `engines` (node 20.11.x / pnpm 9.12.x). | Composer | `package.json`, `pnpm-workspace.yaml`, `apps/web/package.json` | `pnpm install --frozen-lockfile` clean |
| 0.1b | Add `pnpm-lock.yaml` with frozen versions matching §1.2 table exactly. | Composer (one-shot generate, then `pnpm install`) | lockfile | `pnpm install --frozen-lockfile` no warnings |
| 0.2a | `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Per-app `tsconfig` extends it. | Composer | `tsconfig.base.json`, `apps/web/tsconfig.json` | `pnpm typecheck` on empty repo passes |
| 0.2b | ESLint config with the **no-raw-color-literal** rule (regex `#[0-9a-fA-F]{3,8}\|rgb\|rgba\|hsl\|-\[#`). Scope it to `apps/web/**/*.{tsx,ts,css}`. | Cmd+K (inside `.eslintrc.cjs`) | `.eslintrc.cjs`, `.eslintignore` | Manual test: paste `color: #fff` into a component, lint fails |
| 0.2c | LOC gate script `scripts/loc-check.mjs` + `.loc-ignore` + `pnpm run loc-check` task in `package.json`. | Composer | `scripts/loc-check.mjs`, `.loc-ignore`, `package.json` | Drop a 501-line dummy `.tsx` → script exits non-zero; delete and retest |
| 0.3 | `.env.example` (§1.3 — copy verbatim) + `lib/env.ts` (Zod parse, throws at import on missing var). | Composer | `.env.example`, `apps/web/lib/env.ts` | Unit test in `lib/env.test.ts`: missing `DATABASE_URL` → throws synchronously |
| 0.4a | `styles/tokens.css` with the Ventive token set (canvas `#FAFAF7`, surface `#FFFFFF`, ink `#1A1A1A`, accent `#0F4C47`, warn `#B45309`, radii 4/8/14, focus ring). | Cmd+K | `apps/web/styles/tokens.css` | File present, imported in `app/layout.tsx` |
| 0.4b | `tailwind.config.ts` reads CSS variables (no hardcoded colors in `theme.extend.colors`). | Cmd+K | `tailwind.config.ts` | `text-canvas`, `bg-accent`, etc. resolve in a sandbox component |
| 0.5 | Stub `lib/auth/require-auth.ts` and `lib/auth/patient-belongs-to-tenant.ts` with the exact signatures from §6 Phase 0. Fixture-driven in dev, throw in prod. | Composer | `lib/auth/*.ts` | `requireAuth()` returns the typed `Session` shape in dev mode unit test |
| 0.6 | The three `[STUB Phase 0]` touchpoints: `(dashboard)/.../intake/page.tsx`, `api/patients/[id]/prep-brief/route.ts` (GET → empty shape, POST → 204), `lib/audit/write-audit.ts` (inserts row + writes paired `patient_timeline` when entity is patient). | Composer | three files | `GET /api/patients/test/prep-brief` returns 200 with `{ suggested_lab_panels: [], reasoning: "" }` |

**Phase exit (BUILD & TEST 0)**: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm run loc-check` all green. Manual: insert a 501-line file, gate fails; delete and re-run.

## Phase 1 — Database & Schema

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 1.1 | Drizzle schema for `intake_tokens` (§4.2). | Composer | `apps/web/lib/db/schema/intake-tokens.ts` | Schema typechecks; `drizzle-kit generate` produces a migration |
| 1.2a | Drizzle schemas for `intake_documents`, `document_chunks` (§4.3, §4.4). | Composer | `lib/db/schema/intake-documents.ts`, `document-chunks.ts` | Schema typechecks |
| 1.2b | Drizzle schemas for `processing_jobs`, `audit_log` (§4.5, §4.6). | Composer | `lib/db/schema/processing-jobs.ts`, `audit-log.ts` | Schema typechecks |
| 1.3 | `ALTER TABLE patients ADD COLUMN intake_status` migration; inline-doc the `intake_data` JSONB top-level keys (§4.1) in a comment block. | Composer | new migration file | `drizzle-kit` generates expected SQL |
| 1.4a | Generate the consolidated migration with `drizzle-kit`; pgvector `CREATE EXTENSION`. | Composer | `drizzle/migrations/0001_*.sql` | Migration applies clean to a fresh Postgres |
| 1.4b | RLS policies — tenant-scoped — for each new table. (Separate file; this is high-risk and worth a focused pass.) | **Cmd+K + Claude design** (see Part 3) | `drizzle/migrations/0002_rls.sql` | Smoke test: cross-tenant select returns 0 rows |
| 1.5 | Partial unique index: one active token per patient. | Cmd+K (append to migration) | same migration | `psql` smoke test: second active token → unique-violation |

**Phase exit (BUILD & TEST 1)**: Run migration on local Postgres. Insert → select → cross-tenant blocked → second-active-token rejected.

## Phase 2 — Schemas and Pure Logic (highest-value checkpoint — clinical safety) ⭐

This is the phase where Cursor's agent is the **least** appropriate driver and Claude's design pass matters the most. These files are small, dense, and the test cases *are* the spec. See Part 3 for the design workflow.

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 2.1 | `step-one.schema.ts` — Zod for About You / Why Here / Symptoms / Lifestyle. | Composer (after Claude designs the shape) | `lib/intake/schemas/step-one.schema.ts` | Snapshot test of `.shape` |
| 2.2 | `question-plan.schema.ts` — the LLM output contract (`identified_issues[]`, `question_plan[]`, `friction_budget`). | Composer (after Claude designs) | `lib/intake/schemas/question-plan.schema.ts` | Round-trips a hand-written valid fixture and rejects three crafted invalid fixtures |
| 2.3 | `intake-data.schema.ts` including `_provenance` and `_ai_confirmations`. | Composer | `lib/intake/schemas/intake-data.schema.ts` | Snapshot test |
| 2.4 | `deterministic-triggers.ts` — pure signal→module map (§5.2). | Cmd+K (table-to-code) | `lib/intake/deterministic-triggers.ts` | Table-driven unit test: each signal → expected module; no signal → `[]` |
| 2.5 | `friction-budget.ts` — pure budget enforcement (§5.3). Invariant: budget cannot suppress a deterministic branch. | Composer (after Claude designs the algorithm) | `lib/intake/friction-budget.ts` | **5 deterministic + budget 4 → all 5 render, augmented suppressed.** Must-have questions never dropped. |
| 2.6 | `readiness.ts` — pure deterministic gate (§5.1). Implement the algorithm in the PRD **exactly** — same names, same branching. | Composer (one-shot from the spec block) | `lib/readiness/readiness.ts`, `readiness.types.ts` | Table-driven test mirroring §5.1: Required fail → `insufficient` / `can_generate:false`; only Medium → `moderate`; High → `low`; all met → `ready`/`high` |
| 2.7 | `merge-intake.ts` — shallow JSONB merge + provenance tagging. | Composer | `lib/intake/merge-intake.ts` | Merging an `ai`-tagged field over a `patient`-tagged field preserves the patient value and writes an `_ai_confirmations` slot pending review |

**Phase exit (BUILD & TEST 2 — clinically gated)**: `pnpm test lib/` green. Then **read each test out loud to a clinician** and have them sign off on the trigger table and readiness branches. Do not advance until this happens.

## Phase 3 — Patient Intake (Step 1) + Tokens + Autosave

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 3.1a | `intake-token.ts` — `mint()` (128-bit CSPRNG, store hash only). | Composer | `lib/tokens/intake-token.ts` | Unit: minted token verifies; hash, not raw, in DB |
| 3.1b | `verify()` — TTL, revoked, rate-limit (per-token + per-IP), lockout after N failures. | Cmd+K (append) | same file | Unit: expired/revoked/wrong → rejected; lockout fires at threshold |
| 3.1c | `revoke()` / `reissue()`. | Cmd+K | same file | Unit: revoking the active token clears the partial index slot |
| 3.2 | `POST /api/patients/[id]/intake-token` (C-1) — auth'd, audited. | Composer | `app/api/patients/[id]/intake-token/route.ts` | Integration: 401 unauth; 200 auth'd; audit row written |
| 3.3 | `GET /api/intake/[token]` (API-1). Verify → audit access → return intake state. | Composer | `app/api/intake/[token]/route.ts` | bad token → 401/404; good → 200 with no PHI in URL; 429 + lockout after limit |
| 3.4 | `POST /api/intake/[token]/section` (API-2) — Zod-validated autosave; provenance `patient`. | Composer | `app/api/intake/[token]/section/route.ts` | Save → row updated → audit row written |
| 3.5a | Step-1 shell + orchestrator (`step-one-form.tsx` — orchestrator only, ≤200 LOC). | Composer | `app/intake/[token]/step-one/step-one-form.tsx`, `page.tsx` | Renders, navigates between sub-screens |
| 3.5b | `about-you.tsx` — one screen, inline validation, autosave on blur. | Cmd+K (component-by-component) | one file | Validates and autosaves at 320px |
| 3.5c | `why-here.tsx`. | Cmd+K | one file | Same |
| 3.5d | `symptoms.tsx`. | Cmd+K | one file | Same |
| 3.5e | `lifestyle-snapshot.tsx`. | Cmd+K | one file | Same |

**Phase exit (BUILD & TEST 3)**: Complete Step 1 at 320px; refresh mid-form, state restored; audit rows present.

## Phase 4 — Analysis Call + Step 2 Renderer (+ degraded path)

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 4.1 | Author the three prompt files (PHI-free system prompts). **Claude-led** (see Part 3). | Pasted from Claude | `services/analysis-engine/prompts/*.md` | Files committed; reviewed for PHI leakage |
| 4.2 | `analyze-intake.ts` — Anthropic call, prompt caching, Zod parse, **1 bounded retry**, record `model_id` + prompt version. | Composer | `lib/llm/analyze-intake.ts` | Unit (with mocked client): valid → parsed plan; invalid twice → returns `null` for caller to degrade |
| 4.3 | `question-banks.ts` — static fallback banks per deterministic module (degraded path source). | Cmd+K (table-driven) | `lib/intake/question-banks.ts` | Unit: each deterministic module key returns a populated bank |
| 4.4 | `POST /api/intake/analyze` (API-3) — combine deterministic + augmented, apply friction budget, **never trust client**. Double-failure → deterministic plan + `analysis_degraded=true`. | Composer | `app/api/intake/analyze/route.ts` | Integration: digestive + hormonal signals → `gut_deep_dive` and `hormone_deep_dive` even over budget (DoD-2); no-signal → minimal Step 2 (DoD-3); mocked double-fail → `analysis_degraded=true` with all must-fire modules present (DoD-11) |
| 4.5 | `step-two-renderer.tsx` + `analyze-client.ts` — renders only triggered modules. | Composer | `app/intake/[token]/step-two/{step-two-renderer.tsx, analyze-client.ts}` | Renders correct modules from a fixture plan |
| 4.6a | `gut-deep-dive.tsx`. | Cmd+K | one file | Skippable uploads; mixed controls |
| 4.6b | `hormone-deep-dive.tsx`. | Cmd+K | one file | Same |
| 4.6c | `immune-deep-dive.tsx`. | Cmd+K | one file | Same |
| 4.6d | `medication-followups.tsx`. | Cmd+K | one file | Same |
| 4.6e | `sleep-deep-dive.tsx`. | Cmd+K | one file | Same |
| 4.6f | `stress-deep-dive.tsx`. | Cmd+K | one file | Same |
| 4.6g | `wellness-practice.tsx`. | Cmd+K | one file | Same |
| 4.7 | `POST /api/intake/[token]/submit` (API-4) — merge w/ provenance, status `labs_pending`, audit + timeline. | Composer | `app/api/intake/[token]/submit/route.ts` | Submit → DB shows merged answers with `source` tags |

**Phase exit (BUILD & TEST 4)**: All checkpoints above; browser walk-through at 320px.

## Phase 5 — Transcription Pipeline

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 5.1 | `detect-type.ts` — magic-byte detection (TR-1). | Composer | `lib/transcription/detect-type.ts` | Unit: sample bytes per type classified |
| 5.2 | `route-engine.ts` — refuses AssemblyAI/Textract when `baa_verified=false` (TR-2). | Composer | `lib/transcription/route-engine.ts` | Unit: blocked when flag false |
| 5.3 | `POST /api/patients/[id]/intake-docs` (API-5) — validate, AV scan, S3 put, enqueue → `202 + job_id`. | Composer | `app/api/patients/[id]/intake-docs/route.ts` | Integration: returns 202 with `job_id` |
| 5.4a | Whisper Python service (`services/whisper/server.py`). | Composer (separate sub-task, isolated context) | `services/whisper/*` | Docker container starts; `/transcribe` returns segments |
| 5.4b | Worker `worker.ts` + `pipeline.ts`. | Composer | `workers/transcription/{worker.ts, pipeline.ts}` | Processes a fixture job end-to-end |
| 5.4c | Processor: `video.ts` (ffmpeg → audio). | Cmd+K | one file | Extracts audio track |
| 5.4d | Processor: `audio.ts` (whisper / assemblyai). | Cmd+K | one file | Transcribes |
| 5.4e | Processor: `pdf.ts` (PyMuPDF → Textract fallback < 30% yield) (TR-9). | Cmd+K | one file | Local-only when BAA absent |
| 5.4f | Processor: `docx.ts` (mammoth). | Cmd+K | one file | Extracts text |
| 5.4g | Processor: `image.ts` (Tesseract → Textract). | Cmd+K | one file | Same fallback discipline |
| 5.5 | `normalize.ts` → `{ text, segments[], speakers[], confidence }`; chunk ~300 tok; embed; pgvector HNSW; flag low-confidence spans. | Composer | `lib/transcription/normalize.ts` | Unit: shape conforms; chunks within ±10% of 300 tok |
| 5.6 | Worker `processing_status` state machine — idempotent, retry-safe (TR-4). | Cmd+K (refactor of worker.ts) | `workers/transcription/worker.ts` | Kill mid-job + restart → completes once |
| 5.7 | TR-8: `is_verified=true` iff zero outstanding flagged spans OR explicit per-span dismissal. | Cmd+K | `lib/transcription/normalize.ts` + a verification helper | Unit: span dismissed → verified; span outstanding → not |

**Phase exit (BUILD & TEST 5)**: End-to-end upload → job → chunks + embeddings; idempotency proven.

## Phase 6 — Readiness Gate Wiring + Generation Guard (clinically gated) 🏥

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 6.1 | `GET /api/patients/[id]/protocol-readiness` (API-7) — assemble checklist; call pure `readiness()`. | Composer | `app/api/patients/[id]/protocol-readiness/route.ts` | Returns §5.1 JSON shape |
| 6.2 | `format-timeline-for-prompt.ts` — include transcripts/notes; **exclude unconfirmed `source: ai`** (DoD-10). | Composer | `lib/prompt/format-timeline-for-prompt.ts` | Unit: AI field omitted; included once confirmed |
| 6.3 | `POST /api/patients/[id]/generate-protocol` (API-8) — re-check readiness server-side (GATE-1); refuse high when ceiling `<high`; pass ceiling into prompt (GATE-2). | Composer | `app/api/patients/[id]/generate-protocol/route.ts` | API: Required fail → `can_generate:false` even if client forces (DoD-5) |
| 6.4a | DC-1 validator — reject unhedged mg/IU/frequency. | **Claude-designed regex/parser**, then Composer | `lib/readiness/dc-validators.ts` | Unit: catches "500 mg", "2 IU"; passes "low starting dose" |
| 6.4b | DC-2 scope validator — foundational-layer only when ceiling `<high`. | Same workflow | same file | Unit |
| 6.4c | DC-3 banner enforcement — non-removable when ceiling `<high`. | Cmd+K | template/output | Output without banner → rejected |
| 6.4d | DC-4 `areas_of_uncertainty` force-populated from `blocking_gaps + non_blocking_gaps`. | Cmd+K | API-8 route | Unit: empty `areas_of_uncertainty` with non-empty gaps → rejected |
| 6.4e | DC-5 persist ceiling + gap list to `protocols.content.confidence` and write audit. | Cmd+K | API-8 route | DB inspect: confidence persisted; audit row present |
| 6.5 | Audit every gate evaluation (`protocol_readiness_evaluated`) (GATE-3). | Cmd+K | API-7, API-8 | Every call writes a row |

**Phase exit (BUILD & TEST 6 — clinically gated)**: All tests green **plus** a clinician walks through three scenarios (Required gap, High-only gap, all-met) and signs off on the outputs and banners. This is a clinical safety boundary, not a code review.

## Phase 7 — Clinician Review UI + Provenance

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 7.1a | `intake-review.tsx` orchestrator. | Composer | one file | Renders submitted intake |
| 7.1b | `provenance-badge.tsx` — patient / clinician / ai. | Cmd+K | one file | Renders three states |
| 7.2 | `ai-field-confirm.tsx` — confirm/edit; writes `_ai_confirmations`. | Composer | one file | Confirming an AI field updates readiness live (it crosses "Required-for-high") |
| 7.3 | `readiness-widget.tsx` — readiness + gap list with deep links. | Composer | one file | Gaps link to the resolving section |

**Phase exit (BUILD & TEST 7)**: Browser walk-through; audit rows for every confirm/edit.

## Phase 8 — Hardening + DoD Sweep

| # | Task | Mode | Touches | Exit |
|---|---|---|---|---|
| 8.1 | PHI-free notification type test (DoD-7) — `Notification` type *structurally* cannot hold PHI. | Composer | `lib/notifications/types.test.ts` | TS compile error if you try to put PHI in the payload |
| 8.2 | CI green: LOC + no-raw-color across the whole tree (DoD-8). | Cmd+K (fix violations as they appear) | many | Both gates green |
| 8.3 | Token brute-force E2E (Playwright) — lockout fires (DoD-11). | Composer | `e2e/token-bruteforce.spec.ts` | Test goes red without lockout, green with |
| 8.4 | Full happy path + degraded path E2E at 320px. | Composer | `e2e/intake-happy.spec.ts`, `e2e/intake-degraded.spec.ts` | Both pass |
| 8.5 | Mobile think-aloud pass; file issues; fix friction. | (manual; tickets, then Cmd+K) | UI files | Issues resolved |

**Phase exit (BUILD & TEST 8 — final)**: All gates green; walk DoD-1 through DoD-11 with the test that backs each.

---

# Part 2 — Cursor Workflow Strategy

## Set up Cursor Rules **before you start Phase 0**

The five global constraints (C-LOC, C-SLICE, C-TOKENS, C-PHI, C-AUDIT) need to ride along in every single prompt or the agent will quietly violate them. Put them in `.cursor/rules/` (or `.cursorrules` at the repo root if you're on an older Cursor version) so they're injected automatically. Suggested files:

- **`.cursor/rules/00-global-constraints.md`** — the five C-* rules verbatim, with examples of what *would* violate each.
- **`.cursor/rules/10-stack.md`** — the §1.2 table, pinned versions, with a note that the agent must never propose a different library.
- **`.cursor/rules/20-vertical-slices.md`** — the §3 file tree with a note: "if a new file isn't in this tree, stop and ask."
- **`.cursor/rules/30-phi-boundary.md`** — what PHI is, the analysis-call rule (system prompt is PHI-free, user message carries PHI), the audit payload rule.
- **`.cursor/rules/40-clinical-safety.md`** — Phase 2 and Phase 6 are clinically gated. The agent must surface a "needs clinical review" callout when touching `readiness.ts`, `friction-budget.ts`, `deterministic-triggers.ts`, or the DC-* validators.

A trick that works: in each rule file, after the prose, include a **"failure modes"** list of three or four specific things you've seen the agent do wrong. The agent is much more likely to avoid the negative example than to internalize the positive principle.

## When to use Composer (Agent mode)

Composer earns its keep when the task **crosses files** or **creates from a clean slate**. For this PRD, that's:

- **All of Phase 0** — workspace init, config files, stubs. One prompt per task `0.x` is right.
- **Each new route handler** — `route.ts` plus its colocated test plus the Zod input/output schemas usually want to land together.
- **The Drizzle schema files in Phase 1** — schema + types + the migration are coupled.
- **Each new page or orchestrator component** — the page plus its sub-components in the right tree, scaffolded together.
- **Author the analysis-engine prompts** — the three `.md` prompt files in `services/analysis-engine/prompts/` and the `analyze-intake.ts` that loads them are best generated as one bundle (after Claude has done the prompt design — see Part 3).

The single most important Composer discipline on this build: **paste the relevant PRD section into the prompt every time**. Even with Cursor Rules loaded, the agent works better with the spec block (e.g., §5.1's readiness algorithm) literally in the prompt. The PRD's IDs (TR-, GATE-, DC-, DoD-) are gold here — say "implement DC-1" and the agent has a target to test against.

## When to use Cmd+K (inline edits)

Cmd+K wins when the change is **within one file** and **bounded**:

- **Adding a new test case** to an existing `*.test.ts`.
- **Adding a branch** to `readiness.ts` or `friction-budget.ts` — these files are short and dense; you do *not* want the agent rewriting them from scratch.
- **Type tightening** — promoting `string` to a Zod-derived branded type, adding `as const` to a table.
- **All the deep-dive module components in Phase 4.6a–4.6g** — each one is structurally similar to the last, and inline edits with the prior module as @file context is faster than Composer.
- **DC-1 through DC-5 validators** — once Claude has the regex or AST approach, Cmd+K inline is the right tool to apply it.

Cmd+K is also the right tool for the **CI cleanup pass in Phase 8.2** — the LOC and color-literal violations will pop up one file at a time; fix them inline.

## Using @Codebase well

`@Codebase` searches your whole project; `@file` and `@folder` are scoped. For this build:

- **Use `@Codebase` sparingly**, mostly for cross-cutting questions: "what files use `formatTimelineForPrompt`?", "where do we write to `audit_log`?", "show all places that read `intake_data._provenance`."
- **Prefer `@file` for the PRD itself**: `@clinical-signal-intake-CURSOR-READY-PRD-v2.md` in every prompt that involves a spec'd behavior. Cheaper than @Codebase and more precise.
- **`@folder lib/intake/schemas`** when you're working on a deep-dive module — the agent needs the schemas to type its props.
- **`@folder workers/transcription/processors`** when adding a new processor — pattern-matching from a sibling is faster than re-deriving the interface.

A `@Codebase` query that's worth running **at every phase boundary**: "Find any file in this repo over 400 LOC, and tell me which ones are approaching the 500-LOC gate." This catches violations before CI does and tells you when to split.

## Sequencing — what to do in what mode, by phase

| Phase | Composer-led | Cmd+K-led | Notes |
|---|---|---|---|
| 0 | Almost everything (scaffolding) | 0.2b ESLint rule, 0.4a tokens.css | One prompt per `0.x`; don't bundle |
| 1 | 1.1, 1.2, 1.4a (schemas + migration) | 1.4b RLS, 1.5 partial index | RLS is high-risk — slow down and have Claude review |
| 2 | 2.1, 2.2, 2.3, 2.5, 2.6, 2.7 | 2.4 (table-to-code) | **Design every file with Claude first** — see Part 3 |
| 3 | 3.2, 3.3, 3.4, 3.5a (route handlers, orchestrator) | 3.1b, 3.1c, 3.5b–3.5e (sub-screens) | Use 3.5b as a template for c/d/e |
| 4 | 4.2, 4.4, 4.5, 4.7 (analyze pipeline + routes) | 4.3 (table), 4.6a–4.6g (modules, sibling-templated) | Author 4.1 prompts in Claude, paste in |
| 5 | 5.1, 5.2, 5.3, 5.4a, 5.4b, 5.5 | 5.4c–5.4g (processors), 5.6, 5.7 | Whisper Python service is an isolated Composer task |
| 6 | 6.1, 6.2, 6.3 | 6.4a–6.4e, 6.5 | **Clinician review before merge** |
| 7 | 7.1a, 7.2, 7.3 | 7.1b | |
| 8 | 8.1, 8.3, 8.4 | 8.2 (cleanup), 8.5 (friction fixes) | |

## Two anti-patterns I'd flag specifically for this PRD

1. **Don't let Composer "finish the phase."** It will offer. The `BUILD & TEST n` checkpoints are not decoration — Phase 2 and Phase 6 are explicit clinical-safety gates. Stop after each task, run the test, then continue.
2. **Don't let the agent edit `readiness.ts`, `friction-budget.ts`, or `deterministic-triggers.ts` without a test diff in the same change.** These three files are the clinical core. A change that doesn't also update the table-driven test is a red flag.

---

# Part 3 — Leveraging Claude

Claude's comparative advantage on this project is in the work that happens **before code is written** and at the **safety-critical boundaries** where Cursor's agent has the wrong incentives (Cursor optimizes for "produce code"; Claude can sit with "should we?").

I'd split Claude's role into three buckets: **upfront design**, **per-phase review**, and **prompt authoring**.

## Bucket 1 — Upfront design (do this before Phase 2)

These are the artifacts I'd produce with Claude before letting Cursor write a line of clinical-core code:

- **An ADR ("Architecture Decision Record") for the Readiness Gate.** Why these three weights? Why does AI-confirmed have a special "Required-for-high" status? What's the failure mode if a clinician dismisses a flagged span without reading it? Claude is good at sitting in the "what could go wrong" seat and surfacing branches the PRD glossed over.
- **The full Zod shape for `question-plan.schema.ts`** before Cursor writes it. This is the LLM's output contract — if it's loose, the whole degraded-confidence story falls apart. Iterate with Claude on the discriminated unions, required-vs-optional, and what the failure shape looks like when the LLM emits *almost* the right thing.
- **A test matrix for Phase 2's three pure functions** (`readiness`, `friction-budget`, `deterministic-triggers`). The PRD lists *some* test cases; the gap is the edge cases. Have Claude enumerate: what about a Required check that's met but its dependencies aren't? What about a deterministic module that triggers but has zero questions in its bank? The table of (inputs → expected output) becomes the test file Cursor implements.
- **The DC-1 validator approach.** The PRD says "post-gen check rejects unhedged mg/IU/frequency." That's a regex? An AST? An LLM call to a second model? This decision has a lot of correctness implications and Claude should walk through the trade-offs before Cursor writes one.
- **A PHI threat model for the token surface.** API-1 is the only unauthenticated PHI surface in the system. Claude can enumerate the attack tree (entropy, timing, enumeration, rate-limit bypass, replay) and you turn that into the Playwright test in Phase 8.3.

## Bucket 2 — Per-phase review (between phases, before merging)

After Cursor finishes a phase and the BUILD & TEST checkpoint is green, paste the diff (or the key files) into Claude with the relevant PRD section and ask three questions:

1. **"What invariant from the PRD might this code violate that the tests don't catch?"** Tests verify behavior on inputs you thought of. Claude is better than the agent at finding behaviors you *didn't* test.
2. **"Where is this file likely to grow past 500 LOC, and what's the right next split?"** Preempts the C-LOC ceiling rather than reacting to it.
3. **"What changed in the audit story?"** Every mutation should have written `audit_log` + `patient_timeline`. If the diff added a mutation, you want a sanity check that it didn't skip the audit.

The phases where this review is most valuable: **2, 4, 5, 6**. (Phase 0/1 are mostly mechanical; 3/7 are UI; 8 is sweep.) Of those, **Phase 6 should not be merged without a Claude review pass on the DC-1 through DC-5 validators.**

## Bucket 3 — Prompt authoring (Phase 4.1)

This is where Claude has the most unfair advantage. The three prompt files in `services/analysis-engine/prompts/`:

- `intake_issue_identification_v1.md`
- `intake_dynamic_questions_v1.md`
- `intake_freetext_interpretation_v1.md`

These prompts need to be PHI-free in the system message (constraint C-PHI), produce JSON that conforms to `question-plan.schema.ts` (so the Zod parse passes on the first try), and respect the friction budget (so the LLM doesn't return 47 augmented questions when the budget is 18). They also need to **interact correctly with the degraded-confidence ceiling** — when API-8 tells the prompt "your ceiling is moderate," it has to know what that means and self-constrain.

Don't let Cursor's agent write these. The agent will produce something syntactically plausible that fails Zod 40% of the time. Use Claude to:

- Draft each prompt with the schema embedded inline (Claude can format JSON schemas for prompts in a way that improves output reliability).
- Generate a "prompt eval" — 10 hand-written Step-1 fixtures with the expected `identified_issues[]` and `question_plan[]`. Run those against the prompt; iterate until they pass.
- Write the degraded-confidence prefix that's prepended when ceiling `< high`. The DC-* rules need to live in the prompt body, not just in the post-gen validator — defense in depth.

Once these are dialed in, paste them into the repo as the v1 files. **Version them.** When you tune the prompt later, you ship a `_v2` next to the v1 and let `analyze-intake.ts` choose, because the `model_id + prompt version` audit field assumes prompts are immutable artifacts.

## The Claude → Cursor handoff pattern

A workflow that works well for the clinical core (Phase 2) and the gate (Phase 6):

1. **In Claude**, paste the PRD section and ask for the design: types, algorithm in prose, edge-case enumeration, test matrix.
2. **In Claude**, ask Claude to produce the file as it would land — with comments calling out where to be careful — and the matching test file.
3. **In Cursor**, open a new Composer prompt: "Implement `lib/readiness/readiness.ts` and `lib/readiness/readiness.test.ts` per this design [paste]. Conform to the PRD section [paste §5.1]. The test must include every row of this matrix [paste]." This gives Cursor the design *and* the verification, in one shot, with no degrees of freedom left to drift.
4. **Run the tests.** If anything's red, fix with Cmd+K, not Composer — Composer will rewrite more than you want.
5. **Diff back to Claude** and ask: "What did this implementation get away with that I should harden?"

The pattern is: **Claude designs and reviews; Cursor builds; you adjudicate.** Cursor is faster at building and worse at deciding what to build. Claude is slower at building and better at deciding. The PRD is precise enough that this hand-off has narrow ambiguity surfaces — but the ambiguity is exactly where the bugs will live, which is why Claude should own those moments.

## One thing Claude is *not* the right tool for here

The Whisper Python microservice (Phase 5.4a) and the per-format processors (5.4c–5.4g) are well-trodden integration code. Let Cursor handle these end-to-end. The risk surface is mechanical (does the SDK call work, does the byte detection match) and Cursor's tight loop with the actual file bytes will catch issues faster than Claude reading code blind. Save Claude's cycles for the clinical core and the prompts.
