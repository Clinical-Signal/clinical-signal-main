# Clinical Signal — End-to-End Intake & LLM PRD

| Field | Value |
|---|---|
| **Document** | `clinical_signal_intake_llm_prd.md` |
| **Companion** | `clinical_signal_general_prd.md` (platform, architecture, compliance, QA) |
| **Status** | v1.1 — approved-pending |
| **Scope** | Patient-facing hybrid LLM intake · call transcription · data-integrity safeguards |
| **Binding constraints** | Vertical-slice modularity · **500 LOC/file** · Ventive branding tokens · HIPAA (BAA, MFA, audit, encryption, **PHI⟂notifications**) — see general PRD §0, §4, §5 |

> **How to use this PRD:** Requirements have stable IDs (`P-*` patient, `C-*` clinician, `S-*` system, `LLM-*`, `TR-*` transcription, `GATE-*`, `API-*`). Acceptance criteria are testable. File paths are relative to `apps/web/`. Build order is in the Appendix.

---

## 1. Objective & Scope

### 1.1 Objective

Deliver a **frictionless, mobile-responsive patient intake** that captures the medical history, background, demographics, and lifestyle factors needed for a high-confidence protocol — without overwhelming the patient. The core innovation is a **hybrid LLM intake**: a light traditional form, then an LLM that reads the answers, identifies specific issues, and asks **dynamic, targeted secondary questions** — depth only where warranted.

### 1.2 Central Trade-off This Resolves

Comprehensive data gathering (full history, labs) conflicts with minimizing patient friction. Long static forms get abandoned; thin forms starve the protocol engine. The hybrid model resolves it: start light, go deep **conditionally**.

### 1.3 In Scope

- Patient-facing, mobile-first intake the patient completes themselves.
- Two-step hybrid flow: light form → LLM-triggered dynamic deep dives.
- Secure storage into `patients.intake_data` (JSONB) + `intake_documents`.
- Call transcription automation (eliminate manual data entry).
- Protocol-readiness checkpoints that prevent high-confidence protocols on incomplete data.
- Technical specs: LLM prompting, transcription routing, API contracts, schemas.

### 1.4 Out of Scope

Protocol generation internals (general PRD §3.6 + `prompts/protocol_generation_v1.md`); patient portal beyond the intake link; wearables; messaging; scheduling/billing.

### 1.5 Current State (this is net-new)

Today's intake is **practitioner-entered**: the form lives behind `requireAuth()` at `app/(dashboard)/dashboard/patients/[id]/intake/` and is filled by the clinician. There is **no** patient-facing intake and **no** dynamic LLM follow-up in the codebase. This PRD specifies that new patient-facing, LLM-driven experience while reusing the existing `patients.intake_data` store, audit, and timeline plumbing.

---

## 2. User Stories

### 2.1 Patient-Facing

| ID | Story | Acceptance |
|---|---|---|
| P-1 | Complete intake on my phone in one sitting. | Fully responsive ≥ 320px; thumb-reachable controls; no horizontal scroll. |
| P-2 | Start with a short, light form. | Step 1 ≤ ~5 min median; progress indicator; save & resume. |
| P-3 | Only answer deep questions relevant to me. | Deep dives appear **only** when triggered by my Step-1 answers. |
| P-4 | Answer follow-ups in plain language (type or pick). | Mixed input (chips/sliders + free text); LLM interprets free text. |
| P-5 | Upload labs/photos easily, or skip. | Mobile camera/file upload; skippable without penalty; clearly optional. |
| P-6 | Save and come back. | Resumable via secure link; partial state persisted. |
| P-7 | Trust my data is private. | Plain-language privacy notice; no PHI in any notification (SEC-10). |
| P-8 | Know how far along I am. | Section progress + estimated time remaining. |

### 2.2 Clinician-Facing (intake intersection)

| ID | Story | Acceptance |
|---|---|---|
| C-1 | Send a patient a frictionless intake link. | Generate tenant-scoped, expiring link from the patient record. |
| C-2 | Review and revise patient-submitted intake. | Read → edit; provenance tags; audited (general PRD §3.3). |
| C-3 | See what the LLM inferred vs. what the patient said. | AI-derived fields flagged "confirm"; excluded from readiness until confirmed. |
| C-4 | Be told when there is not enough data for a confident protocol. | Readiness gate blocks/caps with a specific gap list (§5). |

