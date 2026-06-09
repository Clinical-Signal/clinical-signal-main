# Clinical Signal — Cursor-Ready Engineering PRD

> **Source:** Derived from `clinical_signal_general_prd_ventive.docx` (v1.2) + companion intake LLM PRD references.
> **Purpose:** A zero-ambiguity build spec for autonomous AI coding agents (Cursor Composer/Agents), built **iteratively with a Build & Test checkpoint after every few atomic steps.**
> **Authority:** Section 0 Binding Constraints from the source PRD are non-negotiable and override anything below if conflict arises. Requirement IDs (FR-_, NFR-_, SEC-_, MOD-_) map back to the source.

## ⚠️ Assumptions flagged for human review

These were not in the source PRD or live in the companion intake PRD. They are implemented as defaults; **override before relying on them in production.**

| # | Assumption | Where used |
|---|---|---|
| A1 | Full Postgres column-level schema, types, and enums (source named entities only). | §4 |
| A3 | Python 3.12 / FastAPI 0.115.x; OCR = Tesseract (`pytesseract`); AV = ClamAV (`clamd`); TOTP = `otplib`; PDF = Playwright headless Chromium. | §1 |
| A4 | Claude model id is **env-configured** (`ANTHROPIC_MODEL`), never a source literal; stored per-call in `analyses.model_id`. | §1, §5 |
| A5 | Server Actions are the primary mutation API; the Python service is internal-only (VPC) and not publicly routable. | §1, §5 |
| A6 | **[HUMAN/INFRA] controls** (BAA signing, KMS custody, AV daemon, RLS-on-live-DB, IR drills) cannot be "completed" by an agent — agent scaffolds, human operates. | §6 |

---

# 1. Project Overview & Tech Stack

## 1.1 What is being built
A HIPAA-compliant, multi-tenant web platform that turns a patient's full health picture into two synchronized outputs: **Output A** (practitioner clinical protocol with named products/dosages and reasoning) and **Output B** (warm, phased patient action plan). Per **OQ-1 default (Option C)**, generate Output A for review; on approval, generate a single warm patient document. Keep both internally; merge at delivery.

## 1.2 Architecture (two services, one VPC)

| Service | Responsibility | Public? |
|---|---|---|
| `apps/web` — **Next.js 14.2.x** (App Router, TypeScript) | UI, auth, CRUD, uploads, PDF export. **PHI renders only in Server Components (NFR-0).** Mutations via Server Actions. | Yes (edge TLS) |
| `services/engine` — **Python FastAPI** | Document ingestion (PyMuPDF + OCR), normalization (pandas), Claude API calls. | **No — internal VPC only** |
| **PostgreSQL** | RLS tenant isolation; pgcrypto column encryption; JSONB clinical data. | No |
| **S3-compatible** | SSE-KMS, per-tenant KMS keys, pre-signed URLs only. | No |
| **Anthropic Claude API (BAA)** | Long-context analysis + structured output. PHI-free, version-controlled system prompts in `prompts/`. | External (BAA) |

## 1.3 Exact dependency pins (do not change without an upgrade PR)

**`apps/web/package.json`** — exact-minor, locked via `package-lock.json`, installed with `npm ci` (never `npm install`):

```
next            14.2.x
react           18.3.x
react-dom       18.3.x
typescript      5.4.x
@anthropic-ai/sdk  0.90.x      # client lives in the engine; web uses only for typed helpers if needed
pg              8.13.x
zod             4.x
tailwindcss     3.4.x
next-auth (Auth.js) 5.x        # v5 beta line; DB sessions
otplib          12.x           # [A3] TOTP
@playwright/test 1.4x.x        # E2E + headless-Chromium PDF render
vitest          1.x            # unit
```

**`services/engine`** — Python **3.12** [A3], pinned in `requirements.txt` / managed with `uv` or `pip`:

```
fastapi         0.115.x
uvicorn[standard] 0.30.x
pymupdf         1.24.x
pytesseract     0.3.x          # OCR fallback; system pkg: tesseract-ocr
pandas          2.2.x
anthropic       0.40.x         # python SDK; model via ANTHROPIC_MODEL env [A4]
pydantic        2.x
clamd           1.0.x          # [A3] AV via ClamAV daemon
boto3           1.34.x         # S3 + KMS
psycopg[binary] 3.2.x
```

**Package managers:** web → **npm** (`npm ci`). engine → **pip/uv** with a committed lockfile. Monorepo tooling → npm workspaces; no pnpm/yarn.

## 1.4 Environment variables (`.env.example` is committed; real values never are)

```
DATABASE_URL=postgres://...
PGCRYPTO_KEY_REF=           # KMS/Secrets Manager ARN, NOT the key material [SEC-16]
AUTH_SECRET=
S3_BUCKET= / S3_REGION= / KMS_KEY_ALIAS_PREFIX=
ENGINE_BASE_URL=            # internal VPC URL of services/engine
ENGINE_SHARED_SECRET=       # mTLS or HMAC between web<->engine
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5    # [A4] env-configured; the engine reads this and persists per-call to analyses.model_id. Update string when Anthropic ships a newer Sonnet/Opus; the source must never contain a model literal.
SESSION_IDLE_MINUTES=15     # SEC-8, tenant-overridable
INTAKE_TOKEN_TTL_DAYS=7     # SEC-18
```

---

# 2. Core Features & User Flow

The platform presents an **explicit guided sequence** (FR-1); the clinician never guesses the next step. Canonical state machine (FR-2), driven by **data presence**, not manual flags:

```
new → intake_pending → labs_pending → ready_for_protocol → finalized
```
`ready_for_protocol` is set **if and only if** the Readiness Gate (§5.4) returns `can_generate = true`, recomputed server-side on every relevant write. No manual override.

## 2.1 Flow A — New patient → intake (FR-3..6)
1. Clinician creates patient via CSRF-protected Server Action → `patients` row stores `name_encrypted`, `dob_encrypted` (pgcrypto). Status = `new`.
2. Clinician issues a frictionless intake link (token, §5.3). Status → `intake_pending`.
3. Patient completes two-step hybrid intake on mobile → answers persist to `patients.intake_data` (JSONB); uploads → `intake_documents`.
4. Every write emits an `audit_log` row **and** a `patient_timeline` event (`recordIntakeSectionCompleted`, `recordIntakeSubmitted`).

