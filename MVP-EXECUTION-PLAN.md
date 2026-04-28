# MVP Execution Plan — Sub-Issues & Dependencies

**4 parallel workstreams, 8 weeks to ship**

The key insight: Infrastructure, Intake Design, Protocol Quality, and Data Model can all start simultaneously in Week 1. The critical path runs through the Protocol lane (approval → derivative outputs), but everything else builds in parallel.

Legend:
- **BLOCKS →** means the downstream issue cannot start until this one is done
- **PARALLEL** means these can run at the same time
- **CRITICAL PATH** = the sequence that determines the earliest possible ship date

---

## Workstream A: INFRASTRUCTURE (Blue)

### 1a. Create Aptible account and HIPAA environment [Week 1]
- Sign up for Aptible, create organization
- Create a HIPAA-dedicated environment (Aptible handles encryption, network isolation)
- Add team members if needed
- **Effort:** 1-2 hours (account setup)
- **Blocks → 1b**

### 1b. Deploy Next.js app to Aptible [Week 1]
- Push existing Docker container to Aptible
- Configure environment variables (ANTHROPIC_API_KEY, DATABASE_URL, NEXTAUTH_SECRET, S3 creds)
- Configure custom domain + TLS certificate
- Smoke test: can log in, navigate dashboard
- **Effort:** 1 day
- **Blocks → 2a, 3a**
- **PARALLEL with:** 7a, 13a, 21a (other lanes don't need infra yet)

### 2a. Provision Aptible PostgreSQL and migrate data [Week 2]
- Create managed Postgres database on Aptible (encryption at rest automatic)
- Export from Neon: schema + seed data + any test data
- Import into Aptible Postgres
- Verify RLS policies function correctly
- Update DATABASE_URL in Aptible env vars, redeploy
- Test: full CRUD operations on patients, documents
- **Effort:** 1-2 days
- **Blocks → 21b** (timeline table needs to be created on the new DB)

### 3a. Create encrypted S3 bucket [Week 2]
- Create S3 bucket with AES-256-SSE
- Enable versioning (for audit trail)
- Block all public access
- Create IAM user with least-privilege policy (PutObject, GetObject, DeleteObject on this bucket only)
- Generate access key, add to Aptible env vars
- **Effort:** Half day
- **PARALLEL with:** 2a
- **Blocks → 3b**

### 3b. Migrate file upload/download routes to S3 [Week 3]
- Replace Vercel Blob SDK calls with AWS S3 SDK
- Update upload routes (lab PDFs, intake documents)
- Update download/read routes
- Update any pre-signed URL generation
- Test: upload a lab PDF, verify it stores in S3, verify it can be read back
- **Effort:** 1-2 days
- **PARALLEL with:** 9a, 14a, 21c

### 4a. Establish Anthropic BAA [Week 3, async]
- Email Anthropic sales/support about BAA process
- This runs in the background — may take days/weeks for legal
- Document BAA terms once executed
- Does NOT block development (you're using test data until real patients come on)
- **Effort:** 1 hour to initiate, then waiting
- **PARALLEL with:** everything

### 5a. Audit logging table and middleware [Week 4]
- Create `audit_log` table: id, actor_id, action (view/create/update/delete), resource_type (patient/protocol/document), resource_id, ip_address, timestamp, metadata (JSONB)
- Create middleware that wraps patient-data API routes and logs access
- Log protocol generation events (who triggered, for which patient)
- Log document access events
- **Effort:** 2 days
- **Blocks → 5b**
- **PARALLEL with:** 10a, 15a, 19a

### 5b. Audit log viewer [Week 5]
- Dashboard page: filterable list of audit events
- Filter by patient, by date range, by action type
- Practitioner sees only their own patients' audit trail
- **Effort:** 1 day
- **PARALLEL with:** 12a, 16a, 19b

### 6a. Decommission Railway, Vercel, Neon [Week 6]
- Verify Aptible deployment is fully stable (at least 1 week running)
- Cancel Railway service
- Cancel Vercel Pro subscription
- Cancel Neon (if still active)
- Update any DNS records, bookmarks, documentation
- **Effort:** 1 hour
- **PARALLEL with:** 11a, 17a, 18a, 20a

---

## Workstream B: SMART DYNAMIC INTAKE (Green)

### 7a. Design intake question map with Dr. Laura [Week 1]
- Sit down with Dr. Laura (call or doc) and map every question that matters
- Organize into sections: Demographics, Symptoms, Health History, Medications/Supplements, Lifestyle, Gut Health, Hormones, Goals, Previous Labs, Wearables
- For each section, identify: required questions, conditional triggers (what answer unlocks deeper questions), and where AI follow-up adds value
- Define data schema for each answer type (text, select, multi-select, number, date, file upload)
- **Deliverable:** Intake Question Map document
- **Effort:** 2-3 days (includes Dr. Laura collaboration time)
- **Blocks → 8a, 9a**
- **PARALLEL with:** 1a, 1b, 13a, 21a (no infra dependency)

### 8a. Build multi-step intake form shell [Week 2]
- React component: one section at a time with progress bar
- Section navigation (next, back, jump to section)
- Auto-save on section completion (to database)
- Resume capability — patient returns and picks up where they left off
- Mobile-responsive (patients will use phones)
- No actual questions yet — just the framework
- **Effort:** 3-4 days
- **Blocks → 9a** (branching needs the form shell)
- **PARALLEL with:** 2a, 3a, 13b, 21b

### 8b. Populate intake form with questions [Week 2-3]
- Take the question map from 7a and implement each section
- All question types: text input, dropdowns, multi-select checkboxes, numeric inputs, date pickers, file upload fields
- Validation rules per question
- **Effort:** 2-3 days
- **Depends on:** 7a (question map), 8a (form shell)
- **PARALLEL with:** 9a (can be built simultaneously since branching is a layer on top)

### 9a. Conditional branching engine [Week 3]
- Branching rule schema: { condition: { field: "has_gi_issues", equals: true }, show: "gut_health_section" }
- Store rules in database (not hardcoded) so they can be tuned without deploys
- Client-side evaluation: after each answer, check rules and show/hide sections
- Initial rule set based on Dr. Laura's question map
- **Effort:** 2-3 days
- **Depends on:** 7a, 8a
- **Blocks → 10a** (AI follow-ups layer on top of branching)
- **PARALLEL with:** 3b, 14a, 21c

### 9b. Test branching with sample patient profiles [Week 3]
- Create 3-5 sample patient profiles (gut-focused, hormone-focused, general wellness, complex multi-system)
- Walk through each profile and verify correct sections appear
- Dr. Laura reviews: "Does this capture everything I'd need to know?"
- **Effort:** 1 day
- **Depends on:** 9a, 8b

### 10a. AI-powered follow-up questions [Week 4]
- API endpoint: POST /api/intake/follow-up
  - Input: section name + patient's answers for that section
  - Output: 2-5 targeted follow-up questions
- System prompt: concise, clinical but warm, asks about specifics the patient mentioned
  - Example: patient says "vitamin D" → "What dosage? What brand? Do you take it with K2? Morning or evening?"
  - Example: patient says "sauna" → "What type of sauna (infrared, traditional)? Temperature? Duration? Frequency?"
- UI: follow-up questions appear seamlessly after the section, before moving to the next section
- Latency target: < 3 seconds (small prompt, small response)
- Cost target: ~$0.01-0.02 per AI call (tiny prompt)
- Rate limit: max 1 AI follow-up call per section (10 sections × $0.02 = $0.20 per full intake)
- **Effort:** 3-4 days
- **Depends on:** 9a (needs branching working first)
- **PARALLEL with:** 5a, 15a, 19a

### 10b. Follow-up question quality testing [Week 4]
- Test with the same 3-5 sample patient profiles
- Are the AI questions relevant? Too many? Too few?
- Dr. Laura reviews question quality
- Tune system prompt based on feedback
- **Effort:** 1 day
- **Depends on:** 10a

### 11a. Supplement photo upload with OCR [Week 6]
- Photo upload component (camera capture + gallery selection)
- OCR: use Claude Vision API (send photo, ask it to extract supplement name, brand, dosage, ingredients)
- Return structured supplement records
- Patient confirmation screen: "We found these — is this right?"
- **Effort:** 3-4 days
- **Depends on:** 8b (needs supplement section in form)
- **PARALLEL with:** 6a, 17a, 18a, 20a
- **Note:** P2 — if running behind, this can be cut from MVP and added in Phase 2

### 12a. Pre-call summary and lab suggestion generation [Week 5]
- Triggered when patient completes intake (or practitioner manually triggers)
- API endpoint: POST /api/patients/:id/intake-summary
- AI reads full intake data from PatientTimeline, produces:
  - Patient summary (key findings, flags, areas of concern)
  - Suggested lab panels based on symptoms and history
  - Suggested talking points for first call
- Practitioner view: summary card on patient detail page
- Practitioner can approve/modify/add to lab suggestions
- **Effort:** 3-4 days
- **Depends on:** 10a (intake needs to be capturing good data), 21c (reads from timeline)
- **PARALLEL with:** 5b, 16a, 19b

### 12b. Lab ordering tracking [Week 5]
- Simple tracking: which labs were suggested, which were ordered, which have results
- Status per lab: suggested → ordered → results_received
- Links to the intake summary that prompted the suggestion
- **Effort:** 1-2 days
- **Depends on:** 12a
- **PARALLEL with:** 16a

---

## Workstream C: PROTOCOL QUALITY & 3-OUTPUT FLOW (Yellow)

### 13a. Audit protocol output against alpha feedback [Week 1]
- Review Donna G comparison notes: what did the AI miss?
- Catalog specific gaps: GI Map data not referenced, transcript nuances lost, generic recommendations
- Map each gap to a root cause: missing data (intake problem), missing prompt instruction (prompt problem), or model limitation
- **Deliverable:** Gap analysis document
- **Effort:** 1-2 days
- **PARALLEL with:** 1a, 7a, 21a (no dependencies)

### 13b. Rewrite analysis and protocol system prompts [Week 2]
- Update analysis system prompt:
  - Explicitly reference ALL uploaded documents (enumerate them in the prompt)
  - Require systems-thinking: gut-immune-hormone interconnections
  - Require explicit clinical sequencing rationale
- Update protocol generation system prompt:
  - Match Dr. Laura's preferred output format
  - Include phasing with clear rationale
  - Supplement recommendations with dosing, timing, duration
  - Flag contraindications and interactions
  - Red flags section: when to refer out
- **Effort:** 3-4 days
- **Depends on:** 13a (gap analysis)
- **PARALLEL with:** 8a, 2a, 21b

### 13c. Test protocol quality with Dr. Laura [Week 3]
- Run protocol generation on existing test patient
- Dr. Laura reviews: how much editing would this need?
- Iterate on prompts based on feedback
- Goal: "I'd change maybe 10-15% of this" not "I'd rewrite half of it"
- **Effort:** 2-3 days (includes iteration cycles)
- **Depends on:** 13b, 21c (protocol gen should read from timeline by now)
- **PARALLEL with:** 9a, 14a

### 14a. Add protocol status field [Week 3]
- Add `status` column to protocols table: enum('draft', 'approved', 'superseded')
- Default new protocols to 'draft'
- Database migration
- Update protocol list queries to show status
- **Effort:** Half day
- **PARALLEL with:** 9a, 13c, 3b

### 14b. Approval endpoint and supersede logic [Week 3]
- POST /api/protocols/:id/approve
- Sets this protocol to 'approved'
- Sets ALL other protocols for this patient to 'superseded'
- Returns the approved protocol
- Creates audit log entry
- **Effort:** 1 day
- **Depends on:** 14a
- **Blocks → 16a, 17a, 18a** (derivative outputs triggered by approval)

### 14c. Protocol list UI with status badges [Week 3-4]
- Show status badge (Draft / Approved / Superseded) on protocol list
- Superseded protocols collapsed into a "Version history" accordion
- Only show "Approve" button on draft protocols
- **Effort:** 1 day
- **Depends on:** 14a

### 15a. Protocol editing interface [Week 4]
- Section-by-section editing: practitioner clicks a section, it becomes editable
- Rich text within sections (bold, lists, links) — use a lightweight editor like Tiptap
- Save edits — creates a new version but keeps original for comparison
- Diff view: highlight what practitioner changed vs. AI original
- "Approve" button prominently placed after editing
- **Effort:** 4-5 days
- **Depends on:** 14a (needs status field), 13c (need good protocol to edit)
- **PARALLEL with:** 10a, 5a, 19a

### 15b. Edit tracking for AI feedback loop [Week 4]
- Store original AI version + practitioner-edited version
- Compute and store diff (which sections changed, what was added/removed)
- This data feeds future prompt improvement — if practitioners always edit the same section, the prompt needs work there
- **Effort:** 1-2 days
- **Depends on:** 15a
- **PARALLEL with:** 10b

### 16a. Generate client-facing document on approval [Week 5] ⭐ CRITICAL PATH
- ProtocolOutput table: id, protocol_id, type (enum: client_doc, call_deck, follow_up_email), content (JSONB), file_key (S3), generated_at
- Triggered automatically when protocol is approved (14b)
- System prompt for transformation:
  - Take approved clinical protocol as input
  - Output: phased action plan in warm, clear, patient-friendly language
  - No unexplained jargon
  - Practical daily/weekly actions
  - Encouraging tone
  - Phase transitions clearly marked
- Store as ProtocolOutput type='client_doc'
- **Effort:** 3-4 days
- **Depends on:** 14b (approval trigger), 15a (editing done before approval)
- **Blocks → integration testing**
- **PARALLEL with:** 12a, 5b, 19b

### 16b. Client document view page [Week 5-6]
- Clean, readable view of the client-facing document
- Mobile-friendly (patients will read this on phones)
- Practitioner can review before sharing with patient
- Print-friendly CSS
- **Effort:** 2 days
- **Depends on:** 16a

### 17a. Generate call deck on approval [Week 6]
- Triggered alongside 16a when protocol is approved
- System prompt: take approved protocol, produce 5-7 slide content blocks
  - Slide 1: Patient overview and key findings
  - Slide 2: Root cause analysis (simplified)
  - Slide 3-4: Phase 1 plan (what we're doing first and why)
  - Slide 5: Phase 2 preview
  - Slide 6: Supplement/action summary
  - Slide 7: Next steps and timeline
- Store as ProtocolOutput type='call_deck'
- Simple HTML/CSS slide viewer in the app
- **Effort:** 3-4 days
- **Depends on:** 14b, 16a (same trigger, can build after client doc is working)
- **PARALLEL with:** 18a, 11a, 6a

### 17b. Call deck export (PDF/PPTX) [Week 6-7]
- Export slide content as PDF (using puppeteer or similar)
- Optional: PPTX export for practitioners who want to customize in PowerPoint
- **Effort:** 2 days
- **Depends on:** 17a

### 18a. Generate follow-up email draft on approval [Week 6]
- Triggered alongside 16a and 17a on approval
- System prompt: take approved protocol, draft a professional email
  - Summarizes the plan
  - References what was discussed (if call transcript exists)
  - Warm, personal tone
  - Clear next steps for the patient
  - Disclaimer footer
- Store as ProtocolOutput type='follow_up_email'
- **Effort:** 1-2 days
- **Depends on:** 14b
- **PARALLEL with:** 17a, 11a

### 18b. Email drafts folder in dashboard [Week 6]
- Dashboard section: pending email drafts
- Practitioner can edit the draft
- Copy to clipboard or "open in email client" button (mailto: link with pre-filled body)
- Mark as sent (for tracking)
- **Effort:** 1-2 days
- **Depends on:** 18a

---

## Workstream D: DATA MODEL & PLATFORM (Purple)

### 21a. Design PatientTimeline schema [Week 1]
- Table design: id, patient_id, event_type (enum), content (JSONB), source_file_key (S3, nullable), created_at, created_by
- Event types: intake_submission, lab_result, call_transcript, protocol_generated, protocol_approved, outcome_checkin, practitioner_note, document_upload
- JSONB schema per event type (what fields each type stores)
- RLS policy: practitioner can only see their own patients' timeline events
- **Effort:** 1 day
- **PARALLEL with:** 1a, 7a, 13a (no dependencies)
- **Blocks → 21b**

### 21b. Create table, migration, and migrate existing data [Week 2]
- Create migration for patient_timeline table
- Write data migration scripts:
  - Existing intake submissions → timeline events (type: intake_submission)
  - Existing lab uploads → timeline events (type: lab_result)
  - Existing protocols → timeline events (type: protocol_generated)
- Verify RLS policies work
- **Effort:** 2-3 days
- **Depends on:** 21a (schema), 2a (need the new Aptible DB)
- **Blocks → 21c**

### 21c. Wire protocol generation to read from timeline [Week 3] ⭐ CRITICAL PATH
- Refactor protocol generation (analysis.ts) to pull patient data from PatientTimeline
- Query: get all timeline events for patient, ordered by date
- Build patient context from timeline events (intake + labs + any notes)
- This replaces the current ad-hoc data gathering that missed documents in alpha
- **Effort:** 2-3 days
- **Depends on:** 21b
- **Blocks → 13c** (prompt testing needs timeline-based generation)
- **PARALLEL with:** 9a, 3b, 14a

### 21d. Ensure new intake data writes to timeline [Week 3-4]
- When patient submits an intake section → write timeline event
- When practitioner uploads a document → write timeline event
- When lab results are uploaded → write timeline event
- This ensures the timeline is always current going forward
- **Effort:** 1-2 days
- **Depends on:** 21b, 8b (intake form needs to exist)
- **PARALLEL with:** 14b, 10a

### 19a. Usage tracking table and limits enforcement [Week 4]
- Table: usage_tracking (practitioner_id, billing_month, active_clients, generations_used, generation_limit)
- Increment generations_used on each protocol generation
- Check limit before allowing generation — return friendly error if exceeded
- Set initial limits per tier (configurable in env/DB, not hardcoded)
- **Effort:** 2 days
- **Depends on:** 2a (database needs to exist)
- **PARALLEL with:** 10a, 15a, 5a

### 19b. Usage dashboard for practitioners [Week 5]
- Card on main dashboard: "X of Y generations used this month"
- Link to detailed usage page: per-client breakdown
- Warning state when approaching limit (80%+)
- **Effort:** 1-2 days
- **Depends on:** 19a
- **PARALLEL with:** 12a, 16a, 5b

### 20a. Add disclaimer to all outputs and portal [Week 6]
- Define final disclaimer text
- Add as footer to: clinical protocol view, client-facing document, call deck (final slide), follow-up email (footer), portal login page
- Styled consistently — subtle but always present
- **Effort:** 1 day
- **Depends on:** 16a, 17a, 18a (outputs need to exist to add disclaimer to)
- **PARALLEL with:** 6a, 11a

---

## Integration Testing [Weeks 7-8]

### INT-1. End-to-end flow test with Dr. Laura
- Create a fresh test patient
- Dr. Laura walks through the full intake as if she's a patient
- Upload lab PDFs
- Generate pre-call summary + lab suggestions
- Generate clinical protocol
- Practitioner reviews, edits, approves
- Verify: client doc, call deck, and email draft all generate correctly
- Verify: draft protocols are superseded
- Verify: usage tracking increments correctly
- Verify: audit log captures all access
- **Effort:** 2-3 days

### INT-2. Mobile testing of patient intake
- Walk through intake on phone (iOS Safari, Android Chrome)
- Verify: progress saves, resume works, conditional sections appear
- Verify: AI follow-up questions render and respond quickly
- **Effort:** 1 day

### INT-3. Load testing on Aptible
- Simulate concurrent protocol generations
- Verify: long-running requests (8+ min) don't crash
- Verify: stream recovery still works
- Test: what happens at usage limits?
- **Effort:** 1 day

### INT-4. Security review
- Verify: RLS prevents cross-practitioner data access
- Verify: audit logs capture all PHI access
- Verify: S3 bucket has no public access
- Verify: no PHI in application logs or error messages
- Verify: session timeouts work (15 min default)
- **Effort:** 1-2 days

---

## Parallel Execution Summary

**Week 1 (4 parallel tracks):**
- INFRA: 1a → 1b (Aptible setup)
- INTAKE: 7a (Question map with Dr. Laura)
- PROTOCOL: 13a (Alpha feedback audit)
- DATA: 21a (Timeline schema design)

**Week 2 (4 parallel tracks):**
- INFRA: 2a + 3a (DB migration + S3 setup)
- INTAKE: 8a + 8b (Form shell + populate questions)
- PROTOCOL: 13b (Rewrite prompts)
- DATA: 21b (Create timeline table + migrate data)

**Week 3 (4 parallel tracks):**
- INFRA: 3b + 4a (S3 migration + Anthropic BAA)
- INTAKE: 9a + 9b (Branching engine + test)
- PROTOCOL: 13c + 14a + 14b (Test prompts + status management)
- DATA: 21c + 21d (Wire generation to timeline)

**Week 4 (4 parallel tracks):**
- INFRA: 5a (Audit logging)
- INTAKE: 10a + 10b (AI follow-ups)
- PROTOCOL: 15a + 15b (Editing interface)
- DATA: 19a (Usage tracking)

**Week 5 (4 parallel tracks):**
- INFRA: 5b (Audit viewer)
- INTAKE: 12a + 12b (Pre-call summary + lab tracking)
- PROTOCOL: 16a + 16b (Client doc generation) ⭐
- DATA: 19b (Usage dashboard)

**Week 6 (4 parallel tracks):**
- INFRA: 6a (Decommission old services)
- INTAKE: 11a (Supplement OCR — can cut if behind)
- PROTOCOL: 17a + 17b + 18a + 18b (Call deck + email draft)
- DATA: 20a (Disclaimer everywhere)

**Weeks 7-8:**
- All tracks: Integration testing, Dr. Laura full-flow test, mobile test, security review

---

## Critical Path (longest sequential chain)

The MVP ship date is determined by this chain:

```
21a (schema) → 21b (create table) → 21c (wire generation) → 13c (test quality)
→ 15a (editing UI) → 14b (approval endpoint) → 16a (client doc) → 17a (call deck)
→ Integration testing → SHIP
```

**If any of these slip, the ship date slips.** Everything else is parallel work that needs to be done but doesn't extend the timeline.

## Can-Cut-If-Behind List

If we're running behind and need to hit 8 weeks, these can move to Phase 2 without compromising core MVP:

1. **11a — Supplement OCR** (patients can type supplements manually)
2. **17b — Call deck PPTX export** (HTML viewer is fine for MVP)
3. **18b — Email drafts folder** (copy to clipboard is sufficient)
4. **5b — Audit log viewer** (logging still happens, viewer can come later)
5. **15b — Edit tracking for AI feedback loop** (nice to have, not blocking)
