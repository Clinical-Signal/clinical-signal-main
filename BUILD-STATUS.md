# Clinical Signal — Build Status

_What has been built so far. Generated 2026-06-08._

Clinical Signal is a HIPAA-oriented web platform that lets functional-health practitioners
onboard patients, run a dynamic AI intake, upload and extract labs, and generate a dual-output
clinical protocol (practitioner document + phased client action plan). This document inventories
everything currently implemented in the repository.

---

## 1. Repository Shape

Monorepo managed with **pnpm workspaces** (Node 20.11.x, pnpm 9.12.x).

| Path | What it is |
|------|------------|
| `apps/web` | Next.js 14 App Router frontend + BFF API routes (TypeScript) |
| `services/analysis-engine` | Python FastAPI analysis engine (LLM, PDF, knowledge graph, export) |
| `packages/core` | Shared TS lib: tenancy context, JWT, audit events, errors |
| `packages/db` | DB client + `withTenantContext` / `withSystem` RLS helpers |
| `packages/shared` | Shared utilities |
| `database/migrations` | Canonical SQL migrations (0001–0025) |
| `apps/web/drizzle/migrations` | Drizzle migration mirror |
| `infrastructure/aws` | AWS migration design docs + ADRs (not yet provisioned) |
| `infrastructure/docker` | `Dockerfile.web`, `Dockerfile.engine` |
| `workers/` | Placeholder (only `.gitkeep`) |
| Root | Extensive planning/PRD docs, `docker-compose.yml`, CI config |

### Tech stack in use
- **Frontend/BFF:** Next.js 14, React 18, TypeScript 5.4, Tailwind, Drizzle ORM, `pg`
- **Auth:** custom bcrypt + database sessions (not NextAuth), password reset tokens
- **AI SDKs:** `@anthropic-ai/sdk`, Vercel `ai` SDK, `@ai-sdk/amazon-bedrock`, `@ai-sdk/openai`, `openai`
- **Engine:** Python FastAPI, Anthropic API, pgvector embeddings, PDF extraction, PDF export
- **DB:** PostgreSQL with Row-Level Security + pgvector
- **Email:** nodemailer SMTP
- **Validation:** Zod v4
- **Testing:** Vitest (unit), Playwright (e2e), pytest (engine)
- **CI:** `.github/workflows/validate.yml` (PR-time validation), LOC guardrails, `.cursorrules`

---

## 2. Database Schema (migrations 0001–0025)

All PHI tables are tenant-scoped with RLS. Migration runner is deterministic with a
`schema_migrations` bookkeeping table (0024).

**Auth & tenancy**
- `tenants` — one per practitioner practice; promoted to "first-class practice" in 0022
- `practitioners`, `sessions`, `password_reset_tokens`
- `audit_log` — who/what/when access logging

**Patient data**
- `patients`, `records`, `record_embeddings` (pgvector)
- `analyses`, `analysis_embeddings`
- `patient_embeddings`
- `intake_documents`, `document_chunks`
- `patient_timeline` (typed events: records, protocols, documents)

**Protocols**
- `protocols`, `protocol_outputs` (multi-output: clinical doc, client doc, call deck, email draft)
- `protocol_edits` (practitioner edit tracking)
- `clinical_dialogues` (practitioner Q&A feeding learning)

**Practitioner personalization**
- `practitioner_preferences`, `suggested_preferences`, `practitioner_knowledge`

**Foundational period**
- `foundational_plans` (assignable checklists during lab wait)

**Knowledge graph / RAG**
- `clinical_knowledge`, `clinical_concepts`, `clinical_relationships`
- `knowledge_leaders`, `knowledge_sources`, `knowledge_domains`
- `knowledge_conflicts`, `knowledge_review_queue`
- Confidence + faithfulness scoring (0018), v2 lens categories (0021)

**Hardening milestones**
- 0012/0015 RLS GUC name fixes
- 0023 knowledge dedup tightening
- 0025 RLS `WITH CHECK` hardening across cross-tenant-write loopholes