## 2.2 Flow B — Clinician intake review & revision (FR-7..11) — **required before generation**
- Entry: `/dashboard/patients/[id]/intake/review` (read-first); **Edit** → `/dashboard/patients/[id]/intake`.
- Read-only baseline groups all sections (symptoms, history, meds, lifestyle, goals, previous labs); scannable on desktop + print (FR-7).
- Each field shows **provenance**: `patient_entered` | `clinician_edited` | `ai_extracted` | `ai_suggested_unconfirmed` (FR-8).
- In-place edit → updates record **and appends** `audit_log(action='intake_revised', metadata{section,field})`; **original patient value retained** (FR-9).
- AI-derived values render as **"AI-suggested, confirm"** and are **excluded from readiness AND from the generation payload** until accepted/edited (FR-10). Unconfirmed AI is either withheld from `formatTimelineForPrompt()` or passed only inside a labelled `unconfirmed_ai_suggestions` block the prompt must never treat as fact.
- Header shows live **Protocol Readiness** indicator (FR-11, §5.4).

## 2.3 Flow C — Lab guidance → foundational period (FR-12..13)
1. AI suggests lab panels from intake (advisory; clinician accepts/modifies) via prep-brief `suggested_lab_panels` with reasoning.
2. During the lab wait, clinician assigns foundational checklists (sleep, nutrition, hydration, stress, movement, environment) stored as `records.record_type = 'foundational_plan'`. Status = `labs_pending`.

## 2.4 Flow D — Lab upload → extraction → review (FR-14..17)
1. **Upload**: Server Action validates type + size, runs AV scan, streams to S3, creates `records` row `processing_status='pending'`. **File bytes never touch app-server disk.**
2. **Extract**: engine uses PyMuPDF for text PDFs, OCR fallback for scans → encrypted text → `records.extracted_text`.
3. **Structure**: Claude structured-output call normalizes values + reference ranges → `records.structured_data` (JSONB), validated by Zod/Pydantic before persistence (NFR-1).
4. **Lab Review**: clinician corrects extraction errors before values are trusted downstream.

## 2.5 Flow E — Readiness gate → generation → review → delivery (FR-18..21)
1. **Readiness Gate** (§5.4): server-side evaluation. Fail → "Generate Protocol" **disabled**. Partial → confidence **capped**.
2. **Generation**: engine gathers intake JSONB + all structured records + **all intake-hub documents** via a single shared `formatTimelineForPrompt()` (closes gap-analysis 1 & 2). Produces A + B per `prompts/protocol_generation_v1.md`. If `confidence_ceiling < high` → **degraded-confidence mode**: no asserted specific dosages, foundational-layer scope only, mandatory uncertainty banner (content constraint, not just a label).
3. **Review/Edit**: side-by-side; edits increment `protocols.version`; prior versions retained; every edit audited (FR-20).
4. **Delivery**: PDF via the **single on-brand React print route → headless Chromium** path (FR-21, MOD-6). The §4.4 print stylesheet *is* the export stylesheet — brand parity by construction.

## 2.6 Cross-cutting (FR-22..23)
- Stay simpler than incumbent tools; a clinician with 50+ patients must not feel overwhelmed.
- AI is **decision-support**; clinician has final say; every AI surface carries the disclaimer.

---

# 3. Architecture & File Structure

**Doctrine (MOD-1):** vertical slices — UI, server action, data access, and types co-located per feature. **No cross-slice deep imports**; share via `lib/*` or `packages/shared`. **MOD-2:** no source file > 500 LOC.

```
clinical-signal/
├── package.json                  # npm workspaces root
├── .loc-ignore                   # MOD-2 committed exclusion globs
├── prompts/                      # version-controlled, PHI-FREE system prompts
│   ├── protocol_generation_v1.md
│   ├── lab_extraction_v1.md
│   └── prep_brief_v1.md
├── packages/
│   └── shared/                   # cross-slice types ONLY (pg-free, browser-safe)
│       └── src/{enums.ts, provenance.ts, notification.ts}
├── apps/web/
│   ├── package.json              # exact-minor pins (§1.3)
│   ├── tailwind.config.ts        # design tokens (§4.4 tokens)
│   ├── app/globals.css           # token CSS vars; NO raw color literals (MOD-3)
│   ├── middleware.ts             # auth + RBAC + tenant context (SEC-2,6)
│   ├── app/
│   │   ├── (auth)/login/         # MFA login slice (SEC-2)
│   │   ├── dashboard/
│   │   │   └── patients/[id]/
│   │   │       ├── page.tsx              # guided-pipeline checklist (FR-1) — SERVER, renders PHI
│   │   │       ├── intake/
│   │   │       │   ├── review/page.tsx   # FR-7 read-first
│   │   │       │   ├── page.tsx          # FR-9 edit
│   │   │       │   ├── actions.ts        # "use server": auth+audit+timeline
│   │   │       │   ├── intake-review-view.tsx   # client island
│   │   │       │   └── sections/*.tsx
│   │   │       ├── labs/{page.tsx, actions.ts, lab-review-view.tsx}
│   │   │       └── protocol/{page.tsx, actions.ts, protocol-edit-view.tsx}
│   │   ├── intake/[token]/        # SEC-18 unauthenticated reduced-assurance surface
│   │   └── print/                 # MOD-6 single print/export route (protocol|prep-brief|intake-review)
│   ├── lib/
│   │   ├── db.ts                  # pg pool; sets app.current_tenant_id per connection (SEC-5)
│   │   ├── intake.ts              # SERVER-ONLY data access
│   │   ├── intake-schema.ts       # SHARED types (MOD-4: client imports types only)
│   │   ├── readiness.ts           # §5.4 gate logic (server-side, FR-18)
│   │   ├── format-timeline.ts     # MOD-5: ONE formatTimelineForPrompt()
│   │   ├── audit.ts               # append-only writer
│   │   ├── timeline.ts            # patient_timeline writer
│   │   └── notify/                # SEC-10 slice; payload type CANNOT hold PHI
│   └── tests/{unit/, e2e/}
└── services/engine/
    ├── requirements.txt           # [A3] python pins
    ├── app/
    │   ├── main.py                # FastAPI; internal-only; HMAC/mTLS guard
    │   ├── ingest/{extract.py, ocr.py, av.py}   # each <500 LOC (MOD-2)
    │   ├── structure.py           # Claude structured output → Pydantic validate (NFR-1)
    │   ├── generate.py            # protocol gen; degraded-confidence mode (FR-19)
    │   └── prompts.py             # loads prompts/ ; model from ANTHROPIC_MODEL [A4]
    └── tests/
```

