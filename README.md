# Clinical Signal

Enterprise-grade clinical intake and AI-assisted documentation for functional health practices. Patients complete a structured, token-gated intake; the platform routes them through deterministic and LLM-augmented deep dives, then gives clinicians a review surface with persisted clinical synthesis and EMR-ready export.

For product context see `CLAUDE.md`. For infrastructure migration status see the deployment note below and `infrastructure/aws/README.md`.

> **Deployment status (2026):** Hosted Aptible/Railway environments are retired. AWS bring-up is in progress. **Local development via Docker Compose is the supported path** until production is wired.

---

## Overview

Clinical Signal implements an **agentic intake pipeline** with explicit safety boundaries: every model output is validated, capped, and auditable before it reaches a patient or clinician UI.

| Phase | Capability | Primary surfaces |
|-------|------------|------------------|
| **1–3** | Token-gated patient intake, Step 1 (legacy-aligned sections), autosave, audit | `/intake/[token]`, `POST /api/intake/[token]/section` |
| **4** | Dynamic Step 2 question plan (deterministic triggers + Anthropic) | `POST /api/intake/[token]/analyze`, Step 2 UI |
| **5–6** | Clinician read-only review + clinical synthesis (CC/HPI/ROS) | `/clinician/intake/[token]`, `POST /api/clinician/intake/[token]/synthesize` |
| **7** | Persisted synthesis + EMR plain-text export | `step_two._synthesis_resolved`, Copy to EMR |
| **8** | Demo seed patients for sales/engineering | `pnpm run seed:demo` (in `apps/web`) |

### End-to-end workflow

```mermaid
sequenceDiagram
  participant P as Patient (token link)
  participant API as Intake API
  participant LLM as Anthropic
  participant DB as PostgreSQL (RLS)
  participant C as Clinician

  P->>API: Step 1 sections (autosave)
  P->>API: POST /api/intake/[token]/analyze
  API->>DB: Load intake_data
  API->>API: Deterministic triggers (Step 1 rules)
  API->>LLM: analyzeIntake (optional)
  LLM-->>API: QuestionPlanLLMOutput (Zod-validated)
  API->>API: buildResolvedQuestionPlan + friction budget
  API->>DB: Persist step_two._question_plan_resolved
  P->>API: Step 2 answers (per control)
  C->>API: Clinician review (auth + token)
  C->>API: POST .../synthesize
  API->>LLM: synthesizeNote
  API->>DB: Persist step_two._synthesis_resolved
  C->>C: Copy to EMR (formatForEMR)
```

1. **Step 1** — Patient completes baseline intake (demographics, MSQ, lifestyle, hormones, etc.) via magic link. Data lands in `patients.intake_data` JSONB with provenance metadata.
2. **Analyze** — After Step 1, the patient (or orchestration) calls the analyze endpoint. The server derives **deterministic module keys** from Step 1 (e.g. digestive MSQ → `gut_deep_dive`), optionally calls **Anthropic** for augmented modules, merges results, applies the **friction budget**, and stores a resolved plan at `intake_data.step_two._question_plan_resolved`.
3. **Step 2** — The patient answers only the questions in the resolved plan (typed controls: yes/no, chips, slider, free text, numeric, Bristol).
4. **Clinician review** — Authenticated practitioners open `/clinician/intake/[token]` to read Step 1 + Step 2, generate a **clinical synthesis** draft, and copy a flattened note into an external EMR.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Web application | **Next.js 14** (App Router), React 18, **Tailwind CSS** (design tokens in `apps/web/styles/tokens.css`) |
| Data access | **Drizzle ORM** + raw SQL where RLS/GUC semantics require it (`@cs/db`) |
| Database | **PostgreSQL** with tenant **Row-Level Security**, `pgcrypto` for PHI columns |
| Validation | **Zod** (Step 1, question plan, clinical synthesis, persisted synthesis) |
| LLM | **Anthropic Messages API** (`@anthropic-ai/sdk`); PHI-free system prompts under `services/analysis-engine/prompts/` |
| Monorepo | **pnpm** workspaces (`apps/web`, `packages/*`, `services/analysis-engine`) |
| Unit tests | **Vitest** (`apps/web`) |
| E2E | **Playwright** (`apps/web`, `pnpm run test:e2e`) |