### 2.3 System-Facing

| ID | Requirement | Acceptance |
|---|---|---|
| S-1 | Classify Step-1 answers into candidate issues (e.g., faintness, insomnia, digestive, hormonal, autoimmune, medication-detail gaps). | Issues produced via deterministic map + LLM augmentation; mapped to deep-dive triggers. |
| S-2 | Generate targeted secondary questions per issue. | Questions schema-validated before render; count bounded by a friction budget. |
| S-3 | Route uploaded media to the correct processor by type. | Type detected by magic bytes; correct worker invoked; status tracked. |
| S-4 | Auto-transcribe call recordings into stored intake/timeline data. | No manual transcription; transcript stored as `intake_documents` + chunks. |
| S-5 | Compute a protocol-readiness assessment and gate generation. | Generation disabled/capped below threshold; gaps enumerated (§5). |
| S-6 | Persist provenance for every datum (patient / clinician / AI). | Provenance queryable; shown in review UI. |
| S-7 | Emit audit + timeline events per write; never leak PHI to notifications. | Audit row per write; notification payloads structurally PHI-free. |

---

## 3. The Hybrid LLM Intake Flow

```
STEP 1 — LIGHT FORM (mobile, ≤ ~5 min)
  About You · Why You're Here · Symptoms (severity/duration/trajectory) · light lifestyle snapshot
        │ submit
        ▼
LLM ANALYSIS (server, Claude/BAA, structured output)
  1) read Step-1  2) identify specific issues  3) map issues → deep-dive modules
  4) return an ordered, bounded, schema-validated question plan
        │
        ▼
STEP 2 — DYNAMIC TARGETED QUESTIONS
  render ONLY triggered deep dives · mixed controls + free text · optional uploads
  → merge into patients.intake_data with provenance
```

### 3.1 Step 1 — Light Form

Source content: `Intake-Question-Map-Draft` Sections 1–3 + a light lifestyle snapshot.

| ID | Requirement |
|---|---|
| P-1.1 | **About You:** full name, DOB, sex at birth, gender identity (optional), height/weight, location (state — drives licensing + lab availability). |
| P-1.2 | **Why You're Here:** "In your own words, what brings you here?"; top 3 goals; self-rated health (1–10); motivation (1–10). |
| P-1.3 | **Current Symptoms:** multi-select checklist; per checked symptom capture severity (1–10), duration (weeks / months / 1–2 yr / 3+ yr / lifelong), trajectory (better / worse / same). |
| P-1.4 | **Lifestyle snapshot (light):** average sleep hours, diet style, stress (1–10). Full lifestyle depth deferred to Step 2 only if signals warrant. |
| P-1.5 | UX: one concept per mobile screen; large tap targets; inline validation; per-field autosave (reuse `saveSectionAction` pattern in `intake/actions.ts`); visible progress; save & resume. |

### 3.2 LLM Analysis — Issue Identification → Triggering

After Step-1 submit, the server calls Claude (BAA) with a PHI-free system prompt + Step-1 answers as the user message, requesting **JSON only**.

**Deterministic base triggers (must always fire when the signal is present):**

| Step-1 signal | Unlocks |
|---|---|
| Digestive symptoms | **Gut Deep Dive** (Bristol habits, bloating patterns, GI dx, prior GI testing, antibiotic/PPI history, elimination trials) |
| Hormonal symptoms | **Hormone Deep Dive** (cycle, PMS, menopause status, HRT, thyroid, PCOS/endo/fibroids, prior testing, birth control) |
| Autoimmune | **Immune Deep Dive** (condition, dx date, treatment, flare triggers, illness frequency, mold/tick history) |
| Meds/supplements listed | **Medication detail follow-ups** ("vitamin D — what dose? with K2?") |
| Sauna/cold/meditation = yes | **Wellness-practice specifics** (type, frequency, duration, temperature) |
| Prior/concerning labs | **Previous-labs follow-ups** + upload prompt |