**`.github/workflows/validate.yml` gates (must all pass):** `npm ci` → typecheck → **loc-check (MOD-2)** → ESLint incl. `no-restricted-syntax` color rule + regex `#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|-\[#` (MOD-3) → Vitest unit → Playwright E2E → TLS scan (SEC-4) → client-bundle PHI/`pg` scan (NFR-0/MOD-4).

---

# 4. Data Models / Database Schema

> **[A1] Entire schema below is an assumption** — the source named entities only. Enums and types are conservative defaults. Every PHI table carries `tenant_id` and is governed by **RLS** keyed on `app.current_tenant_id`.

## 4.1 Enums

```sql
CREATE TYPE role_t            AS ENUM ('owner','practitioner','viewer','coach');
CREATE TYPE patient_status_t  AS ENUM ('new','intake_pending','labs_pending','ready_for_protocol','finalized');
CREATE TYPE processing_t      AS ENUM ('pending','scanning','extracting','structuring','review','complete','failed');
CREATE TYPE record_type_t     AS ENUM ('lab','foundational_plan','prep_brief','note');
CREATE TYPE protocol_status_t AS ENUM ('draft','in_review','finalized','delivered');
CREATE TYPE confidence_t      AS ENUM ('low','medium','high');
CREATE TYPE provenance_t      AS ENUM ('patient_entered','clinician_edited','ai_extracted','ai_suggested_unconfirmed');
CREATE TYPE doc_kind_t        AS ENUM ('transcript','practitioner_note','lab_pdf');
```

## 4.2 Tables (DDL)

```sql
-- tenants
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}',   -- session_idle_minutes, intake_token_ttl, framing toggle (OQ-5)
  kms_key_arn text NOT NULL,                 -- per-tenant key (SEC-3/16)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- practitioners (clinician accounts)
CREATE TABLE practitioners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  email         citext NOT NULL,
  password_hash text NOT NULL,               -- argon2id
  role          role_t NOT NULL DEFAULT 'practitioner',
  credentials   jsonb NOT NULL DEFAULT '{}', -- see schema below; Zod-validated on write
  -- credentials schema (replaces "§2.2 source"):
  --   { "license_type": "MD" | "DO" | "NP" | "PA" | "ND" | "DC" | "LAc" | "RD" | "other",
  --     "license_number": "string (state-issued)",
  --     "license_state":  "US 2-letter or ISO-3166-2 region code",
  --     "npi": "10-digit string | null",   -- US National Provider Identifier; nullable for non-US
  --     "specialties": ["string"]          -- free-form tags, displayed only in dashboard
  --   }
  mfa_secret_encrypted bytea,                -- pgcrypto; TOTP (SEC-2)
  deactivated_at timestamptz,                -- SEC-17 lifecycle
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- patients (PHI)
CREATE TABLE patients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  name_encrypted bytea NOT NULL,             -- pgcrypto (SEC-3a)
  dob_encrypted  bytea NOT NULL,             -- pgcrypto (SEC-3a)
  status         patient_status_t NOT NULL DEFAULT 'new',
  intake_data    jsonb NOT NULL DEFAULT '{}',-- JSONB PHI; RLS + volume enc (SEC-3b)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- intake_tokens (SEC-18 reduced-assurance surface)
CREATE TABLE intake_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  token_hash text NOT NULL,                  -- store HASH only; 128-bit CSPRNG raw token
  expires_at timestamptz NOT NULL,           -- default now()+ttl
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- one ACTIVE token per patient:
CREATE UNIQUE INDEX one_active_token ON intake_tokens(patient_id) WHERE revoked_at IS NULL;

-- records (labs, foundational plans, prep briefs, notes)
CREATE TABLE records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  patient_id        uuid NOT NULL REFERENCES patients(id),
  record_type       record_type_t NOT NULL,
  processing_status processing_t NOT NULL DEFAULT 'pending',
  s3_key            text,
  extracted_text_encrypted bytea,            -- pgcrypto (SEC-3a)
  structured_data   jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- intake media (companion PRD §4)
CREATE TABLE intake_documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  kind       doc_kind_t NOT NULL,
  s3_key     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  document_id uuid NOT NULL REFERENCES intake_documents(id),
  ordinal     int NOT NULL,
  text_encrypted bytea NOT NULL
);
CREATE TABLE processing_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  record_id   uuid REFERENCES records(id),
  document_id uuid REFERENCES intake_documents(id),
  status      processing_t NOT NULL DEFAULT 'pending',
  attempts    int NOT NULL DEFAULT 0,         -- idempotent retry (NFR-2)
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- analyses (AI provenance, SEC-12)
CREATE TABLE analyses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  patient_id    uuid NOT NULL REFERENCES patients(id),
  model_id      text NOT NULL,               -- [A4] from ANTHROPIC_MODEL at call time
  prompt_version text NOT NULL,
  input_record_ids uuid[] NOT NULL DEFAULT '{}',
  token_usage   jsonb NOT NULL DEFAULT '{}',
  raw_ai_response_encrypted bytea NOT NULL,   -- pgcrypto (SEC-3a)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- protocols (versioned)
CREATE TABLE protocols (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  patient_id      uuid NOT NULL REFERENCES patients(id),
  version         int NOT NULL DEFAULT 1,
  status          protocol_status_t NOT NULL DEFAULT 'draft',
  confidence_ceiling confidence_t NOT NULL DEFAULT 'low',
  content         jsonb NOT NULL,             -- {output_a, output_b} JSONB PHI
  created_by      uuid NOT NULL REFERENCES practitioners(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, version)
);

-- audit_log (append-only, SEC-7) — no UPDATE/DELETE grant
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  actor_id     uuid,                          -- practitioner or NULL for token surface
  action       text NOT NULL,                 -- 'intake_revised','protocol_generated',...
  resource_type text NOT NULL,
  resource_id  uuid,
  metadata     jsonb NOT NULL DEFAULT '{}',   -- {section, field} etc.; NO PHI values
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- patient_timeline (FR-6 UX events)
CREATE TABLE patient_timeline (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  event_type text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sessions (SEC-8 DB-backed, not JWT)
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id uuid NOT NULL REFERENCES practitioners(id),
  expires_at    timestamptz NOT NULL,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz                   -- instant server-side revoke
);
```

