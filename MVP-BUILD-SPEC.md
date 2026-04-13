# Clinical Signal — MVP Build Specification

**Purpose:** This document maps the real-world practitioner workflow to the technical architecture in ARCHITECTURE.md. It is the primary reference for building the MVP.

**Target User:** Solo high-touch functional health practitioner onboarding 5-15 new patients per month and managing dozens to hundreds of patients across 4-6 month engagements. Each patient gets daily messaging and 2-4 monthly calls.

**Core Value:** Labs in → clinical protocol + phased client action plan out, in minutes instead of hours. The protocol engine removes the bottleneck that caps how many clients a practitioner can serve.

**Full Vision (beyond MVP):** An ongoing patient engagement portal with real-time device integration (Whoop, Apple Health, Oura Ring), historical trend visualization, 2-way practitioner-patient feedback, and continuous monitoring. See Phase 2 Vision section below.

---

## Workflow-to-Architecture Mapping

Each step below shows what the practitioner does, what the system does, and which components from ARCHITECTURE.md are involved.

### Step 1: Onboarding and Intake

**What the practitioner does:** Creates a new patient, has them fill out intake forms covering current symptoms, health history, lifestyle factors, health goals, previous lab work.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/patients/` — new patient form and patient list
- **Backend:** Next.js Server Actions for form submission (CSRF-protected)
- **Database:** `patients` table (name_encrypted, dob_encrypted via pgcrypto), `records` table with `record_type = intake_form`, intake data stored as JSONB in `patients.intake_data`
- **Security:** All writes create audit_log entries. RLS ensures tenant isolation.

**Intake form sections (from Dr. Laura):**
- Current symptoms and severity
- Health history and timeline
- Current medications and supplements
- Previous diagnoses
- Lifestyle: sleep patterns, nutrition, exercise, stress levels, daily routine
- Health goals (what they want to achieve)
- Previous lab work (any historical results they can share)
- Wearable data summary (if they track anything)

### Step 2: Lab Ordering Guidance

**What the practitioner does:** Reviews intake data and decides which labs to order.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/patients/[id]/labs/` — lab suggestion view
- **Backend:** Next.js API route calls Python analysis engine
- **Analysis Engine:** `services/analysis-engine/app/analyzer/` — Claude API call with intake data, using a lab-suggestion system prompt from `prompts/`
- **Output:** Suggested lab panels with reasoning, displayed as a recommendation the practitioner can accept/modify

**Domain note:** Some practitioners customize per patient based on symptoms. Others have standard panels for everyone. The suggestion is always advisory — practitioner decides.

### Step 3: Foundational Period (While Waiting for Labs)

**What the practitioner does:** Assigns foundational work (sleep, nutrition, mindset, habits) for the 1-3 weeks while labs are processing.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/patients/[id]/foundations/` — checklist builder
- **Database:** Stored as structured JSONB in a patient record with `record_type = foundational_plan`
- **Scope:** Simple checklist with topic names, descriptions, and completion status. No video hosting, no course platform.

**Topics (from Dr. Laura):**
- Sleep hygiene and schedule optimization
- Nutrition fundamentals and dietary adjustments
- Hydration
- Stress management and mindset
- Movement and exercise
- Environmental factors (light exposure, toxin reduction)

### Step 4: Lab Upload and Extraction

**What the practitioner does:** Uploads PDF lab results when they arrive.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/patients/[id]/records/` — upload interface
- **Upload flow (from ARCHITECTURE.md):**
  1. Server Action validates file (PDF type, 50MB limit, antivirus scan)
  2. File streamed directly to S3 (never on app server disk)
  3. `records` row created with `processing_status = pending`
- **Python Pipeline:** `services/analysis-engine/app/pipeline/`
  1. Validate: verify magic bytes match PDF
  2. Extract: PyMuPDF for text-layer PDFs, pytesseract for scanned
  3. Structure: Claude API call to extract lab name, value, reference range, flag into typed JSONB
  4. Store: `records.structured_data` populated, status → complete
- **Lab Review:** Practitioner sees extracted values in a table, can correct any AI extraction errors before proceeding

### Step 5: Protocol Generation (The Core Feature)

