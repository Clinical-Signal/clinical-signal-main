# Clinical Signal — General Platform PRD

| Field | Value |
|---|---|
| **Document** | `clinical_signal_general_prd.md` |
| **Companion** | `clinical_signal_intake_llm_prd.md` (end-to-end intake + LLM) |
| **Status** | v1.1 — approved-pending |
| **Scope** | Platform architecture, clinician scalability, compliance, quality standards |
| **Audience** | Engineering (human + AI agents), design, compliance |

> **How to use this PRD:** Every requirement has a stable ID (`FR-*`, `NFR-*`, `SEC-*`, `MOD-*`, `QA-*`). Tasks should reference IDs. Acceptance criteria are testable. File paths are relative to `apps/web/` unless stated. Constraints in §0 are non-negotiable and apply to every requirement.

---

## 0. Binding Constraints (apply to all work)

| ID | Constraint | Rule |
|---|---|---|
| **MOD-1** | Vertical-slice modularity | Organize by feature slice (UI + server action + data access + types together), not by technical layer. No cross-slice deep imports — share via `lib/*` or `packages/shared`. |
| **MOD-2** | 500-LOC hard limit | No source file (`*.ts`, `*.tsx`, `*.py`) exceeds **500 lines**. CI-enforced. Migrations/lockfiles/generated files excluded. |
| **MOD-3** | Ventive branding | All UI and exported artifacts use the Ventive design tokens (§4.4). Zero hard-coded colors. Serif headings, muted-teal accent. |
| **SEC-0** | HIPAA by default | Every feature is evaluated as PHI-bearing: BAA, MFA, encryption, audit, tenant isolation, and PHI⟂notification separation (§5). |
| **NFR-0** | Server-rendered PHI | PHI renders in React Server Components only. Patient data never enters the browser JS runtime, client state, or `localStorage`. |

---

## 1. Executive Summary & Vision

### 1.1 Product

Clinical Signal is a HIPAA-compliant web platform that converts a patient's full health picture — intake, history, lifestyle, labs, and call transcripts — into **two synchronized outputs in minutes instead of hours**:

- **Output A — Clinical Protocol** (practitioner-facing): mechanism-forward, named products + dosages, with auditable clinical reasoning.
- **Output B — Phased Client Action Plan** (patient-facing): the same plan in warm, plain language, phased to prevent overwhelm, with explicit desired outcomes per phase.

Protocol creation is the bottleneck that caps how many clients a practitioner can serve. Removing it is the core value proposition.

### 1.2 Vision — Holistic Healing at Clinician Scale

Two vectors define the product:

1. **Holistic healing as the product's core.** The platform reasons like a functional practitioner: systems and root causes (gut → hormones → weight), clinical sequencing (address HPA axis, gut, blood sugar, and sleep *before* sex hormones), and phased plans that drive compliance. Every AI output states *why*, in this sequence, for *this* patient.
2. **Scale beyond naturopaths to all clinicians.** The current design center is functional-health practitioners. The architecture must generalize to any licensed clinician (MD, DO, NP, supervised coaches) without rewrites. Scalability is a design requirement, not a later phase.

### 1.3 Positioning

No competitor performs AI-driven protocol generation with a phased, patient-facing output. Practice-management tools store protocols; Clinical Signal *generates* them. That is the moat.

### 1.4 Success Metrics

| ID | Metric | Target |
|---|---|---|
| KPI-1 | "Labs arrived" → "protocol sent" | < 30 min |
| KPI-2 | Practitioner active-patient capacity vs. baseline | +50% |
| KPI-3 | High-confidence protocols generated on incomplete data | **0** (blocked by readiness gate, §3.6 + intake PRD §5) |
| KPI-4 | PHI-in-notification incidents | **0** |
| KPI-5 | Files > 500 LOC in `main` | **0** (CI-enforced) |
| KPI-6 | Core usability tasks completed unaided in testing | ≥ 80% before ship |

---

## 2. Target Audience

