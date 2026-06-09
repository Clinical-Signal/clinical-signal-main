# Clinical Signal — Hybrid LLM Intake, Transcription & Readiness Gate
## Agent-Optimized Product Requirements Document (Cursor-Ready, v2.0)

> **Source:** Rewritten from `clinical_signal_intake_llm_prd` v1.2 for autonomous AI-agent execution in Cursor (Composer / Agent mode).
> **Build philosophy:** Hyper-granular, test-after-every-step. No micro-task is "done" until its checkpoint passes.

---

## ⚠️ ASSUMPTIONS — READ FIRST (flagged per the original request)

The original PRD is an **extension to an existing system**. It references a companion "general PRD," existing DB tables, and existing helper functions (`saveSectionAction`, `formatTimelineForPrompt`, `submitIntake`, etc.) that an agent in a fresh workspace **cannot see**. This document resolves that gap by committing to **greenfield-with-stubs mode**: anything labeled `[STUB Phase 0]` in §3 is created in Phase 0 as a minimal working stub with the same signature, and only swapped for the real implementation if/when the parent codebase is merged in. The agent never has to branch on "does this exist yet?" — Phase 0 guarantees it does. **Confirm or correct each assumption before building:**

1. **A1 — Build mode: greenfield-with-stubs.** This document is executed as a fresh build. Every `[STUB Phase 0]`-labeled item in §3 has an explicit Phase 0 stub task (§6 Phase 0). When the agent finishes, the system runs end-to-end on its own; if a real parent codebase is later merged, the stubs are replaced one slice at a time, never branched on. **There are no `[EXISTING?]` decisions for the agent to make.**
2. **A2 — Stack (committed).** Next.js 14.2.x (App Router) + TypeScript 5.4.x, Tailwind CSS 3.4.x with CSS-variable design tokens, PostgreSQL 15.x (Supabase) with Row-Level Security + the `pgvector` extension, Drizzle ORM 0.30.x, Zod 3.23.x, BullMQ 5.x + Redis 7.x, AWS S3 (SDK 3.x), self-hosted Python `faster-whisper` worker, Anthropic TypeScript SDK 0.27.x.
3. **A3 — Package manager: pnpm 9.x (committed).** Paths `apps/web`, `services/*`, `workers/*` resolve as pnpm workspaces. Do **not** substitute npm or yarn — lockfile semantics, hoisting, and the workspace protocol used in §3 assume pnpm.
4. **A4 — Auth: stub in Phase 0.** `lib/auth/require-auth.ts` and `lib/auth/patient-belongs-to-tenant.ts` are created in Phase 0 as Supabase-Auth-compatible stubs returning a typed session object. The signature is fixed; the implementation can be swapped later.
5. **A5 — Concrete schema.** §4 contains **full proposed DDL**. The agent runs it as written. If a parent codebase is later merged, reconcile column names rather than overwriting.
6. **A6 — Analysis model: env-configured.** Default `ANTHROPIC_MODEL=claude-sonnet-4-5` in `.env.example`. The source never contains a model literal — `analyze-intake.ts` reads `process.env.ANTHROPIC_MODEL` and persists it per call. Update the env string when Anthropic ships a newer Sonnet/Opus class model under BAA.
7. **A7 — Clinical safety.** Readiness-gate and degraded-confidence logic require **human review**, not just green tests. Phase 2 (the pure-logic checkpoint) and Phase 6 (gate wiring) are **clinician-gated** in addition to CI-gated.

---

# 1. Project Overview & Tech Stack

## 1.1 What we are building
A patient-facing, mobile-first **hybrid LLM intake**: a light Step-1 form, an LLM analysis pass that identifies issues and returns a schema-validated dynamic question plan, and a Step-2 renderer that shows *only* triggered deep dives. Plus an async **call-transcription pipeline** and a deterministic **Protocol Readiness Gate** that blocks or caps clinical protocol generation on incomplete data.

## 1.2 Explicit tech stack (no inference required)

| Layer | Choice | Version (pin in lockfile) | Notes |
|---|---|---|---|
| Runtime | Node.js | `20.11.x` LTS | Pinned via `engines` in `package.json` |
| Package manager | pnpm | `9.12.x` | Workspaces enabled; **do not substitute** (A3) |
| Framework | Next.js (App Router) | `14.2.x` | RSC + Route Handlers |
| Language | TypeScript | `5.4.x` | `strict: true` |
| UI | React | `18.3.x` | |
| Styling | Tailwind CSS + CSS-variable tokens | `3.4.x` | No raw hex in components (see §3.4) |
| Validation | Zod | `3.23.x` | Single source of truth for all contracts |
| DB | PostgreSQL (Supabase) | `15.x` | RLS enforced; `pgvector` 0.7.x extension |
| ORM | Drizzle ORM | `0.30.x` | + `drizzle-kit` `0.24.x` for migrations |
| Job queue | BullMQ + Redis | `5.x` / `7.2.x` | Async transcription jobs |
| Object storage | AWS S3 (or S3-compatible) | `@aws-sdk/client-s3` `3.x` | Encrypted at rest (SSE-KMS) |
| Transcription (primary) | faster-whisper (self-hosted Python service) | `1.0.x` (Python pkg) | Default, no BAA needed |
| Transcription (fallback) | AssemblyAI medical | API `v2` | BAA-gated, opt-in |
| OCR (local) | Tesseract (`tesseract.js` 5.x or system binary 5.x) | 5.x | Default; no BAA |
| OCR (fallback) | AWS Textract via `@aws-sdk/client-textract` | `3.x` | BAA-gated; used only when local yield < 30% |
| LLM | Anthropic TypeScript SDK | `@anthropic-ai/sdk` `0.27.x` | Model via `ANTHROPIC_MODEL` env (A6) |
| Media | ffmpeg | system binary `6.x` | Video→audio extraction |
| Testing | Vitest + Playwright | Vitest `1.6.x`, Playwright `1.47.x` | Unit + E2E |
| Embeddings | pgvector HNSW index | extension `0.7.x` | `~300`-token chunks; `vector(1536)` |