**What the practitioner does:** Clicks "Generate Protocol" after reviewing lab results.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/protocols/` — generation trigger, side-by-side view of both outputs
- **Backend:** Next.js API calls Python analysis engine
- **Analysis Engine:** `services/analysis-engine/app/analyzer/`
  1. Gather all patient data: intake JSONB + all structured records
  2. Assemble chronological clinical timeline
  3. Send to Claude API with clinical analysis system prompt
  4. Parse response into typed findings → store in `analyses` table
  5. Generate protocol from findings → store in `protocols` table

**Two required outputs:**

**Output A — Clinical Protocol (practitioner-facing):**
Stored in `protocols.content` as structured JSONB with sections:
- Summary of findings
- Systems analysis (how body systems are interconnecting)
- Dietary recommendations
- Supplement protocol (names and dosages, no FullScript integration yet)
- Lifestyle modifications
- Lab re-testing recommendations
- Follow-up timeline

**Output B — Phased Client Action Plan (patient-facing):**
Stored alongside Output A in `protocols.content` JSONB. Structured as phases:
- Phase 1 (Weeks 1-4): What to start with, why this comes first, how it connects to goals
- Phase 2 (Weeks 4-8): What to add, what to continue, progress expectations
- Phase 3 (Weeks 8-12): Next layer of interventions
- Each phase in warm, clear language with specific actionable steps
- **Desired outcomes for each phase** — the patient should see what they're working toward and what to expect. Knowing the expected outcome increases compliance and leverages the placebo effect. Example: "By the end of Phase 1, many patients notice improved energy and reduced bloating as gut function stabilizes."

**Critical AI requirements for the system prompt:**
- Think in functional health systems, not conventional medicine silos
- Understand clinical sequencing (e.g., address HPA axis and gut before hormones)
- Recognize interconnections between body systems
- Phase the plan to prevent patient overwhelm
- Include expected outcomes for each phase so the patient knows what they're working toward
- Include reasoning so the practitioner can evaluate the AI's clinical thinking
- Flag areas of uncertainty — the AI should say "consider further evaluation" rather than guess

**Database:** `analyses` table records input_record_ids, model_id, token_usage, and raw_ai_response for full provenance. `protocols` table stores versioned content with draft/review/finalized status.

### Step 6: Practitioner Review and Edit

**What the practitioner does:** Reviews both AI outputs side by side, edits based on their clinical judgment, finalizes.

**System components:**
- **Frontend:** `apps/web/app/(dashboard)/protocols/[id]/edit/` — rich text editor for both outputs
- **Backend:** Protocol updates increment `protocols.version`. Previous versions retained.
- **Audit:** Every edit logged with who, what, when.

### Step 7: Protocol Export

**What the practitioner does:** Generates a clean PDF to share with the patient.

**System components:**
- **Frontend:** Export button on finalized protocol
- **Backend:** PDF generation from protocol JSONB content
- **Storage:** Exported PDF stored in S3 under `/exports/` prefix
- **Output:** Clean, professional PDF with the practice branding. Two documents: one full clinical protocol, one client action plan with desired outcomes highlighted.

---

## Phase 2 Vision (Post-MVP)

These features are documented here so nothing gets lost. They ship after the MVP core is validated with real practitioners.

### Patient Portal
- Patient logs in to view their current protocol and phased action plan
- Sees historical data: past labs, previous protocols, progress over time
- Trend visualization: lab values charted over months/years showing improvement
- 2-way feedback with practitioner (structured check-ins, not free-form messaging)
- Protocol compliance tracking (did they complete Phase 1 tasks?)

### Wearable and Device Integration
- Connect Whoop, Apple Health, Oura Ring, continuous glucose monitors
- Import sleep, HRV, activity, heart rate, cycle tracking data
- Display current stats, historical trends, and correlation with protocol phases
- AI can factor wearable data into protocol adjustments at follow-up

### Practice Integrations
- FullScript integration for supplement ordering directly from protocols
- Rupa Health integration for lab ordering within the platform
- Automated lab re-ordering reminders based on protocol timeline

### Team and Scale Features
- Multi-practitioner support within a single practice
- Role-based access for coaches, support staff, and associate practitioners
- Practitioner-to-practitioner referral and case sharing

### Communication
- HIPAA-compliant messaging between practitioner and patient
- AI-assisted triage of patient messages (is this urgent or routine?)
- Automated check-in prompts based on protocol phase

---

## Competitive Analysis

### Practice Better

**What it is:** The leading practice management platform for functional health and wellness practitioners. HIPAA-compliant EHR with messaging, telehealth, intake forms, and supplement dispensary.

**Pricing:** Free tier (3 clients), then $25-$145/month scaling with practitioner capacity.

**Strengths:** Strong lab integration with Rupa Health and FullScript (results auto-populate into patient charts). Centralized client communication. Automated intake reminders and invoicing. HIPAA-compliant messaging. Practitioners like the ability to manage protocols and track client progress in one system.

**Weaknesses:** Dr. Laura described it as "spotty — sometimes it works, sometimes it doesn't." Common complaints include unreliable video calls, poor customer support, steep UI learning curve for patients, and difficulty configuring multi-practitioner teams. Invoicing and dispensary limited in some regions.

**AI capabilities:** Minimal. A recent "Food Plans powered by Rupa AI" feature suggests early exploration, but no AI-driven protocol generation or clinical analysis.

**Patient portal:** Basic — patients can view progress but limited functionality.

**Wearable integration:** Not a focus area. No meaningful wearable data integration.

**Clinical Signal's advantage:** Practice Better manages existing protocols but cannot generate them. It's a filing cabinet. Clinical Signal is the brain that creates the protocol in the first place. The two could eventually be complementary (Clinical Signal generates, Practice Better manages ongoing care) or Clinical Signal could replace it entirely by adding practice management features in Phase 2.

### Malla

**What it is:** A newer platform (founded ~2023) built specifically for functional medicine practitioners. Created by Morris Esformes.

**Pricing:** $65/month consumer-facing membership. B2B practitioner pricing not publicly disclosed.

**Strengths:** Purpose-built for functional medicine workflows rather than adapted from general medical software. Access to 3,000+ functional medicine lab tests. Integrates with Rupa and FullScript.

**Weaknesses:** Limited public information suggests early stage. No visible AI protocol generation. No mention of audit logging or advanced compliance features. No wearable integration mentioned.

**AI capabilities:** None visible. Focuses on practitioner-managed plans, not AI-generated outputs.

**Patient portal:** Yes — members access personalized plans, messaging, and tracking.

**Clinical Signal's advantage:** Malla is the closest philosophical competitor (built for functional medicine from the ground up) but lacks the AI protocol generation engine. Worth monitoring closely as they grow.

### Kajabi

**What it is:** An all-in-one online business platform for website building, email marketing, course hosting, coaching programs, digital product sales, and community. Not designed for healthcare.

**Pricing:** $179-$499/month. No transaction fees.

**Why practitioners use it:** Many functional health practitioners use Kajabi because it handles their business layer — website, email lists, online courses, payment processing — in one place. They position themselves as both clinicians and educators, selling courses alongside clinical services.

**Critical limitation:** Kajabi is explicitly NOT HIPAA-compliant and states it never will be. It forbids storing patient health information. This is a hard blocker for any clinical data.

**What it lacks for clinical use:** No patient records, no intake forms, no lab management, no protocol generation, no audit logging, no encryption for PHI, no session management for healthcare. Zero clinical functionality.

**The practitioner's reality:** Most end up using Kajabi (marketing/courses) + Practice Better (patient management) + Google Drive (overflow storage). They hate having patients on multiple platforms. A patient applies through Kajabi's website but then needs a separate Practice Better portal login.

**Clinical Signal's advantage:** Clinical Signal can eventually replace the clinical side entirely. It does not compete with Kajabi's marketing/course features — those are out of scope. But by being the single place for clinical work, it eliminates one of the multiple logins practitioners currently juggle.

### Competitive Summary

| Capability | Practice Better | Malla | Kajabi | Clinical Signal (MVP) |
|-----------|----------------|-------|--------|----------------------|
| HIPAA compliant | Yes | Likely | No (never) | Yes |
| Intake forms | Yes | Yes | No | Yes |
| Lab integration | Yes (Rupa, FullScript) | Yes | No | PDF upload + AI extraction |
| AI protocol generation | No | No | No | Yes (core feature) |
| Phased client action plans | No | No | No | Yes (core feature) |
| Patient portal | Basic | Yes | No | Phase 2 |
| Wearable integration | No | No | No | Phase 2 |
| Course/content hosting | No | No | Yes | No (not in scope) |
| Marketing/email | No | No | Yes | No (not in scope) |

**The gap:** Nobody does AI-driven protocol generation with phased client-facing output. This is Clinical Signal's moat.

---

## Database Schema Notes

The ARCHITECTURE.md data model covers all MVP needs. Key additions for the MVP build:

- `patients.intake_data` JSONB should follow a defined schema matching the intake form sections above
- `protocols.content` JSONB needs sub-keys for `clinical_protocol` and `client_action_plan`
- `client_action_plan` must include `desired_outcomes` per phase
- `records` with `record_type = foundational_plan` stores the assignable checklist
- Synthetic seed data should include realistic functional health scenarios (perimenopausal woman with gut issues, pediatric allergy patient, athlete with hormone optimization goals, etc.)

## Design Principles

- The interface should feel simpler than Practice Better, not more complex
- A practitioner managing 50+ active patients should never feel overwhelmed by the dashboard
- A practitioner should go from "labs arrived" to "protocol sent" in under 30 minutes
- The AI is a tool — the practitioner always has final say
- Phased client plans use warm, clear language a patient will actually follow
- Every phase includes desired outcomes so the patient knows what to expect
- Security is built in from Sprint 1, not bolted on later
- One feature at a time, fully tested before moving to the next