### 2.1 Primary — The Clinician

Solo, high-touch functional-health practitioner managing 5–15 active clients with daily messaging and 2–4 monthly calls across 4–6 month engagements. Anchor persona: Dr. Laura (trains 35+ practitioners). Today juggles multiple disconnected tools; wants one clinical system.

**Jobs to be done:**
- Get a defensible, editable protocol fast; always retain final say.
- Follow an explicit step-by-step workflow (know the next action at all times).
- Be prevented from generating a confident protocol on incomplete data.
- Review and revise patient-submitted intake before relying on it.

### 2.2 Scale Persona Set

| Segment | Requirement to support |
|---|---|
| Naturopaths / functional medicine | Current design center |
| MD / DO (integrative) | Conventional-medicine framing toggle |
| NP / PA | License + scope metadata in `practitioners.credentials` (license type, NPI) |
| Supervised health coach | Reduced-privilege role; cannot finalize clinical protocols |

### 2.3 Secondary — The Patient

Experiences the platform through **intake** (companion PRD) and, in Phase 2, a portal. Binding principles: mobile-first and frictionless; warm, plain language; transparent PHI handling.

### 2.4 Compliance Audience

Owners (and future compliance officers) consume the audit-log viewer and access-control matrix. Auditability is a first-class user need.

---

## 3. Core Workflows & User Journeys

The platform must present an **explicit, guided sequence** end to end. The clinician never has to guess the next step.

### 3.1 Canonical Pipeline (state machine)

```
new → intake_pending → labs_pending → ready_for_protocol → finalized
```

Rendered as a per-patient guided checklist (status chips on `patients.status`, see `lib/intake.ts`).

```
Intake (patient, hybrid LLM)
   └─► Clinician Review & Revision ─► Lab Guidance ─► Foundational Period
          └─► Lab Upload ─► Extraction ─► Lab Review
                 └─► Protocol Readiness Gate ─► Generation (A+B) ─► Review/Edit ─► Delivery (PDF)
```

| ID | Requirement |
|---|---|
| FR-1 | Each patient view renders the pipeline as a guided checklist with the current step highlighted and the next action linked. |
| FR-2 | Status transitions are derived from data presence (intake submitted, labs present, readiness met), not manual flags alone. |

### 3.2 Journey A — New Patient → Intake

| ID | Requirement |
|---|---|
| FR-3 | Clinician creates a patient via Server Action (CSRF-protected); `patients` row stores `name_encrypted`, `dob_encrypted` via `pgcrypto`. |
| FR-4 | Clinician sends the patient a frictionless intake link (mechanics in intake PRD). |
| FR-5 | Patient completes the two-step hybrid intake on mobile; answers persist to `patients.intake_data` (JSONB); uploads to `intake_documents`. |
| FR-6 | Every write emits an `audit_log` row and a `PatientTimeline` event (pattern: `recordIntakeSectionCompleted`, `recordIntakeSubmitted` in `intake/actions.ts`). |

### 3.3 Journey B — Clinician-Facing Intake Review & Revision (required, pre-protocol)

This view must exist and be completed before protocol generation. Entry: `/dashboard/patients/[id]/intake/review` (read-first), with **Edit** into `/dashboard/patients/[id]/intake`.

| ID | Requirement | Acceptance |
|---|---|---|
| FR-7 | Read-only baseline view groups all captured sections (symptoms, history, meds, lifestyle, goals, previous labs). | All sections render; scannable on desktop + print. |
| FR-8 | Each field is tagged with provenance: **patient-entered**, **clinician-edited**, or **AI-extracted**. | Provenance badge visible per field. |
| FR-9 | Clinician edits any field in place; save updates the record and **appends** an audit entry (`action: intake_revised`, metadata `{section, field}`). Original patient value retained. | Audit row written; original value queryable. |
| FR-10 | Any AI-derived value (from transcript/secondary questions) shows as **"AI-suggested — confirm"** and is excluded from protocol readiness until the clinician accepts or edits it. | Unconfirmed AI fields do not count toward readiness. |
| FR-11 | The review header shows a live **Protocol Readiness** indicator (§3.6). | Indicator reflects the readiness JSON (intake PRD §5.1). |