| ID | Requirement |
|---|---|
| LLM-1 | Identify specific, named issues (incl. examples like *faintness*, *insomnia*) with the supporting evidence from Step-1. |
| LLM-2 | Map issues → deep-dive modules using the deterministic table above (guarantees clinically essential branches), then **augment** with LLM-identified modules for the long tail (e.g., faintness → orthostatic / blood-sugar screen). |
| LLM-3 | Generate a small set of high-yield secondary questions per issue, each with a render type and a one-line reason. |
| LLM-4 | Enforce a **friction budget** (e.g., ≤ N questions/module, ≤ M total Step-2 screens); prioritize must-have; defer nice-to-have to the first call. |

**Why hybrid (deterministic + LLM):** the deterministic map guarantees safety-critical branches always appear; the LLM adds nuance and catches what the static map misses. This prevents both over-asking and under-asking.

### 3.3 Step 2 — Dynamic Targeted Questions

| ID | Requirement |
|---|---|
| P-3.1 | Render **only** triggered modules. A patient with no triggering signals sees a minimal/empty Step 2. |
| P-3.2 | Mixed input: structured controls where faster (chips, sliders, Bristol selector, date pickers) + free text where nuance matters. |
| P-3.3 | Optional uploads (lab PDFs, supplement-bottle photos via mobile camera). Always skippable; never a hard gate at intake time. |
| P-3.4 | Merge answers into `patients.intake_data` (shallow JSONB merge, like `saveIntakeSection`); tag patient answers `source: patient`; tag LLM interpretations `source: ai` and flag for clinician confirmation (C-3). |

### 3.4 Branding & Accessibility

| ID | Requirement |
|---|---|
| P-4.1 | The entire flow uses Ventive design tokens (general PRD §4.4): `canvas`/`surface`/`ink`, muted-teal `accent` (`#0F4C47`), serif headings, consistent radii, visible focus ring. |
| P-4.2 | Mobile-first; WCAG-AA contrast; keyboard + screen-reader friendly; honor reduced-motion. No raw hex in components. |

---

## 4. Call Transcription Automation

**Goal:** auto-transcribe patient calls to eliminate manual data entry and feed clinical nuance into the record. Builds on the existing intake-hub (pasted transcripts + file uploads) by adding automatic audio/video transcription. Reuses the pipeline in `Dynamic-Intake-Architecture.md`.

### 4.1 Type-Routed Async Pipeline

```
Upload (audio/video/pdf/docx/image)
  POST /api/patients/[id]/intake-docs  → validate (magic bytes, size, AV scan) → 202 + job_id
  ├─ VIDEO → ffmpeg extract audio → transcription engine
  ├─ AUDIO → transcription engine (diarization if available)
  ├─ PDF   → PyMuPDF text → Textract fallback
  ├─ DOCX  → mammoth → text
  └─ IMAGE → OCR (Tesseract / Textract)
  → normalize {text, segments[], speakers[], confidence}
  → persist: intake_documents (+ document_chunks ~300 tok, + processing_jobs)
  → surface in Intake Hub (clinician flags low-confidence, edits, marks verified)
  → available to prep-brief + protocol generation via shared formatTimelineForPrompt
```

### 4.2 Transcription Routing & Vendor Strategy (HIPAA-driven)

| Tier | Engine | HIPAA posture | When used |
|---|---|---|---|
| Primary | **Local Whisper** (`faster-whisper`, self-hosted) | Local — no third party, **no BAA needed** | Default for all audio/video |
| Accuracy fallback | **AssemblyAI** (medical model) | **BAA required** | Practitioner-toggled "high-accuracy mode" |
| Premium | Deepgram Nova-3 Medical / Rev.ai | Enterprise BAA | Enterprise tier (deferred) |
| Docs/forms OCR | PyMuPDF → **Textract** fallback | Textract HIPAA-eligible, **BAA** | Scanned/complex PDFs only |