---

## AI safety and fallback mechanisms

The intake LLM path is designed to **fail closed into deterministic behavior**—never into unvalidated JSON or unbounded question lists.

### Zod sandbox (parse retry)

Both `analyzeIntake` and `synthesizeNote` treat the model as an untrusted serializer:

- Raw assistant text is stripped of markdown fences, `JSON.parse`d, then validated with a strict Zod schema (`QuestionPlanLLMOutput`, `ClinicalSynthesisOutput`).
- **`MAX_PARSE_ATTEMPTS = 2`** in `apps/web/lib/llm/analyze-intake.ts` and `synthesize-note.ts`: one initial call plus **one retry** on parse/validation failure.
- Anthropic transport errors short-circuit to `null` (analyze) or `null` (synthesize) with structured server logging—no PHI in log payloads.

If all attempts fail, `analyzeIntake` returns `null` and the pipeline sets `analysis_degraded: true`.

### Friction budget (patient burden cap)

After modules are assembled, `applyFrictionBudget` (`apps/web/lib/intake/friction-budget.ts`) enforces:

| Limit | Default (`FRICTION_BUDGET_DEFAULTS`) |
|-------|--------------------------------------|
| Max LLM-augmented modules | 4 |
| Max questions per module | 6 |
| Max total augmented questions | **18** |

Trimming prefers `must_have` questions over `nice_to_have`. Suppressed modules and trim counts are recorded in `friction_budget_report` on the resolved plan. Hard schema ceilings (e.g. 20 questions/module) are defined separately in `SCHEMA_LIMITS`.

### Offline fallback banks (graceful degradation)

`apps/web/lib/intake/question-banks.ts` defines **canonical question libraries** per module key, aligned with the legacy dashboard deep dives. When `analysis_degraded` is true or the LLM omits a deterministic module:

- `buildResolvedQuestionPlan` (`apps/web/lib/intake/build-question-plan.ts`) loads questions via `getFallbackQuestions(moduleKey)`.
- Degraded plans use `model_id: "static-fallback"` in the resolved envelope.
- The system prompt `services/analysis-engine/prompts/intake_dynamic_questions_v1.md` includes an **Approved Question Library** so live LLM runs select only pre-approved `id` / `prompt` / `control` tuples.

Deterministic triggers (`apps/web/lib/intake/deterministic-triggers.ts`) are pure functions over Step 1—no model required for gut/hormone/immune/medication/wellness/labs routing.

### Additional guardrails

- **C-PHI:** System prompts are PHI-free; patient JSON is user message content only. Audit payloads exclude field-level PHI.
- **C-AUDIT:** Analyze, synthesize, token access, and section saves write `audit_log` rows via `writeAudit`.
- **Token security:** Intake links use 128-bit tokens, SHA-256 at rest, TTL, rate limits, lockout (`intake_tokens`, `intake_token_rate_limits`).
- **C-LOC / C-SLICE / C-TOKENS:** Enforced via `pnpm run loc-check`, slice architecture, and ESLint design-token rules.

---

## Request lifecycle: `analyzeIntake`

Entry point for patients: **`POST /api/intake/[token]/analyze`** (`apps/web/app/api/intake/[token]/analyze/route.ts`).