**Rationale (concrete):** `PROTOCOL-GAP-ANALYSIS.md` documents protocol quality collapsing when uploaded documents and transcript nuance were present but not surfaced. This review step is the human checkpoint that catches that class of error.

### 3.4 Journey C — Lab Guidance → Foundational Period

| ID | Requirement |
|---|---|
| FR-12 | AI suggests lab panels from intake (advisory; clinician accepts/modifies). Surfaced via the prep brief `suggested_lab_panels` (with reasoning). |
| FR-13 | During the lab wait, clinician assigns foundational checklists (sleep, nutrition, hydration, stress, movement, environment) stored as `record_type = foundational_plan`. |

### 3.5 Journey D — Lab Upload → Extraction → Review

| ID | Requirement |
|---|---|
| FR-14 | Upload: Server Action validates type + size, runs AV scan, streams to S3, creates `records` row with `processing_status = pending`. File bytes never touch app-server disk. |
| FR-15 | Extract: Python engine uses PyMuPDF for text PDFs, OCR fallback for scans; encrypted text → `records.extracted_text`. |
| FR-16 | Structure: Claude structured-output call normalizes values + reference ranges → `records.structured_data` (JSONB). |
| FR-17 | Lab Review: clinician corrects extraction errors before values are trusted downstream. |

### 3.6 Journey E — Readiness Gate → Generation → Review → Delivery