| ID | Requirement |
|---|---|
| TR-1 | Default to local Whisper so audio never leaves our infrastructure. |
| TR-2 | Any third-party engine requires a signed BAA on file before any PHI is sent (SEC-1). |
| TR-3 | Workers run in a private VPC, not public. |
| TR-4 | Raw media lifecycle: retain raw file ≤ 90 days; keep extracted text + chunks; all encrypted at rest. |
| TR-5 | Every third-party call (Textract/AssemblyAI) is audited. |
| TR-6 | Engine selection is a per-tenant/per-upload policy; switching to a BAA vendor is gated on a recorded BAA. |
| TR-7 | Jobs are idempotent and retry-safe (`processing_status` state machine); failures flagged for manual review. |
| TR-8 | Diarization (speaker labels) when supported; low-confidence spans flagged for clinician verification (existing `is_verified` / `corrections_made`). |

### 4.3 Critical Wiring (must-have)

| ID | Requirement |
|---|---|
| TR-9 | Transcript and note text **must** reach the protocol prompt. `PROTOCOL-GAP-ANALYSIS.md` Gaps #1/#2 show transcript nuance was captured but not passed to the model. Transcription is "done" only when its text flows through the shared `formatTimelineForPrompt()` into both analysis and protocol generation. |
| TR-10 | Pasted transcripts (Zoom/Meet/Otter) remain supported (existing `TranscriptPaste`). |

### 4.4 Data Model (existing, reused)

`intake_documents` (`file_type`, `s3_key`, `processing_status`, `extracted_text`, `metadata` JSONB, `is_verified`, `corrections_made`, `created_by`/`reviewed_by`); `document_chunks` (chunk text + token range / page / time range); `processing_jobs` (job audit). All tenant-scoped under RLS.

---

## 5. Data Integrity & Protocol-Generation Checkpoints

A deterministic, auditable **Protocol Readiness Gate** sits between "data collected" and "Generate Protocol." It computes a readiness assessment and enumerates the gaps — actively preventing high-confidence protocols built on incomplete information.

### 5.1 Readiness Inputs (checklist)

| Check | Signal | Weight |
|---|---|---|
| Step-1 intake complete | All required Step-1 sections present | Required |
| Triggered deep dives answered | Every unlocked deep dive completed (or clinician-skipped with reason) | Required |
| Medications detailed | Listed meds have dose/duration (follow-ups resolved) | High |
| Labs present or waived | Baseline labs uploaded **or** clinician records "proceeding without labs — foundational only" | High |
| Transcript / notes attached | ≥ 1 transcript or note present and verified | Medium |
| AI-derived fields confirmed | All `source: ai` fields confirmed/edited by clinician | Required for high confidence |
| Safety flags reviewed | Current meds, allergies, concerns acknowledged | Required |

**Gate output:**

```jsonc
{
  "readiness": "ready" | "partial" | "insufficient",
  "confidence_ceiling": "high" | "moderate" | "low",
  "blocking_gaps": ["No labs uploaded and not waived", "Hormone deep dive incomplete"],
  "non_blocking_gaps": ["No call transcript attached"],
  "can_generate": true | false
}
```

### 5.2 Safeguard Logic