## 4.3 RLS (SEC-5) — applied to every PHI table

```sql
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
-- repeat for records, intake_documents, document_chunks, processing_jobs,
-- analyses, protocols, patient_timeline, intake_tokens.
-- audit_log: SELECT only via a dedicated read-only role; INSERT via app role; no UPDATE/DELETE grant.
```

## 4.4 Design tokens (MOD-3 — single source of truth)

All UI colors, radii, spacing, and typography are CSS custom properties in `apps/web/app/globals.css`. Tailwind reads them via `tailwind.config.ts`. **The print stylesheet (MOD-6) is the same stylesheet** — brand parity by construction.

```css
:root {
  /* Brand */
  --color-canvas:        #FAFAF7;   /* page background */
  --color-surface:       #FFFFFF;   /* cards, panels */
  --color-surface-muted: #F2F2EE;
  --color-ink:           #1A1A1A;   /* primary text */
  --color-ink-muted:     #5C5C5C;   /* secondary text */
  --color-accent:        #0F4C47;   /* Ventive teal — primary action */
  --color-accent-soft:   #DCE9E8;
  --color-warn:          #B45309;   /* uncertainty banner, FR-19 */
  --color-danger:        #B91C1C;
  --color-success:       #166534;

  /* Provenance badges (FR-8) */
  --color-prov-patient:  #1D4ED8;   /* patient_entered */
  --color-prov-clinical: #166534;   /* clinician_edited */
  --color-prov-ai:       #6D28D9;   /* ai_extracted */
  --color-prov-ai-unc:   #B45309;   /* ai_suggested_unconfirmed */

  /* Layout */
  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 14px;
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px;

  /* Type */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Inter", sans-serif;
  --font-serif: ui-serif, "Source Serif Pro", Georgia, serif; /* used only on /print protocol body */
  --text-xs: 12px; --text-sm: 14px; --text-base: 16px; --text-lg: 18px;
  --text-xl: 20px; --text-2xl: 24px; --text-3xl: 30px;

  /* Focus ring (SEC-2 / a11y) */
  --focus-ring: 2px solid var(--color-accent);
  --focus-offset: 2px;
}
```

**MOD-3 lint rule** — ESLint `no-restricted-syntax` + regex `#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|-\[#` rejects every raw color literal in `apps/web/app/**` and `apps/web/components/**`. Only `globals.css` and `tailwind.config.ts` are allowed to contain raw colors.

## 4.5 Relations (text ERD)
`tenants` 1—N `practitioners`, `patients`. `practitioners` 1—N `patients` (owning clinician). `patients` 1—N `records`, `intake_documents`, `intake_tokens`, `analyses`, `protocols`, `patient_timeline`. `intake_documents` 1—N `document_chunks`. `records`/`intake_documents` 1—N `processing_jobs`.

---

# 5. API & Logic Specifications

## 5.1 Server Actions (web, `"use server"`) — primary mutation API [A5]
Every action: (1) auth + RBAC check (§5.6 role matrix), (2) set `app.current_tenant_id`, (3) Zod-validate input (NFR-1), (4) mutate, (5) write `audit_log` + `patient_timeline`, (6) revalidate.

| Action | Input (Zod) | Output | Rules |
|---|---|---|---|
| `createPatient` | `{name, dob}` | `{patientId}` | CSRF; encrypt name/dob via pgcrypto (FR-3); status `new`. |
| `issueIntakeToken` | `{patientId}` | `{tokenUrl}` | Revoke existing active token; mint 128-bit CSPRNG; store hash; TTL (SEC-18); status→`intake_pending`. |
| `reviseIntakeField` | `{patientId, section, field, value}` | `{ok}` | Append audit `intake_revised`; **retain original** (FR-9); recompute readiness. |
| `confirmAiField` | `{patientId, field}` | `{ok}` | Provenance → `clinician_edited`; now counts toward readiness (FR-10). |
| `uploadLab` | `multipart` | `{recordId}` | Validate type/size, AV scan, stream to S3, never to disk (FR-14); `processing_status='pending'`. |
| `correctExtraction` | `{recordId, patch}` | `{ok}` | Lab review (FR-17); audited. |
| `generateProtocol` | `{patientId}` | `{protocolId}` | **Server-side readiness gate (§5.4) must pass**; call engine; persist A+B; degraded mode if ceiling<high (FR-19). |
| `editProtocol` | `{protocolId, patch}` | `{version}` | Increment version; retain prior; audit (FR-20). |
| `deliverProtocol` | `{protocolId}` | `{pdfUrl}` | Render print route → Chromium PDF → S3 `/exports/` (FR-21, MOD-6); status→`delivered`. |

## 5.2 Engine endpoints (internal VPC only, HMAC/mTLS guarded) [A5]

```
POST /extract     {record_id|document_id, s3_key}      -> {status, extracted_text_ref}
POST /structure   {record_id, extracted_text_ref}      -> {structured_data}  (Pydantic-validated, NFR-1)
POST /generate    {patient_id, timeline_payload, confidence_ceiling}
                                                        -> {output_a, output_b, model_id, token_usage}
GET  /health
```
All idempotent + retry-safe via `processing_jobs` state machine (NFR-2). LLM JSON validated; on parse fail → bounded retry → flag `failed` (NFR-1).

## 5.3 Intake token API (SEC-18, unauthenticated PHI-entry surface)
`GET/POST /intake/[token]` — verify hash, not expired, not revoked; per-token + per-IP rate limit + lockout; PHI delivered only after token check; **all access audited**; link itself carries no PHI (SEC-10).

## 5.4 Readiness Gate logic — pure deterministic function (no LLM)

