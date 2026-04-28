# Clinical Signal — Roadmap & GitHub Issues

**Last updated:** April 27, 2026
**Context:** Based on Ryan + Dr. Laura transcript sessions (April 27) and alpha test feedback.

---

## Phase 1: MVP — "Protocol That Works"

**Goal:** A practitioner uploads patient data, gets a protocol they'd actually use with minimal editing. Smart intake captures complete patient data. Three-output flow with approval gate. HIPAA-compliant infrastructure from day one.

**Estimated timeline:** 6-8 weeks
**Monthly infrastructure cost:** ~$290-340 (Aptible + Postgres + S3 + Anthropic API)

---

### Epic 1.1: HIPAA Infrastructure Migration

Move from Railway to Aptible with full HIPAA compliance before any real patient data flows through.

#### Issue #1: Provision Aptible environment and deploy Next.js app
**Priority:** P0 — blocks everything
- Create Aptible organization and HIPAA environment
- Configure Aptible app for the Next.js Docker container (already have a working Dockerfile)
- Set up environment variables (ANTHROPIC_API_KEY, DATABASE_URL, NEXTAUTH_SECRET, etc.)
- Configure custom domain and TLS
- Verify app starts and responds
- **Sub-tasks:**
  - [ ] Create Aptible account and organization
  - [ ] Create HIPAA-dedicated environment
  - [ ] Deploy Docker container
  - [ ] Configure networking and custom domain
  - [ ] Smoke test: login, navigate dashboard

#### Issue #2: Migrate database to Aptible-managed PostgreSQL
**Priority:** P0
- Provision encrypted PostgreSQL on Aptible
- Export data from Neon (seed data + any test data)
- Import into Aptible Postgres
- Update DATABASE_URL
- Verify RLS policies work
- **Sub-tasks:**
  - [ ] Provision Aptible Postgres with encryption at rest
  - [ ] Export Neon data
  - [ ] Import and verify schema + RLS
  - [ ] Update connection string and redeploy
  - [ ] Test: create patient, upload doc, generate protocol end-to-end

#### Issue #3: Set up S3 with encryption for document storage
**Priority:** P0
- Create S3 bucket with AES-256 server-side encryption
- Configure bucket policy (no public access)
- Set up IAM credentials for the app
- Migrate from Vercel Blob to S3
- Update file upload/download code paths
- **Sub-tasks:**
  - [ ] Create encrypted S3 bucket under AWS BAA
  - [ ] Configure IAM user with least-privilege access
  - [ ] Update upload routes to use S3
  - [ ] Update download/read routes to use S3
  - [ ] Test: upload lab PDF, verify it stores and retrieves correctly

#### Issue #4: Establish Anthropic BAA for API usage with PHI
**Priority:** P0
- Contact Anthropic sales/support to set up Business Associate Agreement
- Document BAA coverage and any usage requirements
- Verify API key works from Aptible environment
- **Sub-tasks:**
  - [ ] Contact Anthropic about BAA process
  - [ ] Execute BAA
  - [ ] Verify API calls work from Aptible-hosted app
  - [ ] Document BAA terms for compliance records