---

## 3. Frontend (apps/web)

### Authentication (`app/(auth)`)
- **Login**, **Signup** (provisions a fresh tenant per practitioner), **Reset password** — all with server actions
- Session timeouts and password policy via custom auth lib

### Practitioner dashboard (`app/(dashboard)/dashboard`)
- **Patient list** dashboard with status indicators (`page.tsx`)
- **New patient** creation form
- **Settings** — practitioner preferences + AI-suggested preferences
- **Audit log viewer** — compliance reporting UI

### Per-patient workspace (`dashboard/patients/[id]`)
- **Patient detail** page
- **Intake hub** — overview of intake status
- **Intake** (practitioner-side view) with sectioned forms: about-you, MSQ symptoms, hormones, metabolism/skin/sleep/stress deep-dives, wearables, etc., plus **intake review**
- **Records** — lab PDF upload, file validation, records list, per-record review table with extracted-value correction
- **Foundations** — assignable foundational checklist editor (lab waiting period)
- **Protocol** — generate button, protocol list, per-protocol view:
  - **Edit** (side-by-side editing)
  - **Approve** workflow
  - **Outputs**: client doc view, call-deck view, email-draft view
  - **Export** to PDF

### Patient-facing dynamic intake (`app/intake/[token]`)
Token-based, no patient login. Two-step flow:
- **Step One** — structured static intake (demographics, emergency contact, health history, medications, lifestyle: sleep/nutrition/exercise/stress, hormones, menstrual, thyroid, MSQ symptoms, previous labs, wearables) with drafts, validators, screen renderer
- **Step Two** — **AI-driven dynamic question chat**: adaptive question controls (chips, sliders, numeric, yes/no, Bristol scale, free-text), speech input, autosave, branch panels, processing/transition states
- **Complete** + expired-link handling

### Clinician intake review (`app/clinician/intake/[token]`)
- Clinical synthesis view (2-step: summary + insights), suggested next steps, copy-to-EMR export

### API routes (`app/api`)
- `intake/[token]/*` — get, section save, submit, analyze, chat (+ branch, edit)
- `clinician/intake/[token]/synthesize`, `clinician/patients/[id]/send-intake`
- `patients/[id]/*` — analyze, generate-protocol, generate-from-analysis, records, intake-docs, intake-token, prep-brief, foundations, protocols
- `patients/[id]/protocol/[protocolId]/*` — approve, dialogue, export, outputs
- `audit-logs`, `suggestions`, `diagnostic` (integration health check)

### Shared lib (`apps/web/lib`)
- `auth/` (require-auth, patient-belongs-to-tenant), `audit/`, `db/schema/` (Drizzle schemas)
- `intake/` — large module: question banks, merge logic, deterministic triggers, friction budget,
  chat budget, EMR export formatting, email dispatch, synthesis persistence, Zod schemas
- `email/smtp-transport`, `env` (validated), `analysis`, `clinical-dialogue`, `diagnostic`

---

## 4. Analysis Engine (services/analysis-engine)

FastAPI app (`app/main.py`) with HS256 JWT trust boundary to the web app (PR5) and
Python parity tenant context (`app/_core`: auth, db, tenancy, errors).

**Endpoints**
- `GET /health`
- `POST /extract` (202) — async lab PDF extraction pipeline
- `POST /analyze` — clinical analysis over patient data + KB context
- `POST /generate-protocol` — dual-output protocol generation
- `POST /knowledge/search` — semantic KB search
- `POST /knowledge/graph` — knowledge graph query
- `POST /export-protocol` — PDF export

**Modules**
- `analyzer/` (gather, llm, db), `pipeline/` (pdf, llm, db) for extraction
- `knowledge/` (db, embeddings), `exporter/` (pdf, db)