1. **Verify token** — `getIntakeTokenService().verify` (tenant + patient binding, rate limit).
2. **`runIntakeAnalyzePipeline`** (`apps/web/lib/intake/run-intake-analyze-pipeline.ts`):
   - Load `intake_data` under tenant RLS.
   - Parse Step 1 with `StepOneSchema`; compute `getDeterministicTriggers(toStepOneTriggerInput(stepOne))`.
   - Call **`analyzeIntake(intakeData)`** (`apps/web/lib/llm/analyze-intake.ts`):
     - Load PHI-free system prompt from `intake_dynamic_questions_v1.md`.
     - Send Step 1 (+ existing step_two shell) as JSON user content.
     - Validate response as `QuestionPlanLLMOutput` (up to 2 attempts).
   - **`buildResolvedQuestionPlan`** — Merge deterministic modules (LLM or fallback banks), append non-deterministic LLM modules when not degraded, run friction budget, produce `QuestionPlanResolved`.
   - **Persist** — `mergeIntakeData` writes `step_two._question_plan_resolved` and `_analysis_degraded`; `savePatientIntakeData`.
   - **Audit** — `intake_analysis_completed` or `intake_analysis_degraded` with PHI-free payload (module counts, flags).
3. **Response** — JSON body is the resolved question plan for the Step 2 UI.

Clinician synthesis follows a parallel pattern: **`synthesizeNote`** → validate `ClinicalSynthesisOutput` → persist `step_two._synthesis_resolved` → audit `intake_synthesis_generated`. Export uses **`formatForEMR`** (`apps/web/lib/intake/format-emr-export.ts`) for clipboard-ready plain text.

---

## Repository structure

```
clinical-signal/
├── apps/web/                          # Next.js application (intake + dashboard + clinician)
│   ├── app/
│   │   ├── intake/[token]/            # Patient Step 1 & Step 2
│   │   ├── clinician/intake/[token]/  # Review + synthesis + EMR copy
│   │   └── api/
│   │       ├── intake/[token]/        # API-1 load, section save, analyze
│   │       └── clinician/intake/      # Synthesis API
│   ├── lib/
│   │   ├── intake/                    # Triggers, merge, friction budget, question banks
│   │   ├── llm/                       # analyze-intake, synthesize-note, schemas
│   │   ├── tokens/                    # Intake token service + Drizzle store
│   │   └── db/schema/                 # Drizzle table definitions (intake)
│   ├── drizzle/migrations/            # Intake SQL (schema, RLS, tokens, synthesis docs)
│   └── scripts/
│       ├── seed-demo-patients.ts      # Demo patients + tokens
│       └── intake-drizzle-migrate.mjs
├── packages/
│   ├── core/                          # Tenancy, JWT types
│   └── db/                            # Pool, withTenantContext, withSystem, phiKey
├── services/analysis-engine/          # FastAPI + versioned PHI-free prompts
├── database/migrations/               # Core platform SQL (auth, patients, protocols)
├── docker-compose.yml                 # Local postgres + migrate + web + engine
└── scripts/loc-check.mjs              # 500 LOC gate (CI)
```

---

## Local setup

### Prerequisites

- **Node.js** `>=20.11.0 <21.0.0` and **pnpm** `9.12.x` (see root `package.json` `engines`)
- **Docker Desktop** (recommended) for PostgreSQL and one-command bring-up

### Environment variables

1. Root Compose / platform:

   ```bash
   cp .env.example .env
   ```

   Set at minimum: `ANTHROPIC_API_KEY` (dev/synthetic only), `PHI_ENCRYPTION_KEY` (must match dev seed: `dev_only_change_me_phi_crypt_key`), `AUTH_SECRET`, `ENGINE_JWT_SECRET`.

2. Web / intake module:

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   `apps/web/lib/env.ts` requires: `DATABASE_URL`, `REDIS_URL`, `S3_*`, `AWS_*`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `WHISPER_SERVICE_URL`, and intake token settings. Use the example placeholders for local work.

### Database

**Option A — Docker Compose (full stack)**

```bash
docker compose up --build
```

Boot order: `postgres` → `migrate` (applies `database/migrations/`) → `web` + `analysis-engine`. Web: http://localhost:3000