`lib/readiness.ts` exports `evaluateReadiness(patient): ReadinessResult` — a total, side-effect-free function. Same inputs → same output, always. Recomputed server-side on every relevant write (FR-2, FR-18).

**Checklist inputs and weights** (the `checks` array passed in):

| Key | Check | Weight |
|---|---|---|
| `intake_step1` | Step-1 intake submitted | Required |
| `intake_required_sections` | All required intake sections complete (§5.4.1) | Required |
| `triggered_deep_dives` | Every triggered deep dive answered or clinician-skipped with reason | Required |
| `safety_flags_reviewed` | Red-flag symptoms reviewed by clinician | Required |
| `medications_detailed` | Medications carry dose + duration | High |
| `labs_present` | Labs present OR explicitly waived by clinician | High |
| `transcripts_verified` | Uploaded transcripts/notes attached AND `is_verified=true` | Medium |
| `ai_confirmed` | Every `ai_extracted` / `ai_suggested_unconfirmed` field has been confirmed or edited | Required-for-high |

**Algorithm — implement exactly:**

```ts
type Check = { key: string; weight: 'Required'|'High'|'Medium'|'Required-for-high'; met: boolean; gap?: string };

export type ReadinessResult = {
  can_generate: boolean;
  readiness: 'ready' | 'partial' | 'insufficient';
  confidence_ceiling: 'low' | 'medium' | 'high';
  blocking_gaps: string[];        // why generation is disabled
  non_blocking_gaps: string[];    // gaps that only cap the ceiling
  unconfirmed_ai_fields: string[]; // excluded from input + readiness (FR-10)
};

export function evaluateReadiness(checks: Check[], unconfirmedAi: string[]): ReadinessResult {
  const blocking      = checks.filter(c => c.weight === 'Required' && !c.met);
  const highGaps      = checks.filter(c => c.weight === 'High'     && !c.met);
  const medGaps       = checks.filter(c => c.weight === 'Medium'   && !c.met);
  const aiUnconfirmed = !checks.find(c => c.key === 'ai_confirmed')!.met;

  const readiness =
    blocking.length > 0                                            ? 'insufficient'
    : (highGaps.length + medGaps.length) === 0 && !aiUnconfirmed   ? 'ready'
    :                                                                'partial';

  const confidence_ceiling =
    readiness === 'insufficient'              ? 'low'    // moot; cannot generate
    : readiness === 'ready'                   ? 'high'
    : (highGaps.length > 0 || aiUnconfirmed)  ? 'low'    // forces degraded mode (FR-19)
    :                                           'medium'; // only Medium gaps remain

  return {
    can_generate: readiness !== 'insufficient',
    readiness,
    confidence_ceiling,
    blocking_gaps:     blocking.map(c => c.gap ?? c.key),
    non_blocking_gaps: [...highGaps, ...medGaps].map(c => c.gap ?? c.key),
    unconfirmed_ai_fields: unconfirmedAi,
  };
}
```

**Hard rules layered on top of the algorithm:**
1. **Unconfirmed AI fields** never count toward completeness and are excluded from the generation payload (FR-10).
2. **No manual override** sets `ready_for_protocol`; the state machine flips only when `can_generate === true`.
3. `ready_for_protocol` is recomputed on every write that touches intake, records, or AI confirmations.

### 5.4.1 Required intake sections

The `intake_required_sections` check is `met` only when **all** of the following are non-empty in `patients.intake_data`:

- `about_you` — name, DOB, biological sex, contact preference
- `why_here` — chief complaint, goals (≥1)
- `current_symptoms` — symptom list with onset and severity (≥1)
- `medications` — explicit list **or** explicit `none` flag
- `history` — prior diagnoses list **or** explicit `none` flag
- `lifestyle_snapshot` — sleep hours, stress, movement frequency

Optional sections (`previous_labs`, `wellness_practices`, `family_history`) do **not** block readiness but **do** cap the ceiling to `medium` if missing when the patient signalled them in Step 1.

## 5.5 Notification logic (SEC-10) — structurally PHI-free
```ts
type Notification = { kind: string; actorDisplayName?: string; resourceRef: string; timestamp: string };
```
A unit test asserts the type has **no** PHI fields. Allowed copy: "You have a new message." Third-party providers never receive PHI.

## 5.6 RBAC role matrix (SEC-6) — the canonical authorization table

`middleware.ts` enforces this matrix. Every Server Action also re-checks it server-side (defense in depth). A role that is not listed for an action MUST receive `403 Forbidden` and produce an `audit_log` row with `action='rbac_denied'`.

| Capability                        | `owner` | `practitioner` | `viewer` | `coach` |
|---|:---:|:---:|:---:|:---:|
| Create / deactivate practitioners (own tenant) | ✅ | ❌ | ❌ | ❌ |
| Configure tenant settings (idle timeout, TTL, OQ-5 framing) | ✅ | ❌ | ❌ | ❌ |
| Create patient                    | ✅ | ✅ | ❌ | ❌ |
| Issue / revoke intake token       | ✅ | ✅ | ❌ | ❌ |
| Read patient PHI                  | ✅ | ✅ | ✅ | ✅ |
| Revise intake / confirm AI field  | ✅ | ✅ | ❌ | ❌ |
| Upload lab / correct extraction   | ✅ | ✅ | ❌ | ❌ |
| Assign foundational checklist     | ✅ | ✅ | ❌ | ✅ |
| Append `patient_timeline` event   | ✅ | ✅ | ❌ | ✅ |
| Generate protocol                 | ✅ | ✅ | ❌ | ❌ |
| Edit protocol (draft / in_review) | ✅ | ✅ | ❌ | ❌ |
| **Finalize** protocol             | ✅ | ✅ | ❌ | **❌** |
| Deliver / export PDF              | ✅ | ✅ | ❌ | ❌ |
| Read `audit_log`                  | ✅ | ❌ | ❌ | ❌ |

**Cross-tenant access is impossible** at the matrix layer — RLS (§4.3) is the second wall. A practitioner can only see patients where `patients.practitioner_id = practitioners.id` OR an explicit `patient_share` row exists (out of scope for v1).

---

# 6. Micro-Task Implementation & Testing Plan (CRITICAL)