## 1.3 Environment variables (create `.env.example` in Phase 0)
```
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_BUCKET=
S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5    # (A6) env-configured; analyze-intake.ts reads this and persists per call. Update when Anthropic ships a newer Sonnet/Opus under BAA. Source must never contain a model literal.
ASSEMBLYAI_API_KEY=          # optional, BAA-gated
INTAKE_TOKEN_TTL_DAYS=7
INTAKE_TOKEN_RATE_LIMIT_PER_MIN=10
WHISPER_SERVICE_URL=http://whisper:9000
TEXTRACT_REGION=             # optional, BAA-gated; required only if AWS Textract fallback is enabled
```

## 1.4 Non-negotiable global constraints (enforced in CI)
- **C-LOC:** No file over **500 lines**. CI gate fails the build otherwise.
- **C-SLICE:** Every surface is a vertical slice — split Step 1, Step 2, each deep-dive module, the analyze client, and the readiness widget into separate small files.
- **C-TOKENS:** UI uses design tokens only; **zero raw color literals** in components (lint rule).
- **C-PHI:** No PHI in any notification payload, log line, or LLM system prompt. PHI travels only in the LLM *user* message.
- **C-AUDIT:** Every mutation writes an `audit_log` row + a `patient_timeline` event.

---

# 2. Core Features & User Flow

## 2.1 Patient flow (happy path)
1. Clinician generates an expiring, tenant-scoped intake link from the patient record → `POST /api/patients/[id]/intake-token`.
2. Patient opens `/intake/[token]` on a phone. Token validated (entropy, TTL, rate-limit) before any data loads.
3. **Step 1 (light form, ~5 min):** About You → Why You're Here → Current Symptoms → light Lifestyle snapshot. One concept per screen, per-field autosave, visible progress, save & resume.
4. Patient submits Step 1 → `POST /api/intake/analyze`.
5. **Server LLM analysis:** PHI-free system prompt + Step-1 answers as user message → JSON `identified_issues[]` + `question_plan[]`, validated by Zod. Deterministic triggers always fire; LLM augments within the friction budget.
6. **Step 2 (dynamic):** Render *only* triggered modules with mixed controls (chips, sliders, Bristol selector, free text) + optional uploads. Empty/minimal if nothing triggered.
7. Patient submits → status `labs_pending`; answers merged into `intake_data` with provenance.

## 2.2 Degraded patient flow (LLM unavailable / invalid JSON twice)
- Patient is **never** shown a dead-end. System renders the **static deterministic deep-dive set** from the trigger table (§5.2). Session flagged `analysis_degraded = true`; recorded as a non-blocking readiness gap. All answers preserved.

## 2.3 Clinician flow
1. Review submitted intake with **provenance tags** (patient / clinician / ai).
2. Confirm or edit each `source: ai` field. Unconfirmed AI fields are excluded from *both* readiness and the trusted-facts generation payload.
3. Upload/auto-transcribe calls; review low-confidence spans; mark verified.
4. View **Readiness Gate** result: `ready | partial | insufficient` with explicit gap list.
5. Generate protocol — server re-checks readiness; degraded-confidence constraints applied if ceiling `< high`.

## 2.4 Transcription flow
Upload (audio/video/pdf/docx/image) → validate (magic bytes, size, AV scan) → `202 + job_id` → type-routed worker → normalize `{text, segments[], speakers[], confidence}` → persist (`intake_documents` + `document_chunks` + `processing_jobs`) → surface in Intake Hub → reaches protocol prompt via shared `formatTimelineForPrompt()`.

---

# 3. Architecture & File Structure

> Strict tree the agent must follow. **No file exceeds 500 LOC.** If a file approaches the cap, split it.