**Option B — Host-run migrations**

```bash
cd apps/web
DATABASE_URL=postgresql://clinical_signal:change_me_dev_only@localhost:5432/clinical_signal \
  pnpm run db:migrate
```

**Intake module schema** (tables, RLS for intake tokens):

```bash
cd apps/web
pnpm run db:intake-migrate
```

This applies `drizzle/migrations/0001_intake_schema.sql` and `0002_rls.sql`. If you need token verify helpers or synthesis column documentation, apply remaining files manually:

```bash
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0003_intake_token_rate_limits_and_verify.sql
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0004_intake_synthesis_resolved.sql
```

Apply dev practitioner + sample patients (legacy dashboard seed):

```bash
psql "$DATABASE_URL" -f database/migrations/0003_seed_dev.sql
```

Login: `dev@example.com` / `devpassword12!`

### Run the web app

```bash
cd apps/web
pnpm install
pnpm run dev
```

### Demo intake patients (Phase 8)

Seeds three fictional patients (gut, hormone, metabolic) with completed Step 1 and active intake tokens:

```bash
cd apps/web
pnpm run seed:demo
```

Requires `DATABASE_URL` and `PHI_ENCRYPTION_KEY` in `apps/web/.env`. Prints clinician URLs:

`http://localhost:3000/clinician/intake/<token>`

Optional: `DEMO_APP_BASE_URL` overrides the printed host.

### Other `apps/web` scripts (reference)

| Script | Command |
|--------|---------|
| Production build | `pnpm run build` |
| Drizzle Kit generate | `pnpm run db:generate` |
| Drizzle Studio | `pnpm run db:studio` |
| System-access CI gate | `pnpm run check:system-access` |

Root workspace:

| Script | Command |
|--------|---------|
| ESLint | `pnpm run lint` |
| Typecheck (web) | `pnpm run typecheck` |
| Intake TS project | `pnpm run typecheck:intake` |
| LOC gate | `pnpm run loc-check` |

---

## Testing

From the **repository root** (pnpm workspace):

```bash
pnpm install
pnpm run typecheck
pnpm run test
```

`pnpm run test` runs `pnpm --filter @clinical-signal/web test:unit` → **`vitest run`** with includes:

- `lib/__tests__/**/*.test.ts`
- `lib/**/*.test.ts` (intake, LLM, tokens, friction budget, EMR format, etc.)

From **`apps/web`** directly:

```bash
cd apps/web
pnpm run test:unit
pnpm run typecheck
pnpm run test:e2e          # Playwright
```

Phase 1 intake verification (root):

```bash
pnpm run verify:phase1     # typecheck:intake + loc-check
```

Engine compile check (optional):

```bash
cd services/analysis-engine
pip install -r requirements.txt
python -m compileall -q app scripts
```

---

## Security and compliance

- **Synthetic data only** in local/staging; do not load real PHI outside production controls.
- **BAA** required for production Anthropic (and other PHI-adjacent vendors).
- **RLS** enforced via `withTenantContext` — use `@cs/db`, not ad-hoc `pg` in application code (see `pnpm run check:system-access`).
- Immutable SQL migrations: never edit applied files; add a new versioned migration instead.

See `CLAUDE.md`, `.cursor/rules/04-c-phi.mdc`, and `.cursor/rules/05-c-audit.mdc` for full policies.

---

## Related documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Product workflow and MVP scope |
| `ARCHITECTURE.md` | Platform architecture |
| `docs/architecture/question-plan-schema-design.md` | Question plan contract |
| `docs/architecture/ADR-001-readiness-gate.md` | Protocol readiness (GATE-3) |
| `services/analysis-engine/prompts/` | Versioned PHI-free LLM prompts |

---

## Continuous integration

`.github/workflows/validate.yml` runs web typecheck, Vitest unit tests, engine `compileall`, and migration filename hygiene. Merges to `main` validate only; deploy workflows are pending AWS bring-up.