Hyper-granular, atomic steps. **Run each Build & Test checkpoint and confirm green before the agent proceeds.** `[HUMAN/INFRA]` = an agent cannot complete this; it scaffolds, you operate.

## Phase 0 — Foundation
- 0.1 `npm init` workspace root; add `apps/web`, `services/engine`, `packages/shared`.
- 0.2 Create `apps/web` Next 14.2.x + TS + Tailwind 3.4.x with exact pins; commit `package-lock.json`.
- 0.3 Add `.loc-ignore` (MOD-2 globs) and `.env.example`.
- 0.4 Add `tailwind.config.ts` + `globals.css` design tokens (§4.4 tokens); **zero raw color literals.**

**✅ Build & Test 0:** `npm ci && npm run build` succeeds; `npm run dev` renders a token-styled blank page. Manually confirm no hex/rgb in CSS.

## Phase 1 — DB & tenancy
- 1.1 Add `pg` 8.13.x; write `lib/db.ts` pool that sets `app.current_tenant_id` per connection.
- 1.2 Migration `001_enums.sql` (§4.1).
- 1.3 Migration `002_core_tables.sql` (tenants, practitioners, patients).
- 1.4 Migration `003_phi_tables.sql` (records, intake_*, analyses, protocols, sessions, audit_log, timeline).
- 1.5 Migration `004_rls.sql` (§4.3) + pgcrypto extension.

**✅ Build & Test 1:** run migrations on a local Postgres. **RLS proof:** insert two tenants' patients; in `psql` set `app.current_tenant_id` to tenant A → `SELECT * FROM patients` returns A's rows only (SEC-5). `[HUMAN/INFRA]` verify pgcrypto key comes from a ref, not literal (SEC-16).

## Phase 2 — Auth + RBAC + sessions
- 2.1 Auth.js v5 with DB sessions; argon2id password hashing.
- 2.2 TOTP enrollment + verification (`otplib`), `mfa_secret_encrypted` via pgcrypto.
- 2.3 `middleware.ts`: require session + MFA; set tenant context; enforce role matrix (§5.6).
- 2.4 15-min idle timeout (tenant-configurable) + instant server-side revoke.

**✅ Build & Test 2:** Playwright E2E — (a) login without MFA is **rejected** (SEC-2); (b) idle past timeout forces re-auth (SEC-8); (c) revoking a session kills it immediately; (d) a `coach` role cannot finalize a protocol (§5.6).

## Phase 3 — Patients + audit + timeline primitives
- 3.1 `lib/audit.ts` append-only writer; `lib/timeline.ts` writer.
- 3.2 `createPatient` Server Action (CSRF, pgcrypto encrypt) (FR-3).
- 3.3 Patient `page.tsx` server component renders guided-pipeline checklist (FR-1).

**✅ Build & Test 3:** Vitest — `audit_log` has no UPDATE/DELETE grant (tamper test, SEC-7). E2E — create a patient; confirm an audit row + timeline event written; confirm name/dob are ciphertext in DB.

## Phase 4 — Intake token surface (SEC-18)
- 4.1 `issueIntakeToken` action (CSPRNG, store hash, single-active index, TTL).
- 4.2 `/intake/[token]` route: hash verify, expiry/revoke checks, rate-limit + lockout, full audit.
- 4.3 Patient mobile intake form → persists `intake_data` + `intake_documents`.

**✅ Build & Test 4:** Vitest token entropy ≥128 bits. E2E — expired/revoked token rejected; brute-force triggers lockout; the link/notification carries **no PHI** (SEC-10/18).

## Phase 5 — Intake review & revision (Flow B)
- 5.1 `lib/intake.ts` (server) + `lib/intake-schema.ts` (shared types, MOD-4).
- 5.2 `/intake/review` read-only grouped view with provenance badges (FR-7/8).
- 5.3 `reviseIntakeField` (append audit, retain original) + `confirmAiField` (FR-9/10).
- 5.4 `lib/readiness.ts` `evaluateReadiness` (§5.4) + live header indicator (FR-11).

**✅ Build & Test 5:** Vitest — readiness logic table-driven cases (hard block, partial→medium, complete→high). **Critical:** unit test asserting unconfirmed AI fields are excluded from both readiness and the generation input payload (FR-10/19). E2E — edit a field; original patient value still queryable (FR-9). `npm run loc-check` passes (MOD-2).

## Phase 6 — Engine: ingestion pipeline
- 6.1 FastAPI `main.py` with HMAC/mTLS guard; `/health`.
- 6.2 `av.py` ClamAV scan; `ingest/extract.py` PyMuPDF; `ocr.py` Tesseract fallback. `[HUMAN/INFRA]` run ClamAV daemon.
- 6.3 `uploadLab` action: validate, AV, stream to S3 (no disk), create `records` pending (FR-14).
- 6.4 `/extract` + `/structure` with `processing_jobs` idempotent state machine (NFR-2); Pydantic-validate structured output (NFR-1).