```
apps/web/
├── app/
│   ├── intake/
│   │   └── [token]/
│   │       ├── page.tsx                      # Public intake shell (token-gated)
│   │       ├── step-one/
│   │       │   ├── step-one-form.tsx         # Orchestrator only
│   │       │   ├── about-you.tsx
│   │       │   ├── why-here.tsx
│   │       │   ├── symptoms.tsx
│   │       │   └── lifestyle-snapshot.tsx
│   │       └── step-two/
│   │           ├── step-two-renderer.tsx     # Reads question_plan, maps modules
│   │           ├── analyze-client.ts         # Client wrapper for /api/intake/analyze
│   │           └── modules/
│   │               ├── gut-deep-dive.tsx
│   │               ├── hormone-deep-dive.tsx
│   │               ├── immune-deep-dive.tsx
│   │               ├── medication-followups.tsx
│   │               ├── sleep-deep-dive.tsx
│   │               ├── stress-deep-dive.tsx
│   │               └── wellness-practice.tsx
│   ├── (dashboard)/dashboard/patients/[id]/
│   │   ├── intake/                            # [STUB Phase 0] clinician-entered intake
│   │   └── review/
│   │       ├── intake-review.tsx             # Provenance review (orchestrator)
│   │       ├── provenance-badge.tsx
│   │       ├── ai-field-confirm.tsx
│   │       └── readiness-widget.tsx
│   └── api/
│       ├── intake/
│       │   ├── [token]/route.ts              # GET load (API-1)
│       │   ├── [token]/section/route.ts      # POST autosave (API-2)
│       │   ├── [token]/submit/route.ts       # POST finalize (API-4)
│       │   └── analyze/route.ts              # POST analyze (API-3)
│       └── patients/[id]/
│           ├── intake-token/route.ts         # POST mint link (C-1)
│           ├── intake-docs/route.ts          # POST/GET docs (API-5)
│           ├── prep-brief/route.ts           # [STUB Phase 0] (API-6)
│           ├── protocol-readiness/route.ts   # GET readiness (API-7)
│           └── generate-protocol/route.ts    # POST generate (API-8)
├── lib/
│   ├── intake/
│   │   ├── schemas/
│   │   │   ├── step-one.schema.ts            # Zod
│   │   │   ├── question-plan.schema.ts       # Zod (the LLM contract)
│   │   │   └── intake-data.schema.ts         # Zod incl. _provenance, _ai_confirmations
│   │   ├── deterministic-triggers.ts         # The signal→module map (pure)
│   │   ├── friction-budget.ts                # Budget enforcement (pure)
│   │   ├── merge-intake.ts                   # Shallow JSONB merge + provenance
│   │   └── question-banks.ts                 # Static fallback banks per module
│   ├── readiness/
│   │   ├── readiness.ts                      # Pure deterministic function (§5.1)
│   │   └── readiness.types.ts
│   ├── transcription/
│   │   ├── detect-type.ts                    # Magic-byte detection (pure)
│   │   ├── route-engine.ts                   # Engine selection policy
│   │   └── normalize.ts                      # → {text,segments,speakers,confidence}
│   ├── prompt/
│   │   └── format-timeline-for-prompt.ts     # SHARED — excludes unconfirmed AI
│   ├── llm/
│   │   └── analyze-intake.ts                 # Anthropic call + Zod parse + retry
│   ├── auth/
│   │   ├── require-auth.ts                    # [STUB Phase 0]
│   │   └── patient-belongs-to-tenant.ts       # [STUB Phase 0]
│   ├── audit/
│   │   └── write-audit.ts                     # audit_log + timeline (C-AUDIT)
│   └── tokens/
│       └── intake-token.ts                    # mint/verify/revoke (SEC-18)
├── workers/
│   └── transcription/
│       ├── worker.ts                          # BullMQ consumer
│       ├── pipeline.ts                         # Orchestrates detect→extract→normalize
│       └── processors/
│           ├── video.ts                        # ffmpeg → audio → engine
│           ├── audio.ts                        # whisper/assemblyai
│           ├── pdf.ts                          # PyMuPDF → Textract fallback
│           ├── docx.ts                         # mammoth
│           └── image.ts                        # Tesseract → Textract
├── components/ui/                              # Token-based primitives
└── styles/tokens.css                           # Ventive design tokens (single source)

services/analysis-engine/prompts/               # Version-controlled, PHI-free
├── intake_issue_identification_v1.md
├── intake_dynamic_questions_v1.md
└── intake_freetext_interpretation_v1.md

services/whisper/                                # Python faster-whisper microservice
└── server.py
```

---

# 4. Data Models / Database Schema

> Concrete proposed DDL (Assumption A5). Reconcile with existing tables before migrating; do not blindly overwrite.

## 4.1 Extended / new columns on `patients`
```sql
-- patients.intake_data already exists (JSONB). New top-level keys inside it:
-- {
--   "_provenance":      { "<fieldPath>": "patient" | "clinician" | "ai" },
--   "_ai_confirmations":{ "<fieldPath>": { "confirmed": bool, "by": uuid, "at": timestamptz } },
--   "_analysis_degraded": boolean
-- }
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'not_started';
  -- enum-like: not_started | step1_complete | step2_complete | labs_pending | reviewed
```