**Versioned prompts** (`prompts/`) — clinical_analysis, protocol_generation, lab_extraction,
domain_classification, faithfulness_check, graph_extraction, knowledge_extraction,
pdf_categorization, and a full set of intake prompts (dynamic_questions, clinical_synthesis,
chat_branch, chat_edit_gatekeeper, step_two_chat, freetext_interpretation, issue_identification).

**Scripts** — knowledge ingestion (`ingest_knowledge`, `ingest_pdf`, `load_knowledge`),
graph build, domain autotagging, confidence/faithfulness recompute, Slack/Drive ingestion,
review enqueue, auth/tenant verification.

**Tests** — `tests/test_auth.py` (JWT trust boundary) + conftest.

---

## 5. Cross-Cutting Concerns Implemented

- **Multi-tenancy & RLS** — `withTenantContext` / `withSystem` in TS; Python `_core` parity;
  GUC-based tenant context; `WITH CHECK` hardening on writes
- **Engine auth** — HS256 JWT signed by web, verified by engine
- **Audit logging** — typed audit events, DB-backed, viewer UI
- **PHI guardrails** — `.cursorrules` + `.cursor/rules` enforce PHI/audit/token/slice/LOC conventions
- **Knowledge orchestrator** — leaders → sources → domains pipeline with dedup, confidence,
  faithfulness scoring, conflict tracking, and a human review queue
- **Email** — SMTP transport, intake-link emails
- **Diagnostics** — integration health-check route

---

## 6. Mapping to the MVP Build Order (CLAUDE.md)

| Sprint / Step | Status |
|---------------|--------|
| 1. Project bootstrap (Next.js + FastAPI + Postgres + Docker) | ✅ Done |
| 2. Authentication (sessions, timeouts, password policy) | ✅ Done (custom, not NextAuth) |
| 3. DB schema + RLS + migrations + seed | ✅ Done (0001–0025, synthetic seed 0003/0017) |
| 4. Dashboard (patient list + status) | ✅ Done |
| 5. New patient creation | ✅ Done |
| 6. Intake form | ✅ Done — **expanded** into dynamic two-step AI intake |
| 7. Intake review | ✅ Done (+ clinician synthesis view) |
| 8. Lab PDF upload | ✅ Done |
| 9. Lab extraction (Python + Claude) | ✅ Done |
| 10. Lab review/correction | ✅ Done |
| 11. Lab suggestion | ⚠️ Partial — `suggestions` route + analysis exist; verify coverage |
| 12. Protocol generation (Output A + B) | ✅ Done — extended to 4 outputs (clinical, client, call deck, email) |
| 13. Protocol editor (side-by-side) | ✅ Done |
| 14. Protocol export (PDF) | ✅ Done |
| 15. Foundational checklist | ✅ Done |
| 16. Audit log viewer | ✅ Done |
| 17. E2E testing & UI polish | ⚠️ In progress (Playwright present; polish notes open) |

### Beyond the original MVP
- Dynamic AI intake (Step Two chat) with adaptive controls + speech
- Full **knowledge graph / RAG orchestrator** with leaders, sources, domains, faithfulness/confidence
- Practitioner personalization (preferences, learned knowledge, clinical dialogues)
- Patient timeline
- Practice-as-first-class-entity schema
- AWS migration design (docs/ADRs) — Railway/Aptible retired

---

## 7. Not Yet Built / Open

- `workers/` is an empty placeholder
- AWS infrastructure is **designed but not provisioned** (docs only)
- Lab suggestion feature appears partial — confirm against Sprint step 11
- E2E test coverage and final UI polish still in progress
- Explicitly out of MVP scope (per CLAUDE.md): patient portal/login, wearable integrations,
  FullScript/Rupa, real-time messaging, multi-practitioner teams, payments, scheduling/billing

---

_Source of truth: this document is a snapshot derived from the repo tree, migrations 0001–0025,
the engine FastAPI app, and the App Router structure. For technical detail see `ARCHITECTURE.md`;
for plan/roadmap see `MVP-EXECUTION-PLAN.md` and `ROADMAP-ISSUES.md`._