| Readiness | Behavior |
|---|---|
| **insufficient** (a Required check fails) | "Generate Protocol" **disabled**. UI lists exact blocking gaps, each linking to the section that resolves it. No generation occurs. |
| **partial** (only High/Medium gaps) | Generation allowed but **capped at moderate/low confidence**. The protocol is labeled, and `areas_of_uncertainty` is force-populated from the gaps (aligns with `protocol_generation_v1.md` principle: flag uncertainty, don't paper over it). |
| **ready** | High-confidence generation permitted. |

| ID | Requirement |
|---|---|
| GATE-1 | The gate is **server-enforced**: the generate endpoint re-checks readiness and refuses to emit a `high`-confidence protocol when `confidence_ceiling < high`. UI disabling alone is never the safeguard. |
| GATE-2 | The protocol prompt is told its own confidence ceiling and instructed to recommend evaluations rather than assert (no confident guessing). |
| GATE-3 | Every gate evaluation is written to `audit_log` (`action: protocol_readiness_evaluated`, with the gap list) so a blocked/downgraded generation is defensible. |
| GATE-4 | The gate formalizes the existing prep-brief `data_completeness` object (`intake_complete`, `labs_available`, `documents_count`, `gaps`) into a binding pre-generation contract. |

---

## 6. Technical Specifications

### 6.1 LLM Prompting Strategy

PHI-free, version-controlled system prompts in `services/analysis-engine/prompts/`; PHI travels only in the user message; every call records `model_id` + prompt version for provenance.

**New prompts:**

| File | Role | Output |
|---|---|---|
| `prompts/intake_issue_identification_v1.md` | Step-1 → identify issues + map to deep-dive triggers | JSON: `identified_issues[]` + triggered modules |
| `prompts/intake_dynamic_questions_v1.md` | Per issue → bounded high-yield secondary questions | JSON: `question_plan[]` with render type + rationale |
| `prompts/intake_freetext_interpretation_v1.md` | Interpret patient free text → structured fields | JSON: extracted fields, each `source: ai` + confidence |

**Step-1 → question-plan contract (Zod-validated before render):**

```jsonc
{
  "identified_issues": [
    { "issue": "insomnia", "evidence": "sleep 4-5h, 'can't stay asleep', stress 8/10",
      "severity_hint": "moderate", "maps_to": ["sleep_deep_dive", "stress_deep_dive"] },
    { "issue": "faintness", "evidence": "'I get dizzy standing up'",
      "maps_to": ["orthostatic_screen", "blood_sugar_screen"] }
  ],
  "question_plan": [
    { "module": "sleep_deep_dive", "priority": "must",
      "questions": [
        { "id": "sleep_onset", "text": "How long does it take you to fall asleep?",
          "render": "chips", "options": ["<15 min","15-30","30-60",">60"],
          "why": "Differentiates onset vs. maintenance insomnia" },
        { "id": "wake_count", "text": "How many times do you wake at night?",
          "render": "slider", "min": 0, "max": 6, "why": "Sleep-maintenance signal" }
      ]
    }
  ],
  "friction_budget": { "max_modules": 4, "max_total_questions": 18 }
}
```

| ID | Requirement |
|---|---|
| LLM-5 | **Structured output only**: request JSON, parse against Zod; on parse failure, one bounded retry, then flag for manual handling. Never persist unvalidated output as truth. |
| LLM-6 | Enforce the `friction_budget` in the prompt; must-have questions first. |
| LLM-7 | **Clinical safety framing**: for red-flag symptoms (e.g., faintness, chest pain, severe weight loss), surface screening questions and a clinician-visible safety flag. Intake is decision-support, never diagnosis. |
| LLM-8 | Step-2 questions are neutral; no diagnosis shown to the patient. Interpretations are clinician-facing only. |
| LLM-9 | Prompts never echo patient identifiers (consistent with `protocol_generation_v1.md` PHI handling). |
| LLM-10 | Use prompt caching on the static system-prompt prefix to cut latency/cost on the high-frequency analyze call. |

### 6.2 Transcription Routing (spec)

```
detectType(file)  // magic bytes, not extension
  ├─ audio/video → (video? ffmpeg→audio) → engine = highAccuracyMode ? AssemblyAI(BAA) : LocalWhisper
  ├─ pdf  → tryPyMuPDF(); if textYield < 30% → Textract(BAA)
  ├─ docx → mammoth
  └─ image → OCR (Tesseract local; Textract for hard cases)
→ normalize → chunk(~300 tok) → embed(batch) → pgvector(HNSW) → persist
```

### 6.3 API Contracts

| ID | Endpoint | Method | Purpose |
|---|---|---|---|
| API-1 | `/api/intake/[token]` | GET | Load patient-facing intake by secure, expiring, tenant-scoped token (no PHI in the link). |
| API-2 | `/api/intake/[token]/section` | POST | Autosave a Step-1/Step-2 section (mirrors `saveSectionAction`; Zod-validated; provenance `patient`). |
| API-3 | `/api/intake/analyze` | POST | Run issue-identification → question plan (server-side Claude/BAA; returns schema-validated plan; never trusts client). |
| API-4 | `/api/intake/[token]/submit` | POST | Finalize intake (`submitIntake` → status `labs_pending`; audit + timeline). |
| API-5 | `/api/patients/[id]/intake-docs` | POST/GET | Upload (transcript/file/note) → 202 + job_id for async media, AV scan, type routing / list documents (existing). |
| API-6 | `/api/patients/[id]/prep-brief` | GET/POST | Existing prep brief; feeds readiness signals. |
| API-7 | `/api/patients/[id]/protocol-readiness` | GET | **New** — returns the §5.1 readiness JSON; consumed by review UI + generate gate. |
| API-8 | `/api/patients/[id]/generate-protocol` | POST | Generate Output A/B; **re-checks readiness server-side** (GATE-1); uses shared `formatTimelineForPrompt` incl. documents. |

| ID | Requirement |
|---|---|
| API-9 | Every endpoint enforces auth + tenant check (`requireAuth`, `patientBelongsToTenant`); RLS as defense in depth. |
| API-10 | Every mutation writes an `audit_log` row and a `PatientTimeline` event. |
| API-11 | Structured logging with PHI redaction; notification dispatch (if any) carries no PHI (SEC-10). |

### 6.4 Storage & Schema Touchpoints

| ID | Requirement |
|---|---|
| S-8 | Step-1/Step-2 answers → `patients.intake_data` JSONB. Extend `intake-schema.ts` with a `_provenance` map (field → `patient \| clinician \| ai`) and `_ai_confirmations` for clinician sign-off. |
| S-9 | Media/transcripts → `intake_documents` + `document_chunks` + `processing_jobs` (existing). |
| S-10 | Readiness evaluations are audit-logged; optionally cached on the patient row for fast UI. |

### 6.5 Modularity & Branding Conformance

| ID | Requirement |
|---|---|
| S-11 | Each surface is a vertical slice; **no file > 500 LOC**. Do not recreate the 961-line `intake-hub.tsx` anti-pattern — split Step 1, Step 2, each deep-dive module, the analyze client, and the readiness widget into small files. |
| S-12 | All UI uses Ventive tokens; mobile-first; AA contrast; visible focus ring; reduced-motion respected. |

### 6.6 Acceptance Criteria (Definition of Done)

| ID | Criterion |
|---|---|
| DoD-1 | A patient completes Step 1 on a 320px phone in ≤ ~5 min median; autosave + resume work. |
| DoD-2 | Submitting Step 1 yields a schema-valid question plan; deterministic triggers (gut/hormone/immune/meds) always fire when their Step-1 signals are present. |
| DoD-3 | A patient with no triggering signals sees a minimal/empty Step 2. |
| DoD-4 | Uploaded audio/video is auto-transcribed (local Whisper default), chunked, attached, and reaches the protocol prompt via the shared timeline function. |
| DoD-5 | The Readiness Gate blocks generation when a Required check fails and caps confidence on partial data; the server (not just UI) enforces it; the evaluation is audited. |
| DoD-6 | Clinician can review patient intake, see provenance, confirm/edit AI-derived fields, and revise — all audited. |
| DoD-7 | No notification contains PHI; an automated test asserts the notification payload type cannot hold PHI. |
| DoD-8 | Every new file ≤ 500 LOC; CI LOC gate green; UI uses only design tokens. |

---

## Appendix — Build Order

1. Patient-facing Step-1 form (responsive slice) + secure intake-link/token + autosave/resume. *(P-1.x, API-1, API-2)*
2. `intake_issue_identification_v1` prompt + `/api/intake/analyze` + Zod plan schema. *(LLM-1…5, API-3)*
3. Step-2 dynamic renderer + deep-dive modules (gut / hormone / immune / meds / sleep / stress). *(P-3.x)*
4. Protocol Readiness Gate (`/api/patients/[id]/protocol-readiness`) + server-side enforcement in generate-protocol. *(GATE-1…4, API-7, API-8)*
5. Auto-transcription worker (local Whisper) wired through shared `formatTimelineForPrompt`. *(TR-1…10)*
6. Clinician review/revision provenance UI + AI-field confirmation. *(C-2, C-3, S-8)*
7. Harden: audit coverage, PHI-free notification boundary test, LOC/CI gates, think-aloud round on the mobile flow. *(API-9…11, DoD-7, DoD-8)*