**✅ Build & Test 6:** unit — malicious-file corpus rejected (SEC-11); idempotency (re-running `/extract` doesn't duplicate). Integration — upload a sample lab PDF → `records.structured_data` populated → confirm bytes never hit app-server disk.

## Phase 7 — Generation
- 7.1 `lib/format-timeline.ts` — the **one** `formatTimelineForPrompt()` (MOD-5); includes intake + structured records + intake-hub docs; routes unconfirmed AI into a labelled non-fact block.
- 7.2 `prompts/protocol_generation_v1.md` (PHI-free).
- 7.3 `/generate` engine endpoint; persist `analyses` provenance (SEC-12) + `protocols` A+B.
- 7.4 `generateProtocol` action: **server-side readiness gate must pass**; degraded-confidence mode when ceiling<high (FR-18/19).

**✅ Build & Test 7:** unit — gate blocks generation on incomplete data (KPI-3 = 0). E2E — incomplete patient → "Generate" disabled; complete-but-partial → uncertainty banner + no specific dosages rendered (FR-19). Confirm `analyses` row stores `model_id`, prompt version, inputs, token usage.

## Phase 8 — Review/Edit + versioning
- 8.1 Side-by-side `protocol-edit-view.tsx` (client island).
- 8.2 `editProtocol` increments version, retains prior, audits (FR-20).

**✅ Build & Test 8:** E2E — edit twice → versions 1,2,3 all retained and queryable; each edit audited.

## Phase 9 — Export & print (single path, MOD-6)
- 9.1 `/print` React route (protocol | prep-brief | intake-review) using the §4.4 print stylesheet.
- 9.2 `deliverProtocol` renders that route via Playwright headless Chromium → PDF → S3 `/exports/`.

**✅ Build & Test 9:** visual check — on-screen print preview and exported PDF are style-identical (brand parity); brand audit (no raw colors) passes on the print route (MOD-3).

## Phase 10 — Notifications (SEC-10)
- 10.1 `lib/notify/` slice with the structurally-PHI-free `Notification` type (§5.5).

**✅ Build & Test 10:** unit — `Notification` type has no PHI fields; payload assertion test passes (SEC-10c). E2E — a dispatched notification contains only `kind`/`resourceRef`/`timestamp`.

## Phase 11 — Compliance regression + ship gate
- 11.1 CI: TLS scan, log-scrub, client-bundle PHI/`pg` scan, audit-immutable, loc-check, color-lint (QA-9).
- 11.2 Golden-set protocol comparison harness; run on every prompt change (QA-10).
- 11.3 Think-aloud usability test on intake + protocol-review (QA-2..8); iterate to KPI-6 ≥80%.
- 11.4 `[HUMAN/INFRA]` SEC-1 BAAs, SEC-13 IR runbook + tabletop, SEC-14 backup/restore drill, SEC-16 key rotation, SEC-17 deprovisioning SLA.

**✅ Build & Test 11 (ship gate):** full CI green; KPI-5 (files >500 LOC) = 0; KPI-3 (high-confidence on incomplete) = 0; KPI-4/6 evidenced. Human sign-off on all `[HUMAN/INFRA]` items before any real PHI flows.

---

## Working agreement for the agent
- Touch **one slice per task**; never deep-import across slices (MOD-1).
- If a file approaches 500 LOC, **stop and split** before continuing (MOD-2).
- Never store unvalidated LLM output as truth (NFR-1). Never put PHI in logs, notifications, client bundles, or `localStorage` (NFR-0, SEC-9/10).
- Reference requirement IDs in every commit message.
- **Do not proceed past a Build & Test checkpoint until it is green.**

---

# Appendix A — Requirement & Identifier Glossary

Every ID referenced in this document is defined below. No identifier in this document is "external."

## A.1 Functional Requirements (FR-_)

| ID | Definition |
|---|---|
| FR-1 | Explicit guided sequence — the patient detail page shows the canonical pipeline checklist; the clinician never has to guess the next step. |
| FR-2 | State machine driven by **data presence**, not manual flags: `new → intake_pending → labs_pending → ready_for_protocol → finalized`. Recomputed server-side on every relevant write. |
| FR-3 | Create patient — Server Action, CSRF-protected, encrypts `name` and `dob` via pgcrypto. |
| FR-4 | Issue frictionless intake token (§5.3). |
| FR-5 | Patient completes two-step hybrid intake on mobile; answers persist to `patients.intake_data`. |
| FR-6 | Every write emits an `audit_log` row **and** a `patient_timeline` event. |
| FR-7 | Read-first intake review groups all sections; scannable on desktop and `/print`. |
| FR-8 | Provenance badge on every field: `patient_entered` / `clinician_edited` / `ai_extracted` / `ai_suggested_unconfirmed`. |
| FR-9 | In-place edit appends `audit_log(action='intake_revised')` and **retains the original patient value**. |
| FR-10 | AI-derived values render as "AI-suggested, confirm" and are **excluded from readiness AND from the generation payload** until confirmed/edited. |
| FR-11 | Live Protocol Readiness indicator in the patient header (driven by §5.4). |
| FR-12 | AI suggests lab panels with reasoning (advisory; clinician accepts/modifies). |
| FR-13 | Foundational checklist assignable during the lab wait (sleep, nutrition, hydration, stress, movement, environment). |
| FR-14 | Lab upload: validate, antivirus, stream to S3, never to disk; create `records` pending. |
| FR-15 | Extract: PyMuPDF + OCR fallback → encrypted text. |
| FR-16 | Structure: Claude structured output → Zod/Pydantic-validated `structured_data` JSONB. |
| FR-17 | Lab Review: clinician corrects extraction before downstream trust. |
| FR-18 | Server-side Readiness Gate (§5.4); "Generate Protocol" disabled on failure, capped on partial. |
| FR-19 | Degraded-confidence mode when `confidence_ceiling < high`: no asserted specific dosages, foundational-layer scope only, mandatory uncertainty banner enforced as content (not just label). |
| FR-20 | Protocol edits increment `protocols.version`; prior versions retained; every edit audited. |
| FR-21 | PDF delivery via the single on-brand React `/print` route → headless Chromium (MOD-6). |
| FR-22 | Stay simpler than incumbent tools — clinician with 50+ patients must not feel overwhelmed. |
| FR-23 | AI is decision-support; clinician has final say; every AI surface carries the disclaimer. |

## A.2 Non-Functional Requirements (NFR-_)

| ID | Definition |
|---|---|
| NFR-0 | PHI renders **only** in Server Components and never in client bundles, logs, notifications, or `localStorage`. CI scans the client bundle for known PHI tokens and for `pg` imports. |
| NFR-1 | Never persist unvalidated LLM output as truth. Zod (web) / Pydantic (engine) validate every structured response before write. On parse failure: bounded retry → flag `failed`. |
| NFR-2 | All long-running jobs are idempotent and retry-safe via `processing_jobs` state machine. |
| NFR-3 | Tenant-overridable limits (idle timeout, intake token TTL) live in `tenants.settings`. |
| NFR-4 | Page render p95 ≤ 1.5 s on a clinician's first paint after auth on broadband. |

## A.3 Security Requirements (SEC-_)

| ID | Definition |
|---|---|
| SEC-1  | BAAs signed with Anthropic and any S3 / KMS / OCR vendor before any real PHI flows. `[HUMAN/INFRA]` |
| SEC-2  | MFA mandatory for every clinician account (TOTP via `otplib`); login without verified MFA is rejected. |
| SEC-3a | Column-level pgcrypto encryption for `name_encrypted`, `dob_encrypted`, `extracted_text_encrypted`, `raw_ai_response_encrypted`, `mfa_secret_encrypted`, `text_encrypted` (`document_chunks`). |
| SEC-3b | Volume-level encryption (RDS/Postgres + S3 SSE-KMS) for everything else, including JSONB PHI. |
| SEC-4  | TLS 1.2+ only at the edge; HSTS; CI runs a TLS scan as a release gate. |
| SEC-5  | Row-Level Security on every PHI table, keyed on `current_setting('app.current_tenant_id')::uuid`. Set per connection in `lib/db.ts`. |
| SEC-6  | RBAC role matrix (§5.6) enforced in middleware AND re-checked in every Server Action. |
| SEC-7  | `audit_log` append-only — application role has INSERT only; a separate read-only role has SELECT; **no UPDATE or DELETE grant**. |
| SEC-8  | Idle session timeout default 15 min (tenant-overridable); revocation is instant and server-side (DB-backed sessions, not JWT). |
| SEC-9  | Structured logging with PHI redaction; the redaction allow-list is committed in `lib/log/allow-list.ts`. |
| SEC-10 | Notifications are structurally PHI-free (§5.5). Third-party providers never receive PHI. |
| SEC-11 | Antivirus scan via ClamAV on every upload; malicious-file corpus is a CI fixture. |
| SEC-12 | AI provenance: every analysis call writes `analyses` row with `model_id`, `prompt_version`, `input_record_ids`, `token_usage`, `raw_ai_response_encrypted`. |
| SEC-13 | Incident-response runbook + annual tabletop. `[HUMAN/INFRA]` |
| SEC-14 | Backup + tested restore drill (RPO ≤ 24h, RTO ≤ 4h). `[HUMAN/INFRA]` |
| SEC-15 | Least-privilege IAM for every service principal. `[HUMAN/INFRA]` |
| SEC-16 | KMS key custody: `PGCRYPTO_KEY_REF` is an ARN, never the key material. Annual key rotation. `[HUMAN/INFRA]` |
| SEC-17 | Practitioner deprovisioning SLA ≤ 24h after termination notification. `[HUMAN/INFRA]` |
| SEC-18 | Intake token surface: 128-bit CSPRNG, HASH stored, TTL, single-active partial index, per-token + per-IP rate limit + lockout, full audit, **link itself carries no PHI**. |

## A.4 Modularity Requirements (MOD-_)

| ID | Definition |
|---|---|
| MOD-1 | Vertical slices: UI, server action, data access, and types co-located per feature. No cross-slice deep imports; share via `lib/*` or `packages/shared`. |
| MOD-2 | No source file exceeds **500 LOC**. CI gate fails the build otherwise. `.loc-ignore` lists committed exclusions. |
| MOD-3 | Design tokens only (§4.4). Zero raw color literals in `apps/web/app/**` and `apps/web/components/**`; ESLint enforces. |
| MOD-4 | Shared types are pg-free and browser-safe (`packages/shared/src/*`). Client never imports `pg` or anything server-only. |
| MOD-5 | **One** `formatTimelineForPrompt()` (`lib/format-timeline.ts`). All generation paths use it. |
| MOD-6 | **One** print/export route (`/print/[kind]`). PDF rendering = headless Chromium against that route. |

## A.5 Key Performance Indicators (KPI-_)

| ID | Definition | Target | Verified in |
|---|---|---|---|
| KPI-1 | Median time clinician spends per patient on intake review | ≤ 15 min | Think-aloud (Phase 11) |
| KPI-2 | Successful generation rate when readiness passes | ≥ 95% | Phase 7 + telemetry |
| KPI-3 | % of protocols generated at `high` confidence when underlying data is incomplete | **0** | Phase 7 unit + Phase 11 audit |
| KPI-4 | % of `ai_*` provenance fields confirmed before counted as fact | **100%** | Phase 5 unit + Phase 11 audit |
| KPI-5 | Source files exceeding 500 LOC | **0** | CI `loc-check` |
| KPI-6 | Think-aloud usability success rate on intake and protocol-review | ≥ 80% | Phase 11 (QA-2..8) |

## A.6 Open Questions resolved as defaults (OQ-_)

| ID | Question | Default chosen | Where it lives |
|---|---|---|---|
| OQ-1 | Output A vs Output B sequencing. | **Option C** — generate Output A for clinician review; on approval, generate one warm patient document (Output B); merge at delivery. | §1.1, §2.5 |
| OQ-2 | Lab vendor allow-list for direct integration. | Out of scope for v1 — labs arrive as uploads only. | §2.4 |
| OQ-3 | Patient-app native vs web-only. | Web-only, mobile-first. | §2.3 |
| OQ-4 | Multi-language intake. | English only for v1; `i18n` keys stubbed. | §2.1 |
| OQ-5 | Patient framing voice — "warm/coaching" vs "clinical-neutral". | Tenant-toggle, stored in `tenants.settings.framing` (`"warm"` default). | §4.2 |

## A.7 Quality-Assurance items (QA-_)

| ID | Definition |
|---|---|
| QA-1 | Unit test pass rate = 100% before merge. |
| QA-2 | Think-aloud: clinician can locate every required intake field within 60s on first use. |
| QA-3 | Think-aloud: clinician can confirm an AI-suggested field in ≤ 2 clicks. |
| QA-4 | Think-aloud: clinician can correct a lab extraction error in ≤ 3 clicks. |
| QA-5 | Think-aloud: readiness widget gap list deep-links resolve correctly in 100% of cases. |
| QA-6 | Think-aloud: protocol edit + version retention is discoverable without training. |
| QA-7 | Think-aloud: patient completes Step 1 on a 320px viewport without horizontal scroll. |
| QA-8 | Think-aloud: patient understands the uncertainty banner copy (comprehension check). |
| QA-9 | CI release gate: TLS scan + log-scrub + client-bundle PHI/`pg` scan + audit-immutable check + `loc-check` + color-lint. |
| QA-10 | Golden-set protocol comparison harness: runs on every prompt change; alerts on output drift beyond a stored hash + clinician-curated diff threshold. |