| ID | Requirement |
|---|---|
| FR-18 | **Readiness Gate:** before "Generate Protocol" is enabled, the system evaluates a data-completeness checklist. If required checks fail, generation is **blocked**; if partial, confidence is **capped** (full logic: intake PRD §5). Enforced **server-side**, not UI-only. |
| FR-19 | **Generation:** the engine gathers intake JSONB + all structured records **+ all intake-hub documents** (transcripts, notes, lab PDFs) using a single shared `formatTimelineForPrompt()` (closes `PROTOCOL-GAP-ANALYSIS` Gaps #1/#2). Produces Output A + B per `prompts/protocol_generation_v1.md`. |
| FR-20 | **Review/Edit:** side-by-side editing; edits increment `protocols.version`; prior versions retained; every edit audited. |
| FR-21 | **Delivery:** Ventive-branded PDF export to S3 `/exports/`. |

### 3.7 Cross-Cutting UX Rules

| ID | Requirement |
|---|---|
| FR-22 | The interface stays simpler than incumbent practice tools. A clinician with 50+ active patients must not feel overwhelmed. |
| FR-23 | The AI is decision-support; the clinician has final say. Every AI surface carries the decision-support disclaimer. |

---

## 4. Technical Architecture & Modularity Standards

### 4.1 System Architecture (as-built; preserve)

Two services (`ARCHITECTURE.md`):

- **Next.js 14+ (App Router, TypeScript)** — UI, auth, CRUD, uploads. Server Components render PHI (NFR-0). Server Actions for mutations.
- **Python FastAPI analysis engine** — document ingestion (PyMuPDF, OCR), normalization (pandas), Claude API calls. Internal-only, same VPC.
- **PostgreSQL** — RLS for tenant isolation; `pgcrypto` for column encryption (name/DOB/diagnosis); JSONB for flexible clinical data.
- **S3-compatible storage** — SSE-KMS, per-tenant KMS keys, pre-signed URLs only.
- **Anthropic Claude API (BAA)** — long-context analysis + structured output. System prompts are PHI-free and version-controlled in `prompts/`.

**Stack pins** (`apps/web/package.json`): Next 14.2.x, React 18.3, `@anthropic-ai/sdk` ^0.90, `pg` 8.13, `zod` ^4, Tailwind 3.4, Playwright + Vitest. Do not change without a documented upgrade PR.

### 4.2 Data Model (core entities, `ARCHITECTURE.md`)

`tenants`, `practitioners`, `patients` (`intake_data` JSONB), `records` (`structured_data` JSONB, `processing_status`), `analyses` (provenance: `model_id`, prompt version, `input_record_ids`, `token_usage`, encrypted `raw_ai_response`), `protocols` (`content` JSONB, `version`, `status`), `audit_log` (append-only). Intake media: `intake_documents`, `document_chunks`, `processing_jobs` (companion PRD §4). Every PHI table carries `tenant_id` and is governed by RLS.

### 4.3 Modularity Standards

| ID | Requirement | Acceptance |
|---|---|---|
| MOD-1 | Vertical-slice layout per feature: `page.tsx` (server, SSR of PHI) · `actions.ts` (`"use server"`, auth + audit + timeline) · `<feature>-view.tsx` (client island) · `sections/*.tsx` · shared types in `lib/<feature>-schema.ts` (pg-free for client import). | Slice contains its own UI/action/types; no cross-slice deep imports. |
| MOD-2 | 500-LOC limit. Add a `loc-check` step to `.github/workflows/validate.yml` that fails the build on any tracked source file > 500 LOC; mirror in a pre-commit hook; encode the rule in the repo Cursor config so AI-assisted edits self-limit. | CI fails on violation; KPI-5 = 0. |
| MOD-4 | Client components import **types only** from `*-schema` modules (never `pg`) to keep DB/PHI code out of the browser bundle (existing split: `lib/intake.ts` server-only vs. `lib/intake-schema.ts` shared). | Browser bundle contains no `pg`. |
| MOD-5 | One shared `formatTimelineForPrompt()` used by both analysis and protocol generation. | No duplicate timeline formatters. |

**Known debt to refactor (template):** `intake-hub/intake-hub.tsx` is ~961 LOC (violates MOD-2). Split into: `intake-hub.tsx` (orchestrator < 150), `transcript-paste.tsx`, `file-upload.tsx`, `practitioner-note.tsx`, and `prep-brief/{prep-brief.tsx, prep-brief-view.tsx, prep-brief-types.ts}`. P1.

### 4.4 Ventive Branding — Token Contract (`globals.css` + `tailwind.config.ts`)

| Group | Tokens | Intent |
|---|---|---|
| Surfaces | `canvas` (stone-50), `surface`, `surface-sunken` | Calm, low-glare clinical |
| Ink | `ink`, `ink-muted`, `ink-subtle`, `ink-faint`, `ink-inverse` | Stone-900 base, never pure black |
| Lines | `line`, `line-strong` | Hairline structure |
| Accent | `accent` (muted teal `#0F4C47`), `accent-hover`, `accent-soft` | Clinical, trustworthy, not loud |
| Semantic | `danger`, `warning`, `success` (+ `-soft`) | Status, readiness, safety flags |
| Type | Serif (`--font-serif`) for h1/h2; sans for body; scale `xs…2xl` | Editorial-clinical voice |
| Shape | radii `sm 4 / md 6 / lg 8 / xl 12`; `shadow-sm`, `shadow-focus` | Soft, consistent |
| A11y | Visible `:focus-visible` ring (2px accent, 2px offset) | Keyboard-first |
| Print | Branded, chrome-stripped print styles | On-brand protocol/brief/intake PDFs |

| ID | Requirement | Acceptance |
|---|---|---|
| MOD-3 | All components use tokens; no raw hex. Headings use the serif token. Exported PDFs carry Ventive identity. Print stylesheet verified for protocol, prep-brief, intake-review. | Grep finds no hex in components; visual + print check pass. |

### 4.5 Engineering Quality Bar

| ID | Requirement |
|---|---|
| NFR-1 | Validate all external input (forms, API bodies, **LLM JSON output**) with Zod before use/persistence. Never store unvalidated LLM output as truth; on parse failure, bounded retry then flag. |
| NFR-2 | Ingestion stages are idempotent and retry-safe via a `processing_status` state machine; failures flagged for manual review. |
| NFR-3 | Synthetic data only in dev/staging; PHI exists only in production. |
| NFR-4 | Tests: Vitest (unit — schema validation, readiness logic, LOC check, no-PHI-in-notification); Playwright (E2E — guided pipeline happy path, readiness gate blocking, MFA login, session timeout/revocation, cross-tenant denial). |

---

## 5. Security, Privacy & HIPAA Compliance Matrix

### 5.1 Control Matrix (binding)

| ID | Area | Requirement | Implementation | Verification |
|---|---|---|---|---|
| SEC-1 | **BAA** | Signed BAA with every PHI subprocessor before any PHI flows | Anthropic, AWS, any transcription/OCR vendor (companion PRD §4) | Subprocessor register checked each release |
| SEC-2 | **MFA** | Mandatory MFA for all clinician accounts | Auth.js v5, DB-backed sessions, TOTP | E2E: login without MFA rejected |
| SEC-3 | **Encryption at rest** | AES-256 | RDS disk + `pgcrypto` columns (name/DOB/diagnosis/extracted text); S3 SSE-KMS, per-tenant keys | Encrypted-column test; KMS policy audit |
| SEC-4 | **Encryption in transit** | TLS 1.2+ everywhere incl. Next↔Python | Edge TLS + private VPC | TLS scan in CI/CD |
| SEC-5 | **Tenant isolation** | One tenant cannot read another's data even with an app bug | PostgreSQL RLS on `tenant_id`; `app.current_tenant_id` set per connection | Cross-tenant query returns zero rows |
| SEC-6 | **RBAC** | Least privilege by role | Owner / Practitioner / Viewer / Coach enforced at middleware + handler + RLS | Authorization test per role |
| SEC-7 | **Audit logging** | Append-only log of every PHI access (who/what/when/where) | `audit_log` (no UPDATE/DELETE grant); read-only role for the viewer; 6-year retention | Tamper test; retention check |
| SEC-8 | **Sessions** | 15-min inactivity timeout (configurable per tenant); instant server-side revocation | DB sessions (not JWT) | Timeout + revocation E2E |
| SEC-9 | **Data minimization** | Expose minimum PHI | Pre-signed URLs; SSR of PHI (NFR-0); no PHI in logs/errors/client storage | Log-scrub + client-bundle PHI scan |
| SEC-10 | **PHI ⟂ Notifications** | Notifications contain **zero PHI** | §5.2 | Automated assertion on notification payload |
| SEC-11 | **File safety** | Validate, scan, store outside web root | Magic-byte check, AV scan, S3, quarantine | Malicious-file corpus test |
| SEC-12 | **AI provenance** | Every AI output reproducible | `analyses` stores `model_id`, prompt version, inputs, token usage, encrypted raw response | Provenance present per row |

### 5.2 PHI ⟂ Notification Separation (SEC-10, hard guardrail)

| ID | Requirement |
|---|---|
| SEC-10a | Notifications (email/SMS/push) carry **no PHI** — no names, symptoms, diagnoses, lab values, medications, or protocol content. Allowed: "You have a new message," "Your intake is ready." |
| SEC-10b | Notifications contain only an opaque, tenant-scoped resource reference requiring authenticated, MFA'd login to view PHI. |
| SEC-10c | Notification dispatch is its own slice with a payload type that **structurally cannot hold PHI** (`Notification = { kind, actorDisplayName?, resourceRef, timestamp }`). A unit test asserts the type has no PHI fields. |
| SEC-10d | Third-party notification providers never receive PHI. |

### 5.3 Authorization Matrix (per tenant)

| Role | Patients | Records | Analysis | Protocols | Tenant settings |
|---|---|---|---|---|---|
| Owner | CRUD | CRUD | Run/View | CRUD | Full |
| Practitioner | CRUD (own) | CRUD (own patients) | Run/View (own) | CRUD (own) | View |
| Viewer | Read (assigned) | Read (assigned) | View (assigned) | Read (assigned) | None |
| Coach (supervised) | Read/limited write (assigned) | Read | View | **No finalize** | None |

---

## 6. Quality Assurance & UX Testing

Front-end-intensive surfaces (intake, protocol review/edit) are prototyped and usability-tested **before** full build.

### 6.1 Prototype-First

| ID | Requirement |
|---|---|
| QA-1 | For any new front-end-intensive surface, build a clickable, Ventive-branded prototype (real design tokens) before backend commitment. |

### 6.2 Think-Aloud Testing Protocol (the standard)

| ID | Requirement |
|---|---|
| QA-2 | **Prepare** the interview script and task scenarios beforehand (e.g., "new patient on a phone — complete your intake"; "clinician — review/correct this intake, then decide if you can generate a protocol"). |
| QA-3 | **Recruit** 1–2 representative users per iteration (a real practitioner; a proxy patient). Small-N is intentional. |
| QA-4 | **Run:** the user vocalizes their thoughts while navigating; the facilitator stays neutral ("What are you thinking now?"). |
| QA-5 | **Record** sessions (with consent). Synthetic data only — never real PHI. |
| QA-6 | **Observe** for navigation dead-ends, confusing layouts, hesitation, wrong mental models, drop-off. |
| QA-7 | **Iterate** (fix → re-test with 1–2 users) until tasks complete unaided. |
| QA-8 | **Exit criteria:** ≥ 80% of core tasks completed without help (KPI-6); no task-blocking usability issues open. |

### 6.3 Compliance & AI Regression

| ID | Requirement |
|---|---|
| QA-9 | Encode §5 controls as automated checks where feasible (TLS scan, log-scrub, RLS, audit-immutable, no-PHI-in-notification). |
| QA-10 | Maintain a golden-set of protocols compared against hand-written references (the `PROTOCOL-GAP-ANALYSIS` method); run on every prompt change. |

---

## 7. Open Decisions & Out of Scope

Each open decision has a **default** so execution is never blocked. Implement the default unless a stakeholder overrides it.

| ID | Decision | Default (implement this) |
|---|---|---|
| OQ-1 | Single vs. dual protocol output. Hand-written reference protocols are a **single** patient-facing document, while the engine produces two. | **Option C:** generate the clinical protocol (Output A) for review; on approval, generate **one** warm, clinically specific patient document. Keep Output A/B internally; merge at delivery. |
| OQ-2 | Phase progression model. | **Layers, not calendar weeks:** phases advance on symptom improvement ("when you notice X, begin the next layer"), not fixed dates. Update protocol prompt. |
| OQ-3 | Protocol day-structure. | Organize each phase around the patient's day (morning / first meal / midday / evening), with supplement timing relative to meals. |
| OQ-4 | Practitioner product preferences. | Inject each practitioner's preferred products into the protocol prompt as context; long-term, populate the clinical knowledge base. |
| OQ-5 | Scale to all clinicians. | Add a conventional-medicine framing toggle + scope-of-practice gating per discipline; keep functional-health as the default profile. |

### 7.1 Out of Scope (MVP)

Patient portal/login (beyond the intake link), wearable integrations, FullScript/Rupa Health, real-time messaging, multi-practitioner team features, automated lab reordering, course hosting, payment/practice management. Documented for Phase 2; not built now.

---

## Appendix — Glossary

| Term | Meaning |
|---|---|
| PHI | Protected Health Information (HIPAA) |
| BAA | Business Associate Agreement |
| RLS | PostgreSQL Row-Level Security |
| Output A / B | Clinical Protocol (practitioner) / Phased Client Action Plan (patient) |
| Readiness Gate | Data-completeness checkpoint blocking high-confidence protocols on incomplete data |
| Vertical slice | Feature-owned bundle of UI + action + data + types |
| Ventive branding | Ventive design system, implemented here as design tokens |