#### Issue #5: Audit logging for PHI access
**Priority:** P1
- Log all access to patient records: who accessed, what record, what action, timestamp
- Log all API calls containing PHI (analysis, protocol generation)
- Store audit logs in a separate, append-only table
- Basic audit log viewer for practitioner account (who viewed my patients' data)
- **Sub-tasks:**
  - [ ] Create audit_log table (actor, action, resource_type, resource_id, timestamp, metadata)
  - [ ] Add middleware/wrapper to log patient data access on API routes
  - [ ] Add logging to analysis and protocol generation calls
  - [ ] Basic audit log viewer page in dashboard

#### Issue #6: Decommission Railway and Vercel
**Priority:** P2 (after Aptible is stable)
- Verify Aptible deployment is fully functional
- Cancel Railway service
- Cancel Vercel Pro subscription
- Update DNS records
- Update any hardcoded URLs

---

### Epic 1.2: Smart Dynamic Intake

Replace the static intake form with a guided, adaptive intake that captures complete patient data. Not a full AI chatbot — a structured multi-step form with conditional branching and AI-powered follow-up questions at key points.

#### Issue #7: Design intake flow and question architecture
**Priority:** P0
- Map out the full intake flow: sections, question types, branching logic
- Work with Dr. Laura to identify the critical questions that drive protocol quality
- Define which answer triggers unlock follow-up sections
- Identify where AI-generated follow-ups add value vs. where static branching suffices
- **Sections (draft):**
  - Demographics & basics
  - Current symptoms (with severity/duration)
  - Health history (conditions, surgeries, family history)
  - Current medications & supplements (with photo upload option)
  - Lifestyle (diet, exercise, sleep, stress, sauna, etc.)
  - Gut health (triggered if GI symptoms flagged)
  - Hormones (triggered if hormone symptoms flagged)
  - Goals and priorities
  - Previous labs and test results
  - Wearable data / tracking tools
- **Deliverable:** Intake question map document for Dr. Laura to review

#### Issue #8: Build multi-step intake UI
**Priority:** P0
- One section at a time UX (not a long scrolling form)
- Progress indicator showing completion
- Save progress — patient can return and continue later
- Mobile-friendly (patients will do this on their phones)
- Clean, non-medical-feeling design — warm, approachable
- **Sub-tasks:**
  - [ ] Multi-step form component with progress bar
  - [ ] Auto-save on each section completion
  - [ ] Resume from where patient left off
  - [ ] Mobile-responsive layout
  - [ ] Section navigation (go back to edit previous answers)

#### Issue #9: Conditional branching logic
**Priority:** P0
- Show/hide follow-up sections based on answers
- Example: patient checks "digestive issues" → unlock detailed gut health section
- Example: patient checks "hormone concerns" → unlock hormone-specific questions
- Example: patient says "I take supplements" → ask about each one (name, dose, brand, duration)
- Branching rules configurable per question (stored in DB, not hardcoded)
- **Sub-tasks:**
  - [ ] Define branching rule schema (condition → show section/question)
  - [ ] Implement client-side branching engine
  - [ ] Build initial rule set based on Dr. Laura's input
  - [ ] Test: various patient profiles trigger correct follow-ups

#### Issue #10: AI-powered follow-up questions
**Priority:** P1
- At end of each major section, send answers to AI to generate 2-5 targeted follow-up questions
- Example: patient says "I do sauna" → AI asks: What type? What temperature? How long? How often?
- Example: patient lists supplements → AI asks about dosages, brands, timing, whether prescribed or self-selected
- Keep AI calls lightweight (small prompts, fast responses) — this should feel instant, not like waiting for a protocol
- **Sub-tasks:**
  - [ ] API endpoint: POST /api/intake/follow-up (takes section answers, returns follow-up questions)
  - [ ] System prompt for follow-up generation (concise, clinical, friendly)
  - [ ] UI: seamlessly inject follow-up questions into the form flow
  - [ ] Rate limit: max 1 AI call per section to control costs (~$0.01-0.02 per call)

#### Issue #11: Supplement photo upload with OCR
**Priority:** P2
- Patient snaps a photo of supplement bottles
- OCR extracts text (supplement name, dosage, ingredients)
- AI structures extracted text into supplement records
- Patient confirms/corrects before saving
- **Sub-tasks:**
  - [ ] Photo upload component (camera + gallery)
  - [ ] OCR pipeline (Tesseract or Claude vision API)
  - [ ] AI structuring of OCR text into supplement records
  - [ ] Confirmation UI for patient to verify extracted data

#### Issue #12: Pre-call summary and lab suggestions
**Priority:** P1
- After patient completes intake, generate a summary for the practitioner
- AI suggests which labs to order based on intake data
- Summary available before the first practitioner-patient call
- Practitioner can adjust lab suggestions before ordering
- **Sub-tasks:**
  - [ ] API endpoint: generate intake summary + lab suggestions
  - [ ] Practitioner view: intake summary with suggested labs
  - [ ] Practitioner can approve/modify/add lab suggestions
  - [ ] Track which labs were actually ordered (for later analysis feedback loop)

---

### Epic 1.3: Protocol Quality & 3-Output Flow

Improve the core protocol generation based on alpha feedback, and implement the approval-triggered derivative output flow.

#### Issue #13: Refine clinical protocol system prompt based on alpha feedback
**Priority:** P0
- Incorporate Dr. Laura's alpha test feedback (missed GI Map data, missed transcript nuances)
- Ensure protocol references ALL uploaded documents (not just some)
- Protocol should think in systems: gut-immune-hormone interconnections
- Clinical sequencing must be explicit (what to address first and why)
- Format: comprehensive practitioner-facing document with full reasoning
- **Sub-tasks:**
  - [ ] Review Donna G comparison notes with Dr. Laura
  - [ ] Update system prompt for analysis step
  - [ ] Update system prompt for protocol generation step
  - [ ] Test with Dr. Laura's existing patient data
  - [ ] Dr. Laura reviews and provides feedback
  - [ ] Iterate until she'd use it with minimal edits

#### Issue #14: Protocol status management (draft / approved / superseded)
**Priority:** P0
- Add `status` field to protocol table: draft, approved, superseded
- New protocols default to `draft`
- When practitioner approves one protocol, all other drafts for that patient become `superseded`
- Only `approved` protocols are visible in patient-facing views
- Practitioner can view superseded versions in a history panel
- **Sub-tasks:**
  - [ ] Add status column to protocols table + migration
  - [ ] Approval endpoint: POST /api/protocols/:id/approve
  - [ ] Approval logic: mark others as superseded
  - [ ] Update protocol list UI to show status badges
  - [ ] Add version history panel (collapsed by default)

#### Issue #15: Protocol editing interface
**Priority:** P0
- Practitioner can edit the clinical protocol before approving
- Rich text editing (or structured section editing) — not raw JSON
- Track what was edited (for the AI feedback loop later)
- Save edits without losing the original AI-generated version
- **Sub-tasks:**
  - [ ] Editable protocol view (section-by-section or rich text)
  - [ ] Save edits as a new version (preserve original for comparison)
  - [ ] Diff view: what did the practitioner change?
  - [ ] "Approve" button that triggers derivative output generation

#### Issue #16: Generate client-facing protocol document on approval
**Priority:** P0
- Triggered automatically when practitioner approves clinical protocol
- Takes the approved protocol content and transforms it:
  - Plain language (no jargon or jargon explained)
  - Phased action plan (Phase 1, Phase 2, etc.)
  - Warm, encouraging tone
  - Practical daily/weekly actions the patient can follow
- Stored as a ProtocolOutput (type: client_doc)
- **Sub-tasks:**
  - [ ] ProtocolOutput table (protocol_id, type, content, generated_at)
  - [ ] API endpoint: triggered by approval
  - [ ] System prompt for client-facing transformation
  - [ ] Client document view page
  - [ ] Practitioner can review before sharing with patient

#### Issue #17: Generate call deck (slide summary) on approval
**Priority:** P1
- Triggered alongside Issue #16 on approval
- 5-7 slide summary of the protocol for the practitioner to use on patient call
- Visual, simple, structured as a talk track
- Slide content: opening/context, key findings, phase 1 plan, phase 2 plan, supplements/actions, next steps
- Stored as ProtocolOutput (type: call_deck)
- **Sub-tasks:**
  - [ ] System prompt for slide content generation
  - [ ] Slide viewer in the app (simple HTML/CSS presentation view)
  - [ ] Export to PDF or PPTX option
  - [ ] Practitioner can reorder/edit slides before the call

#### Issue #18: Generate follow-up email draft on approval
**Priority:** P1
- Triggered alongside Issues #16 and #17 on approval
- Draft email summarizing what was discussed / what the plan is
- Goes into a "drafts" folder — practitioner reviews and sends manually
- Tone matches practitioner communication style (basic version — more personalization in Phase 3)
- Stored as ProtocolOutput (type: follow_up_email)
- **Sub-tasks:**
  - [ ] System prompt for email draft generation
  - [ ] Drafts folder UI in dashboard
  - [ ] Edit draft before sending
  - [ ] Copy to clipboard or open in email client

---

### Epic 1.4: Usage Tracking & Pricing Foundation

#### Issue #19: Usage tracking per practitioner
**Priority:** P1
- Track number of active clients per practitioner per month
- Track number of protocol generations per client
- Enforce limits based on tier (base: configurable, premium: configurable)
- Show usage dashboard to practitioner
- **Sub-tasks:**
  - [ ] usage_tracking table (practitioner_id, month, client_count, generations_used)
  - [ ] Increment on each protocol generation
  - [ ] Check limits before allowing generation
  - [ ] Usage display in practitioner dashboard
  - [ ] Friendly messaging when approaching limits

#### Issue #20: Add disclaimer to all outputs and portal
**Priority:** P1
- Standard disclaimer on every generated protocol, client document, and slide deck
- Disclaimer on the portal/login page
- Language: Clinical Signal is a research and workflow efficiency tool for licensed healthcare practitioners. It does not provide medical advice, diagnosis, or treatment. All outputs must be reviewed and approved by a qualified practitioner before use.
- **Sub-tasks:**
  - [ ] Define exact disclaimer text (legal review recommended)
  - [ ] Add to protocol output footer
  - [ ] Add to client-facing document footer
  - [ ] Add to slide deck final slide
  - [ ] Add to portal login/landing page

---

### Epic 1.5: PatientTimeline Data Model

#### Issue #21: Implement PatientTimeline as the core data model
**Priority:** P0
- Create patient_timeline table: patient_id, event_type, content (JSONB), source_file (S3 key), created_at
- Event types: intake, lab_result, call_transcript, protocol, outcome_checkin, note, document
- Migrate existing data (intake submissions, lab uploads, protocols) to timeline format
- All new data writes append to timeline
- Protocol generation reads from timeline (replaces current ad-hoc data gathering)
- **Sub-tasks:**
  - [ ] Create patient_timeline table with RLS policies
  - [ ] Define JSONB schema per event type
  - [ ] Migration: existing intake data → timeline events
  - [ ] Migration: existing lab uploads → timeline events
  - [ ] Migration: existing protocols → timeline events
  - [ ] Update protocol generation to read from timeline
  - [ ] API endpoint: GET /api/patients/:id/timeline

---

## Phase 2: "Ready for Patients" — Polish & Delivery

**Goal:** The platform is ready for Dr. Laura to use with real patients, and for 2-3 additional practitioners to onboard. Focus on the patient-facing experience and call workflow.

**Estimated timeline:** 4-6 weeks after Phase 1

---

#### Issue #22: Patient portal — view approved protocol and action plan
- Patient-facing view (read-only) of their approved client document
- Clean, mobile-friendly, phased layout
- Checklist items patients can mark as done
- Disclaimer visible
- No PHI visible beyond their own data (RLS enforced)

#### Issue #23: Call transcription and timeline integration
- Practitioner records calls (or uploads recordings)
- Transcription via Whisper API or Deepgram
- Transcript automatically added to PatientTimeline
- AI extracts key action items and updates from transcript
- Post-call summary generated within 30 minutes

#### Issue #24: Protocol PDF export
- Clean PDF generation from approved clinical protocol
- Clean PDF generation from client-facing document
- Practitioner branding (name, credentials, logo) in header
- Disclaimer in footer

#### Issue #25: Practitioner profile and preferences
- Structured profile: credentials, specialty areas, typical engagement length
- Preferences: max supplements, sequencing philosophy, preferred lab panels
- These get injected into protocol generation prompts
- Foundation for Phase 3 personalization

---

## Phase 3: "Practitioner Voice" — Personalization (Premium Tier)

**Goal:** Protocols sound like they came from the practitioner. Premium tier differentiator.

**Estimated timeline:** 4-6 weeks after Phase 2

---

#### Issue #26: Practitioner onboarding — methodology capture
- Guided onboarding flow: "Tell us how you work with clients"
- Upload or record: practitioner walks through their process
- Transcript stored as practitioner methodology context
- Injected into all protocol generation prompts for that practitioner

#### Issue #27: Historical data upload — past protocols and outcomes
- Practitioner uploads past client protocols, intake forms, outcome notes
- AI analyzes patterns: this practitioner tends to sequence X before Y, prefers these supplement brands, limits to N supplements
- Builds a practitioner "style profile" over time

#### Issue #28: Resource and handout library
- Practitioner uploads their patient handouts and templates
- Tags each with when/why they use it
- During protocol generation, AI recommends which 3-5 handouts to include
- AI also generates a bespoke handout specific to that patient

#### Issue #29: Practitioner onboarding agent
- AI-guided onboarding for new practitioners signing up
- Walks them through platform setup, profile, preferences
- Explains tiers and upsells premium personalization
- Captures initial methodology data as part of signup flow

---

## Phase 4: "Continuous Companion" — Full Patient Lifecycle

**Goal:** AI is present at every stage of the patient journey, accumulating context and providing value continuously.

**Estimated timeline:** 6-8 weeks after Phase 3

---

#### Issue #30: Outcome tracking and check-in agent
- Scheduled check-ins with patients (via portal or email)
- "How are you feeling on Phase 1? Any changes?"
- Responses added to PatientTimeline
- AI flags concerns or progress for practitioner review

#### Issue #31: Protocol revision based on new data
- When new labs come in or outcomes are reported, AI suggests protocol adjustments
- Practitioner reviews suggested changes
- Approval triggers updated client document and call deck

#### Issue #32: Wearable data integration
- Connect Apple Health, Whoop, Oura
- Pull relevant metrics (sleep, HRV, activity, recovery)
- Add to PatientTimeline as continuous data stream
- AI references trends in protocol generation and check-ins

#### Issue #33: Cross-patient pattern recognition
- With enough data: identify what works across similar patient profiles
- "Patients with similar labs who followed Protocol X saw improvement in Y"
- Inform protocol generation with aggregate outcomes
- This is where Neo4j or graph queries may become valuable

---

## Pricing Model (Draft)

| Tier | Monthly | Clients | Generations/Client | Personalization |
|------|---------|---------|-------------------|-----------------|
| Base | $49 platform + $20/client | Unlimited | 3 included | Standard voice |
| Premium | $49 platform + $30/client | Unlimited | 5 included | Custom voice + methodology |
| Extra generations | $7 each | — | — | — |

**Unit economics at Base tier, 10 clients:**
- Revenue: $49 + (10 × $20) = $249/mo
- Infrastructure: ~$300/mo (Aptible + Postgres + S3)
- API cost: ~$2-3 per generation × 30 max = $60-90
- Margin at 10 clients: -$100 to -$140 (need ~15 clients to break even on infra)
- Margin at 20 clients: $49 + $400 - $300 - $120 = ~$30 (thin but positive)
- Margin at 50 clients (multiple practitioners): $49×N + $1000 - $300 - $300 = healthy

**Break-even:** ~2-3 practitioners with 8-10 clients each covers infrastructure.

---

## Disclaimer (Draft)

> Clinical Signal is a research and clinical workflow tool designed for licensed healthcare practitioners. It does not provide medical advice, diagnosis, or treatment recommendations. All AI-generated analyses, protocols, and documents are intended as practitioner decision-support tools and must be reviewed, edited, and approved by a qualified healthcare professional before use with patients. Clinical Signal is not a substitute for professional clinical judgment.