## 4.2 `intake_tokens` (new — SEC-18)
```sql
CREATE TABLE intake_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL,
  token_hash    text NOT NULL,            -- store HASH only, never the raw token
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  use_count     integer NOT NULL DEFAULT 0
);
-- Only one ACTIVE (non-revoked, non-expired) token per patient:
CREATE UNIQUE INDEX one_active_token_per_patient
  ON intake_tokens (patient_id)
  WHERE revoked_at IS NULL AND expires_at > now();
-- RLS: tenant-scoped.
```

## 4.3 `intake_documents` (existing, reused — documented for the agent)
```sql
CREATE TABLE intake_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       uuid NOT NULL REFERENCES patients(id),
  tenant_id        uuid NOT NULL,
  file_type        text NOT NULL,         -- audio|video|pdf|docx|image|transcript|note
  s3_key           text,
  processing_status text NOT NULL DEFAULT 'pending', -- pending|processing|done|failed|review
  extracted_text   text,
  metadata         jsonb NOT NULL DEFAULT '{}',
  is_verified      boolean NOT NULL DEFAULT false,
  corrections_made boolean NOT NULL DEFAULT false,
  flagged_spans    jsonb NOT NULL DEFAULT '[]',  -- low-confidence spans for review
  created_by       uuid NOT NULL,
  reviewed_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

## 4.4 `document_chunks` (existing, reused)
```sql
CREATE TABLE document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES intake_documents(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  chunk_text  text NOT NULL,
  token_range int4range,                  -- or page/time range
  page        integer,
  time_range  text,                       -- e.g. "00:01:12-00:01:40"
  embedding   vector(1536),               -- pgvector HNSW index
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

## 4.5 `processing_jobs` (existing, reused)
```sql
CREATE TABLE processing_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES intake_documents(id),
  tenant_id     uuid NOT NULL,
  status        text NOT NULL DEFAULT 'queued', -- queued|running|done|failed
  engine        text,                            -- whisper|assemblyai|textract|tesseract
  attempts      integer NOT NULL DEFAULT 0,
  error         text,
  baa_verified  boolean NOT NULL DEFAULT false,  -- true required before 3rd-party PHI
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

## 4.6 `audit_log` (existing, reused)
```sql
CREATE TABLE audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  actor_id   uuid,                          -- null for patient-token actions; use token id
  action     text NOT NULL,                 -- e.g. protocol_readiness_evaluated
  entity     text NOT NULL,                 -- patient | intake_document | protocol | token
  entity_id  uuid,
  payload    jsonb NOT NULL DEFAULT '{}',    -- MUST be PHI-free
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 4.7 Relations summary
`patients 1—N intake_tokens` · `patients 1—N intake_documents` · `intake_documents 1—N document_chunks` · `intake_documents 1—N processing_jobs` · everything tenant-scoped under RLS.

---

# 5. API & Logic Specifications

## 5.1 The Readiness Gate — pure deterministic function (no LLM)
`lib/readiness/readiness.ts` exports a **total, side-effect-free** function. Same inputs → same output, always.

**Checklist inputs & weights:**

| Check | Weight |
|---|---|
| Step-1 intake complete | Required |
| Triggered deep dives answered (or clinician-skipped w/ reason) | Required |
| Medications detailed (dose + duration) | High |
| Labs present or explicitly waived | High |
| Transcript/notes attached **and verified** | Medium |
| AI-derived fields confirmed | Required-for-high |
| Safety flags reviewed | Required |

**Algorithm (implement exactly):**
```ts
const blocking      = checks.filter(c => c.weight === "Required" && !c.met);
const highGaps      = checks.filter(c => c.weight === "High"     && !c.met);
const medGaps       = checks.filter(c => c.weight === "Medium"   && !c.met);
const aiUnconfirmed = !checks.find(c => c.key === "ai_confirmed")!.met; // Required-for-high

const readiness =
  blocking.length > 0                                          ? "insufficient"
  : (highGaps.length + medGaps.length) === 0 && !aiUnconfirmed  ? "ready"
  :                                                              "partial";

const confidence_ceiling =
  readiness === "insufficient"            ? "low"        // moot; cannot generate
  : readiness === "ready"                 ? "high"
  : (highGaps.length > 0 || aiUnconfirmed) ? "low"
  :                                          "moderate";  // only Medium gaps remain

const can_generate = readiness !== "insufficient";
```
**Output contract:**
```ts
{ readiness: "ready"|"partial"|"insufficient",
  confidence_ceiling: "high"|"moderate"|"low",
  blocking_gaps: string[], non_blocking_gaps: string[], can_generate: boolean }
```

## 5.2 Deterministic trigger map (must always fire — budget-exempt)
`lib/intake/deterministic-triggers.ts`:

| Step-1 signal | Unlocks (module key) |
|---|---|
| Digestive symptoms | `gut_deep_dive` |
| Hormonal symptoms | `hormone_deep_dive` |
| Autoimmune | `immune_deep_dive` |
| Meds/supplements listed | `medication_followups` |
| Sauna/cold/meditation = yes | `wellness_practice` |
| Prior/concerning labs | `previous_labs_followups` + upload prompt |

## 5.3 Friction budget logic (`lib/intake/friction-budget.ts`)
- Governs **augmented/nice-to-have only**. Deterministic must-fire modules are **exempt and always render**, even if total exceeds `max_augmented_modules`.
- When deterministic modules alone exceed budget: all deterministic still render; **all** augmented suppressed; nice-to-have questions trimmed to per-module cap; **must-have questions never dropped**.
- Defaults: `max_augmented_modules: 4`, `max_questions_per_module: 6`, `max_total_augmented_questions: 18`.
- **Invariant (must be a test):** the budget can never suppress a safety-critical (deterministic) branch.

## 5.4 Degraded-confidence constraints (ceiling `< high`) — enforced in prompt AND validated on output
- **DC-1:** No asserted specific dosages; categories + direction only ("low starting dose, to be confirmed"). Post-gen check rejects unhedged mg/IU/frequency.
- **DC-2:** Foundational-layer scope only; later phases explicitly withheld pending data.
- **DC-3:** Non-removable uncertainty banner on both outputs (clinician + patient language).
- **DC-4:** `areas_of_uncertainty` force-populated from `blocking_gaps + non_blocking_gaps`.
- **DC-5:** Ceiling + gap list persisted to `protocols.content.confidence` and audited.

## 5.5 API contracts

| ID | Endpoint | Method | Contract |
|---|---|---|---|
| API-1 | `/api/intake/[token]` | GET | Verify token (entropy/TTL/rate-limit/lockout), audit access, return intake state. **Only unauthenticated PHI surface.** |
| API-2 | `/api/intake/[token]/section` | POST | Zod-validated section autosave; provenance `patient`. |
| API-3 | `/api/intake/analyze` | POST | Server-side Claude; returns Zod-validated question plan; never trusts client; 1 bounded retry → degraded path. |
| API-4 | `/api/intake/[token]/submit` | POST | Finalize → status `labs_pending`; audit + timeline. |
| API-5 | `/api/patients/[id]/intake-docs` | POST/GET | Upload → `202 + job_id`; AV scan; type-route. GET lists docs. |
| API-6 | `/api/patients/[id]/prep-brief` | GET/POST | [STUB Phase 0] feeds readiness signals. |
| API-7 | `/api/patients/[id]/protocol-readiness` | GET | Returns §5.1 JSON. |
| API-8 | `/api/patients/[id]/generate-protocol` | POST | **Re-checks readiness server-side**; applies §5.4 if ceiling `< high`; uses shared `formatTimelineForPrompt`. |

**Global API rules:** every endpoint enforces `requireAuth` + `patientBelongsToTenant` (RLS as defense in depth, except API-1 which is token-gated); every mutation writes audit + timeline; structured logging with PHI redaction.

## 5.6 LLM call rules
- Structured output only; parse against Zod; on failure → 1 retry → degraded path. Never persist unvalidated output as truth.
- PHI-free system prompt; PHI only in user message; record `model_id` + prompt version.
- Prompt caching on the static system-prompt prefix.
- Red-flag symptoms (faintness, chest pain, severe weight loss) → screening questions + clinician-visible safety flag. Intake is decision-support, never diagnosis. No diagnosis shown to patient.

---

# 6. Micro-Task Implementation & Testing Plan (CRITICAL)

> Every task is atomic. **Do not advance past a `✅ BUILD & TEST` checkpoint until it is green.** Per A1, every `[STUB Phase 0]` item in §3 is created as a typed stub in Phase 0 — no decision required at execution time.

## Phase 0 — Foundation & guardrails
- **0.1** Initialize pnpm workspace (`pnpm@9.12.x`); pin every version from §1.2 in `package.json` + `pnpm-lock.yaml`. Set `"engines": { "node": "20.11.x", "pnpm": "9.12.x" }`. Install with `pnpm install --frozen-lockfile`.
- **0.2** Add `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Add ESLint with the **no-raw-color-literal** rule (regex `#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|-\[#`) and the **500-LOC** check script (`scripts/loc-check.mjs`; fails the build on any file > 500 LOC; honors `.loc-ignore`).
- **0.3** Create `.env.example` (§1.3) and load env validation (Zod) in `lib/env.ts` — throws synchronously at module import on any missing or invalid var.
- **0.4** Add `styles/tokens.css` with Ventive tokens (canvas `#FAFAF7`, surface `#FFFFFF`, ink `#1A1A1A`, accent `#0F4C47`, warn `#B45309`, radii `4/8/14`, focus ring `2px solid var(--color-accent)`). Wire Tailwind to the CSS variables via `tailwind.config.ts`.
- **0.5** **Stub the auth surface** (per A1 / A4). Create both files with the exact signatures below; the body returns a fixture session keyed off `SUPABASE_DEV_USER_ID` for local dev and throws in production until swapped:
  ```ts
  // lib/auth/require-auth.ts
  export type Session = { userId: string; tenantId: string; role: 'owner'|'practitioner'|'viewer'|'coach' };
  export async function requireAuth(): Promise<Session> { /* stub */ }

  // lib/auth/patient-belongs-to-tenant.ts
  export async function patientBelongsToTenant(patientId: string, tenantId: string): Promise<boolean> { /* stub */ }
  ```
- **0.6** **Stub the existing-codebase touchpoints** flagged `[STUB Phase 0]` in §3:
  - `app/(dashboard)/dashboard/patients/[id]/intake/page.tsx` — minimal server component returning a placeholder, so the route resolves.
  - `app/api/patients/[id]/prep-brief/route.ts` — `GET` returns `{ suggested_lab_panels: [], reasoning: "" }`; `POST` is a no-op `204`. Phase 6 reads the empty shape as "no prep-brief data."
  - `lib/audit/write-audit.ts` — accepts `{ tenantId, actorId, action, entity, entityId?, payload? }`, inserts into `audit_log`, and also writes a paired `patient_timeline` row when `entity === 'patient'`.

> **✅ BUILD & TEST 0:** Run `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck`. Then `pnpm run loc-check` — confirm the gate runs and passes on the fresh repo. Manually add a 501-line dummy file and confirm the gate **fails**, then delete it. Confirm `lib/env.ts` throws on a missing var. Hit `GET /` and `GET /api/patients/test/prep-brief` and confirm both 200. Unit test: `requireAuth()` returns the typed `Session` shape in dev mode.

## Phase 1 — Database & schema
- **1.1** Enable `pgvector`; write Drizzle schema for `intake_tokens` (§4.2).
- **1.2** Add Drizzle schema for `intake_documents`, `document_chunks`, `processing_jobs`, `audit_log` (§4.3–4.6) — reconcile if existing.
- **1.3** Add `patients.intake_status` column + document the `intake_data` JSONB keys (§4.1).
- **1.4** Generate migration with `drizzle-kit`; add RLS policies (tenant-scoped) for every new table.
- **1.5** Write the partial unique index enforcing one active token per patient.

> **✅ BUILD & TEST 1:** Run the migration against a local Postgres. In `psql`: insert a token, then attempt a second active token for the same patient → expect a **unique-violation error**. Insert + select a row in each new table. Confirm RLS blocks a cross-tenant select. Run `pnpm test lib/db` (write 1 smoke test that connects and lists tables).

## Phase 2 — Zod schemas & pure logic (no I/O — fastest to test)
- **2.1** `step-one.schema.ts` — About You, Why Here, Symptoms, Lifestyle.
- **2.2** `question-plan.schema.ts` — the exact `identified_issues[]` + `question_plan[]` + `friction_budget` contract from the source PRD.
- **2.3** `intake-data.schema.ts` — including `_provenance` and `_ai_confirmations`.
- **2.4** `deterministic-triggers.ts` — pure signal→module map (§5.2).
- **2.5** `friction-budget.ts` — pure budget enforcement (§5.3).
- **2.6** `readiness.ts` — pure deterministic gate (§5.1).
- **2.7** `merge-intake.ts` — shallow JSONB merge + provenance tagging.

> **✅ BUILD & TEST 2 (highest-value checkpoint — pure functions):** `pnpm test lib/` with these table-driven unit tests:
> - Readiness: a Required fail → `insufficient` + `can_generate:false`; only Medium gaps → `moderate`; High gap → `low`; all met → `ready`/`high`. (Mirror §5.1 exactly.)
> - Friction budget: **5 deterministic modules with budget 4 → all 5 render** (exemption holds) and all augmented suppressed. Must-have questions never dropped.
> - Triggers: each signal maps to its module; no signal → empty set.
> These three are the clinical-safety core — review by a human, not just CI.

## Phase 3 — Patient intake (Step 1) + tokens + autosave
- **3.1** `intake-token.ts` — mint (128-bit CSPRNG, store hash only), verify (TTL, revoked, rate-limit, lockout), revoke/reissue.
- **3.2** `POST /api/patients/[id]/intake-token` (C-1) — auth'd, audited.
- **3.3** `GET /api/intake/[token]` (API-1) — verify + audit + return state; per-token & per-IP rate limit.
- **3.4** `POST /api/intake/[token]/section` (API-2) — Zod-validated autosave, provenance `patient`.
- **3.5** Build Step-1 UI: `about-you`, `why-here`, `symptoms`, `lifestyle-snapshot`, orchestrated by `step-one-form.tsx`. One concept per screen, large tap targets, inline validation, progress, save & resume. Mobile-first, AA contrast, focus ring, reduced-motion.

> **✅ BUILD & TEST 3:** Unit: token verify rejects expired/revoked/wrong tokens (entropy + lockout). API (via `curl`/Thunder/Playwright request): mint a token, GET `/api/intake/[token]` returns 200 with no PHI in the URL; a bad token returns 401/404; exceed the rate limit → 429 + lockout. Browser at **320px width**: complete Step 1, refresh mid-form → state restored (save & resume). Confirm no horizontal scroll. Confirm an `audit_log` row per access/save.

## Phase 4 — LLM analyze + Step 2 renderer (+ degraded path)
- **4.1** Author the three prompt files in `services/analysis-engine/prompts/` (PHI-free).
- **4.2** `analyze-intake.ts` — Anthropic call, prompt caching, Zod parse, 1 bounded retry.
- **4.3** `question-banks.ts` — static fallback banks per deterministic module (for the degraded path).
- **4.4** `POST /api/intake/analyze` (API-3) — server-side; combine deterministic triggers + LLM augmentation; apply friction budget; never trust client. On double-failure → return deterministic plan + set `analysis_degraded`.
- **4.5** `step-two-renderer.tsx` + `analyze-client.ts` — render only triggered modules.
- **4.6** Build the 7 deep-dive module components (gut, hormone, immune, medication, sleep, stress, wellness) — each its own file, mixed controls + free text + optional uploads (skippable).
- **4.7** `POST /api/intake/[token]/submit` (API-4) — merge with provenance, status `labs_pending`, audit + timeline.

> **✅ BUILD & TEST 4:** Unit: mock Anthropic returning valid JSON → plan passes Zod; mock returning garbage twice → degraded path fires, `analysis_degraded=true`, all must-fire modules present. API: submit a Step-1 payload with digestive + hormonal signals → response contains `gut_deep_dive` and `hormone_deep_dive` even if budget is exceeded (DoD-2). Submit a no-signal payload → minimal/empty Step 2 (DoD-3). Browser: a triggered patient sees only their modules; uploads are skippable; submit → DB shows merged answers with `source` tags.

## Phase 5 — Transcription pipeline
- **5.1** `detect-type.ts` — magic-byte detection (not extension).
- **5.2** `route-engine.ts` — engine policy; **block 3rd-party PHI unless `baa_verified`**.
- **5.3** `POST /api/patients/[id]/intake-docs` (API-5) — validate, AV scan, S3 put, enqueue job → `202 + job_id`.
- **5.4** Whisper Python microservice (`services/whisper/server.py`) + processors: `video` (ffmpeg→audio), `audio`, `pdf` (PyMuPDF→Textract fallback at <30% yield), `docx` (mammoth), `image` (Tesseract→Textract).
- **5.5** `normalize.ts` → `{text, segments[], speakers[], confidence}`; chunk ~300 tok; embed; pgvector HNSW; persist; flag low-confidence spans.
- **5.6** Worker `processing_status` state machine — idempotent, retry-safe; failures → `review`.
- **5.7** `TR-8` verification logic: `is_verified=true` only when zero outstanding flagged spans (or explicit per-span dismissal).

> **✅ BUILD & TEST 5:** Unit: `detect-type` correctly classifies sample bytes for each type; `route-engine` refuses AssemblyAI/Textract when `baa_verified=false`. Integration: upload a short sample audio → `202 + job_id`; poll job → `done`; `intake_documents.extracted_text` populated, `document_chunks` created with embeddings. Kill the worker mid-job and restart → job completes once (idempotency). Upload audio with a fake low-confidence span → `is_verified` stays false until dismissed/corrected.

## Phase 6 — Readiness gate wiring + protocol generation guard
- **6.1** `GET /api/patients/[id]/protocol-readiness` (API-7) — assemble checklist from intake + docs + AI confirmations; call pure `readiness()`.
- **6.2** `format-timeline-for-prompt.ts` — include transcripts/notes; **exclude unconfirmed `source: ai` fields** from trusted-facts.
- **6.3** `POST /api/patients/[id]/generate-protocol` (API-8) — **re-check readiness server-side** (GATE-1); refuse high-confidence when ceiling `< high`; tell prompt its ceiling (GATE-2).
- **6.4** Degraded-confidence enforcement: prompt constraints + **post-generation output validation** (DC-1 dosage check, DC-2 scope, DC-3 banner, DC-4 `areas_of_uncertainty`, DC-5 persist+audit).
- **6.5** Audit every gate evaluation (`protocol_readiness_evaluated` + gap list) (GATE-3).

> **✅ BUILD & TEST 6 (human-gated — clinical safety):** Unit: `formatTimelineForPrompt` omits an unconfirmed AI field and includes it once confirmed (DoD-10). API: with a Required check failing, `generate-protocol` returns blocked/`can_generate:false` even if the client tries to force it (server-enforced, DoD-5). With only Medium gaps → ceiling `moderate`, generation allowed but output validation rejects an unhedged dosage and requires the banner (DoD-9). Confirm an audit row per evaluation. **Have a clinician review the gate outcomes manually.**

## Phase 7 — Clinician review UI + provenance
- **7.1** `intake-review.tsx` orchestrator + `provenance-badge.tsx` (patient/clinician/ai).
- **7.2** `ai-field-confirm.tsx` — confirm/edit AI fields; writes `_ai_confirmations`.
- **7.3** `readiness-widget.tsx` — shows readiness + gap list, each gap deep-links to the resolving section.

> **✅ BUILD & TEST 7:** Browser: clinician opens review, sees provenance badges; confirming an AI field updates readiness live (it flips out of "Required-for-high" unmet); the readiness widget lists gaps with working links; every confirm/edit is audited (DoD-6).

## Phase 8 — Hardening & Definition-of-Done sweep
- **8.1** PHI-free notification boundary test — assert the notification payload **type** cannot hold PHI (DoD-7).
- **8.2** CI LOC gate green across the whole tree (DoD-8); no raw color literals.
- **8.3** Token brute-force E2E (Playwright): hammer `/api/intake/[token]` → lockout fires (DoD-11).
- **8.4** Full E2E happy path + degraded path on a 320px viewport.
- **8.5** Think-aloud mobile pass; fix friction.

> **✅ BUILD & TEST 8 (final):** `pnpm test && pnpm test:e2e && pnpm run loc-check && pnpm lint && pnpm typecheck` all green. Walk DoD-1 through DoD-11 as a manual checklist; each must have an automated assertion behind it.

---

## Appendix — DoD → Test mapping (the agent's pass/fail contract)

| DoD | Verified by |
|---|---|
| DoD-1 Step-1 ≤~5min, autosave/resume @320px | Phase 3 browser test |
| DoD-2 Deterministic triggers fire over budget | Phase 4 API test |
| DoD-3 No-signal → empty Step 2 | Phase 4 API test |
| DoD-4 Audio auto-transcribed → reaches prompt | Phase 5 + 6 integration |
| DoD-5 Gate blocks/caps, server-enforced, audited | Phase 6 API test |
| DoD-6 Clinician review + provenance + confirm | Phase 7 browser test |
| DoD-7 No PHI in notifications | Phase 8 type test |
| DoD-8 ≤500 LOC, tokens-only | CI gate |
| DoD-9 Degraded-confidence content rules | Phase 6 output-validation test |
| DoD-10 Unconfirmed AI excluded | Phase 6 unit test |
| DoD-11 Degraded fallback + token brute-force | Phase 4 + Phase 8 E2E |

---

# Appendix B — Identifier Glossary

Every prefix used in this document is defined below. No identifier in this document is "external."

## B.1 Patient & clinician stories (P-_, C-_)

Defined in §2.5 (User Stories — Acceptance Summary). `P-1..P-8` are patient-facing stories with acceptance criteria; `C-1..C-4` are clinician-facing stories.

## B.2 System requirements (S-_)

Defined in §2.5 (Clinician-Facing & System-Facing). `S-3` route by magic bytes; `S-5` compute readiness and gate generation; `S-6` persist provenance per datum; `S-7` audit per write, never leak PHI.

## B.3 LLM call rules (LLM-_)

Defined in §5.6 (LLM call rules) — structured output, Zod parse, retry-then-degraded, PHI-free system prompt, prompt caching, red-flag handling.

## B.4 Transcription requirements (TR-_)

| ID | Definition |
|---|---|
| TR-1 | Magic-byte type detection (not file extension). |
| TR-2 | Engine policy refuses third-party processors (AssemblyAI / Textract) when `processing_jobs.baa_verified = false`. |
| TR-3 | Upload returns `202 + job_id`; processing is async via BullMQ. |
| TR-4 | Worker pipeline is idempotent — killing mid-job and restarting completes exactly once. |
| TR-5 | Normalize output: `{ text, segments[], speakers[], confidence }`. |
| TR-6 | Chunk to ~300 tokens, embed via `vector(1536)`, pgvector HNSW index. |
| TR-7 | Flag spans below confidence threshold; expose them in the review UI. |
| TR-8 | `intake_documents.is_verified = true` iff zero outstanding flagged spans (or explicit per-span dismissal). |
| TR-9 | OCR fallback (Tesseract → Textract) triggers only when local yield < 30% AND `baa_verified = true`. |

## B.5 Readiness Gate enforcement (GATE-_)

| ID | Definition |
|---|---|
| GATE-1 | `POST /api/patients/[id]/generate-protocol` re-runs `readiness()` server-side and refuses to call the LLM if `can_generate === false`, regardless of any client-side state. |
| GATE-2 | When `confidence_ceiling < high`, the analysis system prompt is told its ceiling, and the generated output is then revalidated against the DC-1..DC-5 constraints (§5.4); any violation rejects the output and writes an audit row. |
| GATE-3 | Every gate evaluation writes an `audit_log` row with `action='protocol_readiness_evaluated'`, the result, and the gap list. |

## B.6 Degraded-confidence constraints (DC-_)

Defined in §5.4.

## B.7 API contracts (API-_)

Defined in §5.5.

## B.8 Global constraints (C-_)

Defined in §1.4 — `C-LOC`, `C-SLICE`, `C-TOKENS`, `C-PHI`, `C-AUDIT`.

## B.9 Security IDs (SEC-_)

Inherited from the companion engineering PRD. `SEC-18` (intake token reduced-assurance surface) is the only SEC-* ID referenced directly in this document.

## B.10 Definition of Done (DoD-_)

Defined in the Appendix table above (DoD → Test mapping).
