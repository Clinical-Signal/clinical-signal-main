#!/usr/bin/env bash
set -eo pipefail

# =============================================================================
# Clinical Signal — MVP GitHub Issue Creator
# Run this from the repo root: bash scripts/create-mvp-issues.sh
#
# Prerequisites:
#   - gh CLI installed and authenticated (brew install gh && gh auth login)
#   - You are in the clinical-signal-main repo directory
# =============================================================================

REPO="Clinical-Signal/clinical-signal-main"

echo "================================================"
echo "  Clinical Signal — Creating MVP GitHub Issues"
echo "================================================"
echo ""

# --- Create labels -----------------------------------------------------------
echo "Creating labels..."
gh label create "infra" --description "Infrastructure & HIPAA" --color "1f6feb" --repo "$REPO" 2>/dev/null || true
gh label create "intake" --description "Smart Dynamic Intake" --color "2da44e" --repo "$REPO" 2>/dev/null || true
gh label create "protocol" --description "Protocol Quality & Outputs" --color "e3b341" --repo "$REPO" 2>/dev/null || true
gh label create "data-model" --description "Data Model & Platform" --color "a371f7" --repo "$REPO" 2>/dev/null || true
gh label create "P0" --description "Must have — blocks other work" --color "d73a4a" --repo "$REPO" 2>/dev/null || true
gh label create "P1" --description "Important — needed for MVP" --color "fbca04" --repo "$REPO" 2>/dev/null || true
gh label create "P2" --description "Nice to have — can cut if behind" --color "0e8a16" --repo "$REPO" 2>/dev/null || true
gh label create "critical-path" --description "On the critical path — delays here delay ship" --color "b60205" --repo "$REPO" 2>/dev/null || true
gh label create "week-1" --description "Target: Week 1" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-2" --description "Target: Week 2" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-3" --description "Target: Week 3" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-4" --description "Target: Week 4" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-5" --description "Target: Week 5" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-6" --description "Target: Week 6" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "week-7-8" --description "Target: Weeks 7-8 (integration)" --color "c5def5" --repo "$REPO" 2>/dev/null || true
gh label create "phase-2" --description "Deferred to Phase 2" --color "d4c5f9" --repo "$REPO" 2>/dev/null || true
echo "Labels created."
echo ""

# Helper to create an issue and capture its number
create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  local num
  num=$(gh issue create --repo "$REPO" --title "$title" --body "$body" --label "$labels" | grep -o '[0-9]*$')
  echo "$num"
}

# =============================================================================
# EPIC 1: HIPAA INFRASTRUCTURE MIGRATION
# =============================================================================
echo "--- Epic 1: HIPAA Infrastructure Migration ---"

EPIC1=$(create_issue \
  "[Epic] HIPAA Infrastructure Migration" \
  "$(cat <<'BODY'
## Epic: HIPAA Infrastructure Migration

**Workstream:** Infrastructure (Blue)
**Target:** Weeks 1-6
**Priority:** P0 — blocks production use with real patient data

Migrate from Railway to Aptible with full HIPAA compliance. Every service touching PHI must be covered by a BAA: hosting, database, file storage, and AI API.

### Sub-issues
- [ ] 1a. Create Aptible account and HIPAA environment
- [ ] 1b. Deploy Next.js app to Aptible
- [ ] 2a. Provision Aptible PostgreSQL and migrate data
- [ ] 3a. Create encrypted S3 bucket
- [ ] 3b. Migrate file upload/download routes to S3
- [ ] 4a. Establish Anthropic BAA
- [ ] 5a. Audit logging table and middleware
- [ ] 5b. Audit log viewer
- [ ] 6a. Decommission Railway, Vercel, Neon

### Monthly cost after migration
~$290-340/mo (Aptible + Postgres + S3 + Anthropic API)
BODY
)" \
  "infra,P0")
echo "  Created Epic 1: #$EPIC1"

# --- 1a ---
I1A=$(create_issue \
  "1a. Create Aptible account and HIPAA environment" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 1 | **Priority:** P0
**Effort:** 1-2 hours

## What
- Sign up for Aptible Starter plan
- Create organization
- Create a HIPAA-dedicated environment (Aptible handles encryption, network isolation, BAA)
- Add team members if needed

## Acceptance criteria
- [ ] Aptible account created with HIPAA environment
- [ ] Can access Aptible dashboard and environment settings

## Dependencies
- **Blocks:** #1b (Deploy app)
- **Parallel with:** Intake design (7a), Protocol audit (13a), Timeline schema (21a)
BODY
)" \
  "infra,P0,week-1")
echo "  Created 1a: #$I1A"

# --- 1b ---
I1B=$(create_issue \
  "1b. Deploy Next.js app to Aptible" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 1 | **Priority:** P0
**Effort:** 1 day

## What
- Push existing Docker container to Aptible
- Configure environment variables:
  - ANTHROPIC_API_KEY
  - DATABASE_URL (temporary — will update after DB migration)
  - NEXTAUTH_SECRET
  - NEXTAUTH_URL
  - S3 credentials (after 3a)
- Configure custom domain + TLS certificate
- Smoke test: can log in, navigate dashboard, see patient list

## Acceptance criteria
- [ ] App running on Aptible with custom domain
- [ ] TLS working (HTTPS)
- [ ] Can log in and navigate dashboard
- [ ] No errors in Aptible logs on startup

## Dependencies
- **Blocked by:** #$I1A (Aptible env must exist)
- **Blocks:** #2a (DB migration), #3a (S3 setup)
- **Parallel with:** Intake design (7a), Protocol audit (13a), Timeline schema (21a)
BODY
)" \
  "infra,P0,week-1")
echo "  Created 1b: #$I1B"

# --- 2a ---
I2A=$(create_issue \
  "2a. Provision Aptible PostgreSQL and migrate data" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 2 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 1-2 days

## What
- Create managed Postgres database on Aptible (encryption at rest is automatic)
- Export data from Neon: schema + seed data + any test patient data
- Import into Aptible Postgres
- Verify RLS policies function correctly
- Update DATABASE_URL in Aptible env vars, redeploy
- Test full CRUD operations on patients, documents

## Acceptance criteria
- [ ] Aptible Postgres provisioned with encryption at rest
- [ ] All tables, RLS policies, and seed data migrated
- [ ] App connects to Aptible Postgres successfully
- [ ] Can create patient, upload doc, view patient list — all working

## Dependencies
- **Blocked by:** #$I1B (app must be deployed)
- **Blocks:** Timeline table creation (21b)
- **Parallel with:** #3a (S3 bucket)
BODY
)" \
  "infra,P0,critical-path,week-2")
echo "  Created 2a: #$I2A"

# --- 3a ---
I3A=$(create_issue \
  "3a. Create encrypted S3 bucket for document storage" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 2 | **Priority:** P0
**Effort:** Half day

## What
- Create S3 bucket with AES-256 server-side encryption (SSE-S3)
- Enable versioning (for audit trail of document changes)
- Block ALL public access
- Create IAM user with least-privilege policy:
  - PutObject, GetObject, DeleteObject on this bucket only
- Generate access key pair
- Add AWS credentials to Aptible env vars

## Acceptance criteria
- [ ] S3 bucket created with encryption + versioning + no public access
- [ ] IAM user created with minimal permissions
- [ ] Credentials added to Aptible environment
- [ ] Can upload a test file via AWS CLI and verify encryption

## Dependencies
- **Blocked by:** #$I1B (need Aptible env for credentials)
- **Blocks:** #3b (file route migration)
- **Parallel with:** #$I2A (DB migration)
BODY
)" \
  "infra,P0,week-2")
echo "  Created 3a: #$I3A"

# --- 3b ---
I3B=$(create_issue \
  "3b. Migrate file upload/download routes to S3" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 3 | **Priority:** P0
**Effort:** 1-2 days

## What
- Replace Vercel Blob SDK calls with AWS S3 SDK (@aws-sdk/client-s3)
- Update upload routes (lab PDFs, intake documents)
- Update download/read routes
- Update any pre-signed URL generation for secure file access
- Ensure uploaded files get proper content-type metadata

## Acceptance criteria
- [ ] All file uploads go to S3 (not Vercel Blob)
- [ ] All file downloads read from S3
- [ ] Lab PDF upload → store → retrieve cycle works end-to-end
- [ ] No references to Vercel Blob remain in codebase

## Dependencies
- **Blocked by:** #$I3A (S3 bucket must exist)
- **Parallel with:** Branching engine (9a), Status field (14a), Timeline wiring (21c)
BODY
)" \
  "infra,P0,week-3")
echo "  Created 3b: #$I3B"

# --- 4a ---
I4A=$(create_issue \
  "4a. Establish Anthropic BAA for API usage with PHI" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 3 (async) | **Priority:** P0
**Effort:** 1 hour to initiate, then waiting on legal

## What
- Contact Anthropic sales/support about Business Associate Agreement process
- Determine requirements (enterprise plan? Specific API usage terms?)
- Execute BAA
- Document BAA coverage and any usage requirements for compliance records
- Verify API key works from Aptible environment

## Notes
This runs in the background and may take days or weeks for legal review. Does NOT block development since we use test/synthetic data until real patients come on. But must be in place before any real PHI touches the Claude API.

## Acceptance criteria
- [ ] BAA request submitted to Anthropic
- [ ] BAA executed and documented
- [ ] API calls from Aptible environment confirmed working

## Dependencies
- **Parallel with:** Everything — this is async legal work
BODY
)" \
  "infra,P0,week-3")
echo "  Created 4a: #$I4A"

# --- 5a ---
I5A=$(create_issue \
  "5a. Audit logging table and middleware" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 4 | **Priority:** P1
**Effort:** 2 days

## What
Create audit logging for all PHI access — required for HIPAA compliance.

### Table schema
\`\`\`sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, -- view, create, update, delete, generate
  resource_type TEXT NOT NULL, -- patient, protocol, document, analysis
  resource_id UUID NOT NULL,
  ip_address INET,
  metadata JSONB, -- extra context (e.g., which fields were accessed)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at);
\`\`\`

### Middleware
- Wrap all patient-data API routes to auto-log access
- Log protocol generation events (who triggered, for which patient, model used)
- Log document upload/download events

## Acceptance criteria
- [ ] audit_log table created with indexes
- [ ] All patient data API routes log access automatically
- [ ] Protocol generation logs who triggered it
- [ ] Document access logged

## Dependencies
- **Blocked by:** #$I2A (database must be on Aptible)
- **Blocks:** #5b (audit viewer)
- **Parallel with:** AI follow-ups (10a), Edit interface (15a), Usage tracking (19a)
BODY
)" \
  "infra,P1,week-4")
echo "  Created 5a: #$I5A"

# --- 5b ---
I5B=$(create_issue \
  "5b. Audit log viewer in dashboard" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 5 | **Priority:** P2
**Effort:** 1 day

## What
- Dashboard page showing audit log entries
- Filter by: patient, date range, action type
- Practitioner sees only their own patients' audit trail (RLS enforced)
- Paginated list with timestamp, action, resource, actor

**Note:** Can be cut from MVP if running behind. Logging still happens (5a), just no UI to view it yet.

## Acceptance criteria
- [ ] Audit log page accessible from dashboard
- [ ] Filters work (patient, date, action type)
- [ ] RLS prevents seeing other practitioners' audit data

## Dependencies
- **Blocked by:** #$I5A (audit table must exist and be populated)
- **Parallel with:** Pre-call summary (12a), Client doc (16a)
BODY
)" \
  "infra,P2,week-5")
echo "  Created 5b: #$I5B"

# --- 6a ---
I6A=$(create_issue \
  "6a. Decommission Railway, Vercel, and Neon" \
  "$(cat <<'BODY'
**Parent:** #$EPIC1
**Workstream:** Infrastructure | **Week:** 6 | **Priority:** P2
**Effort:** 1 hour

## What
- Verify Aptible deployment has been stable for at least 1 week
- Cancel Railway service
- Cancel Vercel Pro subscription (\$20/mo savings)
- Cancel Neon (if still active)
- Update any DNS records
- Update documentation and bookmarks
- Remove any hardcoded Railway/Vercel URLs from codebase

## Acceptance criteria
- [ ] Railway service cancelled
- [ ] Vercel Pro cancelled
- [ ] Neon cancelled
- [ ] No old service URLs remain in code or config
- [ ] DNS points to Aptible

## Dependencies
- **Blocked by:** Aptible stable for 1+ week
- **Parallel with:** OCR (Phase 2), Call deck (17a), Email draft (18a)
BODY
)" \
  "infra,P2,week-6")
echo "  Created 6a: #$I6A"

echo ""

# =============================================================================
# EPIC 2: SMART DYNAMIC INTAKE
# =============================================================================
echo "--- Epic 2: Smart Dynamic Intake ---"

EPIC2=$(create_issue \
  "[Epic] Smart Dynamic Intake" \
  "$(cat <<'BODY'
## Epic: Smart Dynamic Intake

**Workstream:** Intake (Green)
**Target:** Weeks 1-6
**Priority:** P0 — intake quality drives protocol quality

Replace the static intake form with a guided, adaptive intake that captures complete patient data. Multi-step form with conditional branching and AI-powered follow-up questions at key points. Not a full chatbot — a structured questionnaire that's intelligent.

### Why this is MVP
The alpha test showed that incomplete intake data leads to gaps in protocol output. Better input = better output. This is the #1 lever for protocol quality.

### Sub-issues
- [ ] 7a. Design intake question map with Dr. Laura
- [ ] 8a. Build multi-step intake form shell
- [ ] 8b. Populate intake form with questions
- [ ] 9a. Conditional branching engine
- [ ] 9b. Test branching with sample patient profiles
- [ ] 10a. AI-powered follow-up questions
- [ ] 10b. Follow-up question quality testing
- [ ] 12a. Pre-call summary and lab suggestion generation
- [ ] 12b. Lab ordering tracking

### Deferred to Phase 2
- Supplement photo upload with OCR (patients type manually for now)
BODY
)" \
  "intake,P0")
echo "  Created Epic 2: #$EPIC2"

# --- 7a ---
I7A=$(create_issue \
  "7a. Design intake question map with Dr. Laura" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 1 | **Priority:** P0
**Effort:** 2-3 days (includes Dr. Laura collaboration)

## What
Sit down with Dr. Laura and map every question that matters for generating a high-quality protocol. This is the blueprint for the entire intake system.

### Sections to design
1. **Demographics & basics** — age, sex, location, primary care provider
2. **Current symptoms** — with severity (1-10), duration, frequency
3. **Health history** — conditions, diagnoses, surgeries, hospitalizations, family history
4. **Medications** — current Rx, dosages, prescribing doctor, duration
5. **Supplements** — name, brand, dosage, duration, self-selected vs. prescribed
6. **Lifestyle** — diet type, exercise (type/frequency/duration), sleep (hours/quality), stress level, alcohol, smoking
7. **Gut health** — (conditional: triggered if GI symptoms flagged) — bloating, bowel habits, food sensitivities, previous GI testing
8. **Hormones** — (conditional: triggered if hormone symptoms flagged) — cycle regularity, menopause status, HRT history, thyroid symptoms
9. **Goals & priorities** — what they want to address first, what success looks like
10. **Previous labs & tests** — what they've had done, when, any results they can share
11. **Wearables & tracking** — Apple Health, Whoop, Oura, continuous glucose monitors, etc.

### For each question, define:
- Question text (patient-friendly language)
- Answer type (text, select, multi-select, number, date, file upload, scale)
- Required vs. optional
- Conditional trigger (what answer causes this question to appear)
- Where AI follow-up would add value vs. static branching

### Deliverable
Intake Question Map document — can be a spreadsheet or structured doc that Dr. Laura reviews and approves.

## Acceptance criteria
- [ ] All sections mapped with questions
- [ ] Conditional triggers identified
- [ ] AI follow-up points identified
- [ ] Dr. Laura has reviewed and approved

## Dependencies
- **No blockers** — this is pure design work
- **Blocks:** #8a (form shell), #8b (populate questions), #9a (branching rules)
- **Parallel with:** Aptible setup (1a/1b), Protocol audit (13a), Timeline schema (21a)
BODY
)" \
  "intake,P0,week-1")
echo "  Created 7a: #$I7A"

# --- 8a ---
I8A=$(create_issue \
  "8a. Build multi-step intake form shell" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 2 | **Priority:** P0
**Effort:** 3-4 days

## What
Build the form framework — the container that questions go into. No actual questions yet, just the scaffolding.

### Requirements
- One section visible at a time (not a long scrolling form)
- Progress indicator showing % complete and section names
- Section navigation: Next, Back, jump to specific section
- Auto-save on each section completion (persist to database)
- Resume capability: patient closes browser, comes back, picks up where they left off
- Mobile-first responsive design (patients will do this on their phones)
- Clean, warm, non-clinical-feeling design
- Loading states between sections
- Validation feedback (inline, not alert boxes)

### Technical approach
- React component with section state management
- API: POST /api/patients/:id/intake/:section to save each section
- API: GET /api/patients/:id/intake to load saved progress
- Store intake data as JSONB per section

## Acceptance criteria
- [ ] Multi-step form renders with placeholder sections
- [ ] Progress bar updates as sections complete
- [ ] Auto-save works (refresh page, data persists)
- [ ] Resume works (close browser, reopen, correct section loads)
- [ ] Mobile layout works on iPhone and Android
- [ ] Section navigation (forward, back, jump) all work

## Dependencies
- **Blocked by:** #$I7A (need question map to know section structure)
- **Blocks:** #8b (populate questions), #9a (branching engine)
- **Parallel with:** DB migration (2a), S3 setup (3a), Prompt rewrite (13b)
BODY
)" \
  "intake,P0,week-2")
echo "  Created 8a: #$I8A"

# --- 8b ---
I8B=$(create_issue \
  "8b. Populate intake form with all questions" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 2-3 | **Priority:** P0
**Effort:** 2-3 days

## What
Take the question map from 7a and implement every question in every section.

### Question types to support
- Text input (short and long/textarea)
- Single select dropdown
- Multi-select checkboxes
- Numeric input (with optional unit label, e.g., "mg", "hours")
- Date picker
- Scale/slider (1-10 for severity)
- File upload (for previous lab results)
- Yes/No toggle

### Per question
- Label text (patient-friendly)
- Help text / tooltip (optional — explains why we're asking)
- Validation rules (required, min/max, format)
- Placeholder text

## Acceptance criteria
- [ ] All sections from the question map are populated
- [ ] All question types render correctly
- [ ] Validation works on required fields
- [ ] Help text appears where defined
- [ ] Data saves correctly per section (JSONB structure)

## Dependencies
- **Blocked by:** #$I7A (question map), #$I8A (form shell)
- **Parallel with:** #9a (branching is a layer on top, can be built simultaneously)
BODY
)" \
  "intake,P0,week-2,week-3")
echo "  Created 8b: #$I8B"

# --- 9a ---
I9A=$(create_issue \
  "9a. Conditional branching engine" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 3 | **Priority:** P0
**Effort:** 2-3 days

## What
Make the intake form adaptive — show/hide sections and questions based on previous answers.

### Branching rule schema
\`\`\`json
{
  "condition": {
    "field": "symptoms.digestive_issues",
    "operator": "equals",
    "value": true
  },
  "action": "show",
  "target": "gut_health_section"
}
\`\`\`

### Supported operators
- equals, not_equals
- contains (for multi-select arrays)
- greater_than, less_than (for numeric)
- is_not_empty (for any field)

### Requirements
- Rules stored in database (not hardcoded) — tunable without deploys
- Client-side evaluation for instant response (no API call to check rules)
- Rules loaded once when intake form initializes
- Initial rule set built from Dr. Laura's question map (7a)

### Example rules
- Patient checks "digestive issues" in symptoms → show Gut Health section
- Patient checks "hormone concerns" → show Hormones section
- Patient says they take supplements → show detailed supplement questions
- Patient says they use a sauna → show sauna detail questions (type, temp, duration, frequency)
- Patient age > 40 + female → show perimenopause/menopause questions

## Acceptance criteria
- [ ] Branching rules table exists in database
- [ ] Rules evaluate client-side with no latency
- [ ] Correct sections show/hide based on answers
- [ ] Rules can be updated in DB without code changes
- [ ] Initial rule set covers all conditional sections from question map

## Dependencies
- **Blocked by:** #$I7A (question map defines the rules), #$I8A (form shell)
- **Blocks:** #9b (testing), #10a (AI follow-ups layer on top)
- **Parallel with:** S3 migration (3b), Protocol status (14a), Timeline wiring (21c)
BODY
)" \
  "intake,P0,week-3")
echo "  Created 9a: #$I9A"

# --- 9b ---
I9B=$(create_issue \
  "9b. Test branching with sample patient profiles" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 3 | **Priority:** P0
**Effort:** 1 day

## What
Create 3-5 sample patient profiles and walk through the intake for each to verify branching works correctly.

### Test profiles
1. **Gut-focused patient** — bloating, food sensitivities, irregular bowel → should see full Gut Health section
2. **Hormone-focused patient** — irregular cycles, fatigue, weight gain → should see Hormones section
3. **General wellness** — no major flags → should see base sections only, no deep dives
4. **Complex multi-system** — gut + hormone + autoimmune flags → should see all conditional sections
5. **Minimal responder** — answers minimally → form still captures enough for a basic protocol

### Review with Dr. Laura
Walk through each profile together. For each: "Given these answers, does the form capture everything you'd need to generate a good protocol?"

## Acceptance criteria
- [ ] All 5 profiles tested end-to-end
- [ ] Correct sections appear for each profile
- [ ] Dr. Laura confirms data capture is sufficient
- [ ] Any gaps identified and branching rules updated

## Dependencies
- **Blocked by:** #$I9A (branching engine), #$I8B (questions populated)
BODY
)" \
  "intake,P0,week-3")
echo "  Created 9b: #$I9B"

# --- 10a ---
I10A=$(create_issue \
  "10a. AI-powered follow-up questions" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 4 | **Priority:** P1
**Effort:** 3-4 days

## What
At the end of each major section, use AI to generate 2-5 targeted follow-up questions based on what the patient just entered.

### API endpoint
\`\`\`
POST /api/intake/follow-up
Body: { patientId, section, answers }
Response: { questions: [{ text, type, options? }] }
\`\`\`

### System prompt approach
- Input: section name + patient's answers for that section
- Output: 2-5 follow-up questions that dig deeper into what they mentioned
- Tone: warm, conversational, not clinical
- Examples:
  - Patient says "I take vitamin D" → "What dosage do you take? What brand? Do you also take vitamin K2 with it?"
  - Patient says "I do sauna" → "What type of sauna — infrared or traditional? About what temperature? How long per session, and how often?"
  - Patient mentions "anxiety" → "When did you first notice the anxiety? Is it constant or situational? Have you tried any treatments for it?"

### Performance targets
- Latency: < 3 seconds (small prompt, small response)
- Cost: ~\$0.01-0.02 per AI call
- Max 1 AI call per section (10 sections × \$0.02 = \$0.20 per full intake)

### UI behavior
- After patient completes a section, brief loading state ("Just a couple more questions...")
- Follow-up questions appear seamlessly as part of the flow
- Patient answers follow-ups, then moves to next section
- Follow-ups are optional — patient can skip to next section

## Acceptance criteria
- [ ] Endpoint returns relevant follow-up questions
- [ ] Response time < 3 seconds
- [ ] Questions are contextually appropriate (not generic)
- [ ] UI integrates follow-ups seamlessly between sections
- [ ] Skip option works
- [ ] Follow-up answers saved to intake data

## Dependencies
- **Blocked by:** #$I9A (branching engine working first)
- **Blocks:** #10b (quality testing)
- **Parallel with:** Audit logging (5a), Edit interface (15a), Usage tracking (19a)
BODY
)" \
  "intake,P1,week-4")
echo "  Created 10a: #$I10A"

# --- 10b ---
I10B=$(create_issue \
  "10b. AI follow-up question quality testing" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 4 | **Priority:** P1
**Effort:** 1 day

## What
Test AI follow-up question quality with the same 5 sample patient profiles from 9b.

### Review criteria
- Are questions relevant to what the patient said?
- Are there too many or too few?
- Is the tone appropriate (warm, not interrogating)?
- Do questions add information the protocol generation would actually use?
- Dr. Laura reviews: "Would these follow-ups help me generate a better protocol?"

### Iterate
Tune the system prompt based on feedback until quality is consistently good.

## Acceptance criteria
- [ ] All 5 profiles tested with AI follow-ups
- [ ] Dr. Laura approves follow-up quality
- [ ] System prompt finalized

## Dependencies
- **Blocked by:** #$I10A
BODY
)" \
  "intake,P1,week-4")
echo "  Created 10b: #$I10B"

# --- 12a ---
I12A=$(create_issue \
  "12a. Pre-call summary and lab suggestion generation" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 5 | **Priority:** P1
**Effort:** 3-4 days

## What
After patient completes intake, generate a summary for the practitioner with suggested labs — available before the first call.

### API endpoint
\`\`\`
POST /api/patients/:id/intake-summary
\`\`\`
Triggered when patient completes intake (or practitioner manually triggers).

### AI output
- **Patient Summary:** Key findings, red flags, areas of concern, symptom patterns
- **Suggested Lab Panels:** Based on symptoms and health history
  - Example: gut symptoms → suggest GI Map, food sensitivity panel
  - Example: hormone symptoms → suggest DUTCH test, thyroid panel
  - Example: fatigue + weight gain → suggest comprehensive metabolic panel, thyroid, iron studies
- **Talking Points:** Suggested questions/topics for the first call

### Practitioner view
- Summary card on patient detail page
- Lab suggestions with checkboxes: approve, remove, add custom
- Practitioner can trigger summary regeneration after making changes

## Acceptance criteria
- [ ] Summary generates from intake data
- [ ] Lab suggestions are clinically appropriate (Dr. Laura review)
- [ ] Practitioner can approve/modify/add lab suggestions
- [ ] Summary available before first call

## Dependencies
- **Blocked by:** #$I10A (intake must capture good data), Timeline wiring (21c)
- **Parallel with:** Audit viewer (5b), Client doc (16a), Usage dashboard (19b)
BODY
)" \
  "intake,P1,week-5")
echo "  Created 12a: #$I12A"

# --- 12b ---
I12B=$(create_issue \
  "12b. Lab ordering tracking" \
  "$(cat <<'BODY'
**Parent:** #$EPIC2
**Workstream:** Intake | **Week:** 5 | **Priority:** P1
**Effort:** 1-2 days

## What
Simple tracking of which labs were suggested, ordered, and have results.

### Status per lab
suggested → ordered → results_received

### UI
- On patient detail page: lab tracking table
- Practitioner updates status manually (dropdown)
- Links back to the intake summary that prompted the suggestion

## Acceptance criteria
- [ ] Lab tracking table shows suggested labs with status
- [ ] Practitioner can update status
- [ ] Status history preserved

## Dependencies
- **Blocked by:** #$I12A (lab suggestions must exist)
- **Parallel with:** Client doc (16a)
BODY
)" \
  "intake,P1,week-5")
echo "  Created 12b: #$I12B"

echo ""

# =============================================================================
# EPIC 3: PROTOCOL QUALITY & 3-OUTPUT FLOW
# =============================================================================
echo "--- Epic 3: Protocol Quality & 3-Output Flow ---"

EPIC3=$(create_issue \
  "[Epic] Protocol Quality & 3-Output Flow" \
  "$(cat <<'BODY'
## Epic: Protocol Quality & 3-Output Flow

**Workstream:** Protocol (Yellow)
**Target:** Weeks 1-6
**Priority:** P0 — this is the core product

Improve protocol generation quality based on alpha feedback. Implement the approval-triggered 3-output flow:
1. **Clinical Protocol** (practitioner reviews, edits, approves)
2. **Client-Facing Document** (auto-generated on approval)
3. **Call Deck** (auto-generated on approval)
4. **Follow-Up Email Draft** (auto-generated on approval)

### Sub-issues
- [ ] 13a. Audit protocol output against alpha feedback
- [ ] 13b. Rewrite analysis and protocol system prompts
- [ ] 13c. Test protocol quality with Dr. Laura
- [ ] 14a. Add protocol status field (draft/approved/superseded)
- [ ] 14b. Approval endpoint and supersede logic
- [ ] 14c. Protocol list UI with status badges
- [ ] 15a. Protocol editing interface
- [ ] 15b. Edit tracking for AI feedback loop
- [ ] 16a. Generate client-facing document on approval
- [ ] 16b. Client document view page
- [ ] 17a. Generate call deck on approval
- [ ] 17b. Call deck export (PDF/PPTX)
- [ ] 18a. Generate follow-up email draft on approval
- [ ] 18b. Email drafts folder in dashboard
BODY
)" \
  "protocol,P0")
echo "  Created Epic 3: #$EPIC3"

# --- 13a ---
I13A=$(create_issue \
  "13a. Audit protocol output against alpha feedback" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 1 | **Priority:** P0
**Effort:** 1-2 days

## What
Review the Donna G comparison from Dr. Laura's alpha test. Catalog every gap and map each to a root cause.

### Gap categories
1. **Missing data** (intake problem) — data existed but wasn't captured or fed to the AI
2. **Missing prompt instruction** (prompt problem) — data was available but AI didn't reference it
3. **Model limitation** — AI couldn't reason about the data correctly

### Deliverable
Gap analysis document listing each issue, its category, and the fix approach.

### Known gaps from alpha
- GI Map data not referenced in protocol
- Transcript nuances lost
- Some generic recommendations where specific ones were warranted
- Dr. Laura's preferred format is one patient-facing doc (updated: now 3 outputs with approval gate)

## Acceptance criteria
- [ ] All alpha feedback gaps cataloged
- [ ] Each gap categorized (data / prompt / model)
- [ ] Fix approach documented for each
- [ ] Reviewed with Dr. Laura

## Dependencies
- **No blockers** — pure analysis work
- **Blocks:** #13b (prompt rewrite)
- **Parallel with:** Aptible setup (1a/1b), Question map (7a), Timeline schema (21a)
BODY
)" \
  "protocol,P0,week-1")
echo "  Created 13a: #$I13A"

# --- 13b ---
I13B=$(create_issue \
  "13b. Rewrite analysis and protocol system prompts" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 2 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 3-4 days

## What
Rewrite the system prompts for both the analysis step and protocol generation step based on the gap analysis.

### Analysis prompt updates
- Explicitly enumerate ALL uploaded documents in the prompt (don't let the model skip any)
- Require cross-referencing between documents (e.g., intake symptoms + lab results)
- Require flagging of missing data or gaps

### Protocol prompt updates
- Require systems-thinking: gut-immune-hormone interconnections
- Require explicit clinical sequencing rationale (what to address first and why)
- Supplement recommendations: specific dosing, timing, duration, brand suggestions where relevant
- Phase structure: clear Phase 1 / Phase 2 / etc. with transition criteria
- Red flags section: conditions that warrant referral to specialist
- Contraindications and interactions
- Match Dr. Laura's preferred output structure

### Important
Prompt files live in \`services/analysis-engine/prompts/\` and should be version-controlled with descriptive commit messages.

## Acceptance criteria
- [ ] Analysis prompt addresses all "missing data" gaps from 13a
- [ ] Protocol prompt addresses all "missing instruction" gaps from 13a
- [ ] Both prompts version-controlled
- [ ] Ready for testing with Dr. Laura (13c)

## Dependencies
- **Blocked by:** #$I13A (gap analysis)
- **Blocks:** #13c (quality testing)
- **Parallel with:** Form shell (8a), DB migration (2a), Timeline table (21b)
BODY
)" \
  "protocol,P0,critical-path,week-2")
echo "  Created 13b: #$I13B"

# --- 13c ---
I13C=$(create_issue \
  "13c. Test protocol quality with Dr. Laura" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 3 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 2-3 days (includes iteration cycles)

## What
Run protocol generation on existing test patient data with the rewritten prompts. Dr. Laura reviews output quality.

### Testing process
1. Generate protocol with new prompts
2. Dr. Laura reviews: "How much editing would this need?"
3. Identify remaining gaps
4. Iterate on prompts
5. Repeat until quality target is met

### Quality target
"I'd change maybe 10-15% of this" — not "I'd rewrite half of it"

### Test with multiple patient profiles if possible
- Simple case (single system issue)
- Complex case (multi-system, multiple labs)

## Acceptance criteria
- [ ] Dr. Laura reviews at least 2 generated protocols
- [ ] Protocol references all uploaded documents
- [ ] Clinical sequencing is appropriate
- [ ] Dr. Laura estimates < 15% editing needed
- [ ] Prompts finalized based on feedback

## Dependencies
- **Blocked by:** #$I13B (rewritten prompts), Timeline wiring (21c)
- **Blocks:** Edit interface (15a) — need good protocols to edit
- **Parallel with:** Branching engine (9a), Status field (14a)
BODY
)" \
  "protocol,P0,critical-path,week-3")
echo "  Created 13c: #$I13C"

# --- 14a ---
I14A=$(create_issue \
  "14a. Add protocol status field (draft / approved / superseded)" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 3 | **Priority:** P0
**Effort:** Half day

## What
Add status management to protocols.

### Migration
\`\`\`sql
ALTER TABLE protocols ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'approved', 'superseded'));
CREATE INDEX idx_protocols_status ON protocols(patient_id, status);
\`\`\`

### Behavior
- New protocols default to \`draft\`
- Only one protocol per patient can be \`approved\` at a time
- When one is approved, all others become \`superseded\`
- Superseded protocols are soft-deleted (hidden from main UI, visible in history)

## Acceptance criteria
- [ ] Status column added with migration
- [ ] Default is 'draft'
- [ ] Protocol list queries updated to respect status
- [ ] Existing protocols migrated to 'draft' status

## Dependencies
- **Parallel with:** Branching (9a), Quality testing (13c), S3 migration (3b)
- **Blocks:** #14b (approval endpoint), #14c (status UI)
BODY
)" \
  "protocol,P0,week-3")
echo "  Created 14a: #$I14A"

# --- 14b ---
I14B=$(create_issue \
  "14b. Approval endpoint and supersede logic" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 3 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 1 day

## What
\`\`\`
POST /api/protocols/:id/approve
\`\`\`

### Logic
1. Set this protocol's status to \`approved\`
2. Set ALL other protocols for this patient to \`superseded\`
3. Create audit log entry (who approved, when)
4. **Trigger derivative output generation:**
   - Client-facing document (16a)
   - Call deck (17a)
   - Follow-up email draft (18a)
5. Return the approved protocol with generated output IDs

### Important
The approval is the gate. Everything downstream (client doc, deck, email) fires from this single action.

## Acceptance criteria
- [ ] Endpoint approves protocol and supersedes others
- [ ] Audit log entry created
- [ ] Derivative output generation triggered (can be async)
- [ ] Returns approved protocol

## Dependencies
- **Blocked by:** #$I14A (status field)
- **Blocks:** #16a (client doc), #17a (call deck), #18a (email draft)
BODY
)" \
  "protocol,P0,critical-path,week-3")
echo "  Created 14b: #$I14B"

# --- 14c ---
I14C=$(create_issue \
  "14c. Protocol list UI with status badges" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 3-4 | **Priority:** P1
**Effort:** 1 day

## What
- Show status badge on each protocol in the list: Draft (gray), Approved (green), Superseded (muted)
- Superseded protocols collapsed into a "Version history" accordion
- "Approve" button visible only on draft protocols
- "Edit" button visible only on draft protocols

## Acceptance criteria
- [ ] Status badges render correctly
- [ ] Version history accordion works
- [ ] Approve button only on drafts
- [ ] Clean, clear UI

## Dependencies
- **Blocked by:** #$I14A (status field)
BODY
)" \
  "protocol,P1,week-3,week-4")
echo "  Created 14c: #$I14C"

# --- 15a ---
I15A=$(create_issue \
  "15a. Protocol editing interface" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 4 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 4-5 days

## What
Let the practitioner edit the clinical protocol before approving it.

### Requirements
- Section-by-section editing: click a section header to expand and edit
- Rich text within sections: bold, italic, lists, links (use Tiptap or similar lightweight editor)
- Save edits — creates a new version but preserves the AI original for comparison
- Diff view: highlight what practitioner changed vs. AI original (optional toggle)
- "Approve" button prominently placed — this triggers the 3 derivative outputs

### UX flow
1. Practitioner opens draft protocol
2. Reads through, clicks sections to edit
3. Makes changes, saves
4. Reviews final version
5. Clicks "Approve" → triggers client doc + call deck + email draft

## Acceptance criteria
- [ ] Section-by-section editing works
- [ ] Rich text editing (bold, lists) works
- [ ] Edits save without losing original version
- [ ] Diff view shows changes
- [ ] Approve button triggers derivative outputs
- [ ] Mobile-usable (practitioners may review on iPad)

## Dependencies
- **Blocked by:** #$I14A (status field), #$I13C (need good protocols to edit)
- **Blocks:** Integration testing
- **Parallel with:** AI follow-ups (10a), Audit logging (5a), Usage tracking (19a)
BODY
)" \
  "protocol,P0,critical-path,week-4")
echo "  Created 15a: #$I15A"

# --- 15b ---
I15B=$(create_issue \
  "15b. Edit tracking for AI feedback loop" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 4 | **Priority:** P2
**Effort:** 1-2 days

## What
Store what practitioners change so we can improve prompts over time.

- Store AI original version + practitioner-edited version
- Compute and store diff (which sections changed, what was added/removed/modified)
- If practitioners always edit the same section, the prompt needs improvement there

**Can be cut from MVP if behind** — the data is still captured (we have both versions from 15a), analysis can be done manually.

## Acceptance criteria
- [ ] Both versions stored (original + edited)
- [ ] Diff computed and stored
- [ ] Can query: "which sections get edited most often?"

## Dependencies
- **Blocked by:** #$I15A
BODY
)" \
  "protocol,P2,week-4")
echo "  Created 15b: #$I15B"

# --- 16a ---
I16A=$(create_issue \
  "16a. Generate client-facing document on approval" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 5 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 3-4 days

## What
When practitioner approves a clinical protocol, automatically generate the client-facing document.

### Database
\`\`\`sql
CREATE TABLE protocol_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id),
  type TEXT NOT NULL CHECK (type IN ('client_doc', 'call_deck', 'follow_up_email')),
  content JSONB NOT NULL,
  file_key TEXT, -- S3 key if exported
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_protocol_outputs ON protocol_outputs(protocol_id, type);
\`\`\`

### System prompt for transformation
- Input: the approved clinical protocol content
- Output: phased action plan in warm, clear, patient-friendly language
- Requirements:
  - No unexplained jargon (or jargon with simple explanations)
  - Phased: "Here's what we're doing in Phase 1 and why"
  - Practical daily/weekly actions the patient can follow
  - Encouraging, warm tone
  - Supplement list with simple instructions (when to take, with food or not)
  - Clear phase transition markers
  - Disclaimer footer

### Trigger
Called automatically by the approval endpoint (14b). Can also be manually retriggered.

## Acceptance criteria
- [ ] protocol_outputs table created
- [ ] Client doc generates on approval
- [ ] Output is patient-friendly (Dr. Laura review)
- [ ] Stored as protocol_output type='client_doc'
- [ ] Disclaimer included in output

## Dependencies
- **Blocked by:** #$I14B (approval endpoint triggers this)
- **Blocks:** #16b (view page), Integration testing
- **Parallel with:** Pre-call summary (12a), Audit viewer (5b), Usage dashboard (19b)
BODY
)" \
  "protocol,P0,critical-path,week-5")
echo "  Created 16a: #$I16A"

# --- 16b ---
I16B=$(create_issue \
  "16b. Client document view page" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 5-6 | **Priority:** P1
**Effort:** 2 days

## What
Clean, readable view of the client-facing document.

- Mobile-friendly (patients read on phones)
- Phased layout with clear visual hierarchy
- Print-friendly CSS
- Practitioner can preview before sharing with patient
- Share button / link generation for patient access

## Acceptance criteria
- [ ] Document renders cleanly on desktop and mobile
- [ ] Print layout works
- [ ] Practitioner preview mode
- [ ] Disclaimer visible

## Dependencies
- **Blocked by:** #$I16A (document must exist)
BODY
)" \
  "protocol,P1,week-5,week-6")
echo "  Created 16b: #$I16B"

# --- 17a ---
I17A=$(create_issue \
  "17a. Generate call deck on approval" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 6 | **Priority:** P1
**Effort:** 3-4 days

## What
Auto-generate a 5-7 slide summary deck when protocol is approved. Practitioner uses this to walk the patient through the plan on their call.

### Slide structure
1. **Patient Overview** — key findings, primary concerns
2. **Root Cause Analysis** — simplified systems view (gut-immune-hormone connections)
3. **Phase 1 Plan** — what we're doing first and why
4. **Phase 1 Actions** — supplements, diet changes, lifestyle modifications
5. **Phase 2 Preview** — what comes next once Phase 1 is established
6. **Summary** — supplement/action checklist at a glance
7. **Next Steps & Timeline** — when to follow up, what to expect

### Stored as
protocol_output type='call_deck', content is JSON array of slide objects

### Viewer
Simple HTML/CSS slide presentation view in the app (arrow keys to navigate, or click)

## Acceptance criteria
- [ ] Deck generates on approval (alongside client doc)
- [ ] 5-7 slides with appropriate content per slide
- [ ] Slide viewer works in browser
- [ ] Content is concise and visual (not walls of text)
- [ ] Disclaimer on final slide

## Dependencies
- **Blocked by:** #$I14B (approval trigger), #$I16A (same trigger — build after client doc works)
- **Parallel with:** Email draft (18a), Decommission (6a)
BODY
)" \
  "protocol,P1,week-6")
echo "  Created 17a: #$I17A"

# --- 17b ---
I17B=$(create_issue \
  "17b. Call deck export (PDF/PPTX)" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 6-7 | **Priority:** P2
**Effort:** 2 days

## What
Export the call deck as PDF or PPTX for practitioners who want a file.

- PDF export via puppeteer or html-pdf
- PPTX export via pptxgenjs

**Can be cut from MVP** — HTML viewer is sufficient. Practitioners can screen share the in-app viewer.

## Acceptance criteria
- [ ] PDF export works
- [ ] PPTX export works (stretch)
- [ ] Downloaded file looks clean

## Dependencies
- **Blocked by:** #$I17A
BODY
)" \
  "protocol,P2,week-6,week-7-8")
echo "  Created 17b: #$I17B"

# --- 18a ---
I18A=$(create_issue \
  "18a. Generate follow-up email draft on approval" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 6 | **Priority:** P1
**Effort:** 1-2 days

## What
Auto-generate a follow-up email draft when protocol is approved.

### System prompt
- Input: approved protocol content + patient name
- Output: professional, warm email summarizing:
  - What was discussed / the plan
  - Phase 1 actions and timeline
  - What to expect
  - How to reach the practitioner with questions
  - Disclaimer footer
- Tone: personal, encouraging, clear

### Stored as
protocol_output type='follow_up_email'

## Acceptance criteria
- [ ] Email draft generates on approval
- [ ] Tone is warm and professional
- [ ] Content accurately reflects the protocol
- [ ] Disclaimer in footer
- [ ] Stored as protocol_output

## Dependencies
- **Blocked by:** #$I14B (approval trigger)
- **Parallel with:** Call deck (17a)
BODY
)" \
  "protocol,P1,week-6")
echo "  Created 18a: #$I18A"

# --- 18b ---
I18B=$(create_issue \
  "18b. Email drafts folder in dashboard" \
  "$(cat <<'BODY'
**Parent:** #$EPIC3
**Workstream:** Protocol | **Week:** 6 | **Priority:** P2
**Effort:** 1-2 days

## What
- Dashboard section: pending email drafts
- Practitioner can view and edit the draft
- "Copy to clipboard" button
- "Open in email client" button (mailto: link with pre-filled subject and body)
- Mark as sent (for tracking)

**Can be cut from MVP** — copy to clipboard from the protocol output view is sufficient.

## Acceptance criteria
- [ ] Drafts list in dashboard
- [ ] Edit capability
- [ ] Copy to clipboard works
- [ ] Open in email client works
- [ ] Can mark as sent

## Dependencies
- **Blocked by:** #$I18A
BODY
)" \
  "protocol,P2,week-6")
echo "  Created 18b: #$I18B"

echo ""

# =============================================================================
# EPIC 4: DATA MODEL & PLATFORM
# =============================================================================
echo "--- Epic 4: Data Model & Platform ---"

EPIC4=$(create_issue \
  "[Epic] PatientTimeline Data Model & Platform" \
  "$(cat <<'BODY'
## Epic: PatientTimeline Data Model & Platform

**Workstream:** Data Model (Purple)
**Target:** Weeks 1-6
**Priority:** P0 — foundational data model everything builds on

Implement PatientTimeline as the core data model. Every patient interaction becomes a timeline event. Protocol generation, intake summaries, and all future features read from this timeline.

Also includes usage tracking, generation limits, and the platform disclaimer.

### Sub-issues
- [ ] 21a. Design PatientTimeline schema
- [ ] 21b. Create table, migration, and migrate existing data
- [ ] 21c. Wire protocol generation to read from timeline
- [ ] 21d. Ensure new intake data writes to timeline
- [ ] 19a. Usage tracking table and limits enforcement
- [ ] 19b. Usage dashboard for practitioners
- [ ] 20a. Add disclaimer to all outputs and portal
BODY
)" \
  "data-model,P0")
echo "  Created Epic 4: #$EPIC4"

# --- 21a ---
I21A=$(create_issue \
  "21a. Design PatientTimeline schema" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 1 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 1 day

## What
Design the timeline table and JSONB schemas per event type.

### Table
\`\`\`sql
CREATE TABLE patient_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'intake_submission', 'lab_result', 'call_transcript',
    'protocol_generated', 'protocol_approved', 'outcome_checkin',
    'practitioner_note', 'document_upload'
  )),
  content JSONB NOT NULL,
  source_file_key TEXT, -- S3 key, nullable
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_timeline_patient ON patient_timeline(patient_id, created_at);
CREATE INDEX idx_timeline_type ON patient_timeline(patient_id, event_type);
\`\`\`

### JSONB schemas per event type
- **intake_submission:** { section, answers: {...}, follow_up_answers: {...} }
- **lab_result:** { lab_type, values: [...], extracted_text, pdf_key }
- **call_transcript:** { transcript_text, duration_minutes, key_topics: [...] }
- **protocol_generated:** { protocol_id, model_id, prompt_version }
- **protocol_approved:** { protocol_id, approved_by, edits_summary }
- **outcome_checkin:** { phase, patient_report, practitioner_notes }
- **practitioner_note:** { note_text, category }
- **document_upload:** { filename, file_type, file_key, description }

### RLS
Practitioner can only access timeline events for their own patients.

## Acceptance criteria
- [ ] Schema documented with all event types
- [ ] JSONB structure defined per event type
- [ ] RLS policy designed
- [ ] Ready for implementation (21b)

## Dependencies
- **No blockers** — pure design
- **Blocks:** #21b (implementation)
- **Parallel with:** Aptible setup (1a), Question map (7a), Protocol audit (13a)
BODY
)" \
  "data-model,P0,critical-path,week-1")
echo "  Created 21a: #$I21A"

# --- 21b ---
I21B=$(create_issue \
  "21b. Create PatientTimeline table and migrate existing data" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 2 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 2-3 days

## What
- Create database migration for patient_timeline table
- Apply RLS policies
- Write data migration scripts to backfill existing data:
  - Existing intake submissions → timeline events (type: intake_submission)
  - Existing lab uploads → timeline events (type: lab_result)
  - Existing protocols → timeline events (type: protocol_generated)
- Verify all existing data appears in timeline
- Verify RLS policies work (practitioner A can't see practitioner B's patient timelines)

## Acceptance criteria
- [ ] Table created with indexes and RLS
- [ ] Existing intake data migrated
- [ ] Existing lab data migrated
- [ ] Existing protocols migrated
- [ ] RLS verified
- [ ] API endpoint: GET /api/patients/:id/timeline returns events

## Dependencies
- **Blocked by:** #$I21A (schema), DB migration to Aptible (#$I2A)
- **Blocks:** #21c (wire generation)
- **Parallel with:** Form shell (8a), Prompt rewrite (13b)
BODY
)" \
  "data-model,P0,critical-path,week-2")
echo "  Created 21b: #$I21B"

# --- 21c ---
I21C=$(create_issue \
  "21c. Wire protocol generation to read from PatientTimeline" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 3 | **Priority:** P0 | **CRITICAL PATH**
**Effort:** 2-3 days

## What
Refactor the protocol generation pipeline (analysis.ts) to pull ALL patient context from the PatientTimeline.

### Current behavior
- Ad-hoc data gathering from multiple tables
- Alpha test showed this missed documents (GI Map data not referenced)

### New behavior
- Query: SELECT * FROM patient_timeline WHERE patient_id = ? ORDER BY created_at
- Build patient context by iterating timeline events
- Each event type contributes to a section of the AI prompt context:
  - intake_submission → patient background
  - lab_result → lab data
  - document_upload → additional documents
  - call_transcript → practitioner-patient discussion context
  - practitioner_note → additional context
- All timeline events included — no more missed documents

### Also
- Write a protocol_generated event to timeline when generation completes
- Write a protocol_approved event when approval happens

## Acceptance criteria
- [ ] Protocol generation reads exclusively from timeline
- [ ] ALL timeline events for the patient are included in context
- [ ] No more missed documents
- [ ] Protocol generation still works end-to-end
- [ ] New timeline events created on generation and approval

## Dependencies
- **Blocked by:** #$I21B (table must exist with data)
- **Blocks:** Quality testing with Dr. Laura (#$I13C)
- **Parallel with:** Branching engine (9a), S3 migration (3b), Status field (14a)
BODY
)" \
  "data-model,P0,critical-path,week-3")
echo "  Created 21c: #$I21C"

# --- 21d ---
I21D=$(create_issue \
  "21d. Ensure new intake and upload data writes to timeline" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 3-4 | **Priority:** P0
**Effort:** 1-2 days

## What
All new data entry points must write to the PatientTimeline.

### Write points
- Patient submits an intake section → write intake_submission event
- Practitioner uploads a document → write document_upload event
- Lab results uploaded → write lab_result event
- Practitioner adds a note → write practitioner_note event

### Important
This ensures the timeline is always current going forward. Combined with 21b (backfill), the timeline becomes the single source of truth for all patient data.

## Acceptance criteria
- [ ] Intake form writes to timeline on each section save
- [ ] Document upload writes to timeline
- [ ] Lab upload writes to timeline
- [ ] Practitioner notes write to timeline
- [ ] All events queryable via GET /api/patients/:id/timeline

## Dependencies
- **Blocked by:** #$I21B (table exists), Form with questions (#$I8B)
- **Parallel with:** Approval endpoint (14b), AI follow-ups (10a)
BODY
)" \
  "data-model,P0,week-3,week-4")
echo "  Created 21d: #$I21D"

# --- 19a ---
I19A=$(create_issue \
  "19a. Usage tracking table and generation limits" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 4 | **Priority:** P1
**Effort:** 2 days

## What
Track protocol generations per practitioner and enforce tier limits.

### Table
\`\`\`sql
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES users(id),
  billing_month DATE NOT NULL, -- first of month
  active_clients INT NOT NULL DEFAULT 0,
  generations_used INT NOT NULL DEFAULT 0,
  generation_limit INT NOT NULL DEFAULT 15, -- configurable per tier
  UNIQUE(practitioner_id, billing_month)
);
\`\`\`

### Logic
- Increment generations_used on each protocol generation
- Check limit BEFORE allowing generation:
  - If at limit → return friendly error with upgrade prompt
  - If at 80% → show warning but allow
- Active clients counted as patients with any activity this month

### Pricing tiers (configurable)
- Base (\$49 + \$20/client): 3 generations per client
- Premium (\$49 + \$30/client): 5 generations per client
- Extra generations: \$7 each

## Acceptance criteria
- [ ] Usage table created
- [ ] Generations increment on protocol creation
- [ ] Limit check prevents generation when exceeded
- [ ] Friendly error message when at limit
- [ ] Warning when approaching limit (80%)

## Dependencies
- **Blocked by:** DB on Aptible (#$I2A)
- **Blocks:** #19b (usage dashboard)
- **Parallel with:** AI follow-ups (10a), Edit interface (15a), Audit logging (5a)
BODY
)" \
  "data-model,P1,week-4")
echo "  Created 19a: #$I19A"

# --- 19b ---
I19B=$(create_issue \
  "19b. Usage dashboard for practitioners" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 5 | **Priority:** P1
**Effort:** 1-2 days

## What
- Card on main dashboard: "X of Y generations used this month"
- Progress bar visualization
- Link to detailed usage page:
  - Per-client breakdown (which clients used how many generations)
  - Month-over-month history
- Warning state styling when approaching limit (80%+)
- "Need more?" link to upgrade or buy extra generations

## Acceptance criteria
- [ ] Dashboard card shows current usage
- [ ] Detailed breakdown page works
- [ ] Warning state at 80%
- [ ] Looks clean and clear

## Dependencies
- **Blocked by:** #$I19A (usage tracking)
- **Parallel with:** Pre-call summary (12a), Client doc (16a), Audit viewer (5b)
BODY
)" \
  "data-model,P1,week-5")
echo "  Created 19b: #$I19B"

# --- 20a ---
I20A=$(create_issue \
  "20a. Add disclaimer to all outputs and portal" \
  "$(cat <<'BODY'
**Parent:** #$EPIC4
**Workstream:** Data Model | **Week:** 6 | **Priority:** P1
**Effort:** 1 day

## What
Add the standard disclaimer everywhere it needs to appear.

### Disclaimer text (draft — legal review recommended)
> Clinical Signal is a research and clinical workflow tool designed for licensed healthcare practitioners. It does not provide medical advice, diagnosis, or treatment recommendations. All AI-generated analyses, protocols, and documents are intended as practitioner decision-support tools and must be reviewed, edited, and approved by a qualified healthcare professional before use with patients. Clinical Signal is not a substitute for professional clinical judgment.

### Placement
- [ ] Clinical protocol view (footer)
- [ ] Client-facing document (footer)
- [ ] Call deck (final slide)
- [ ] Follow-up email draft (footer)
- [ ] Portal login/landing page
- [ ] Dashboard footer (subtle)

### Styling
Consistent across all placements — smaller font, muted color, always present but not dominating.

## Acceptance criteria
- [ ] Disclaimer appears in all listed locations
- [ ] Styling is consistent
- [ ] Text is accurate (pending legal review)

## Dependencies
- **Blocked by:** Client doc (16a), Call deck (17a), Email draft (18a) — outputs must exist
- **Parallel with:** Decommission (6a)
BODY
)" \
  "data-model,P1,week-6")
echo "  Created 20a: #$I20A"

echo ""

# =============================================================================
# EPIC 5: INTEGRATION TESTING
# =============================================================================
echo "--- Epic 5: Integration Testing ---"

EPIC5=$(create_issue \
  "[Epic] MVP Integration Testing" \
  "$(cat <<'BODY'
## Epic: MVP Integration Testing

**Target:** Weeks 7-8
**Priority:** P0

Full end-to-end testing of the complete MVP flow before ship.

### Sub-issues
- [ ] INT-1. End-to-end flow test with Dr. Laura
- [ ] INT-2. Mobile testing of patient intake
- [ ] INT-3. Load testing on Aptible
- [ ] INT-4. Security review
BODY
)" \
  "P0,week-7-8")
echo "  Created Epic 5: #$EPIC5"

# --- INT-1 ---
INT1=$(create_issue \
  "INT-1. End-to-end flow test with Dr. Laura" \
  "$(cat <<'BODY'
**Parent:** #$EPIC5
**Week:** 7-8 | **Priority:** P0
**Effort:** 2-3 days

## What
Create a fresh test patient and walk through the complete flow:

1. Patient goes through smart dynamic intake (conditional branching + AI follow-ups)
2. Pre-call summary and lab suggestions generated
3. Practitioner reviews intake summary
4. Lab PDFs uploaded
5. Protocol generated from full PatientTimeline
6. Practitioner reviews clinical protocol
7. Practitioner edits protocol
8. Practitioner approves → triggers client doc + call deck + email draft
9. Verify all 3 derivative outputs generated correctly
10. Verify draft protocols are superseded
11. Verify usage tracking incremented
12. Verify audit log captured all access
13. Client-facing document is readable and patient-friendly
14. Call deck has appropriate slide content
15. Email draft is warm and accurate

## Acceptance criteria
- [ ] Complete flow works end-to-end without errors
- [ ] Dr. Laura approves protocol quality
- [ ] Dr. Laura approves client document quality
- [ ] Dr. Laura approves call deck content
- [ ] All systems (audit, usage, status) work correctly
BODY
)" \
  "P0,week-7-8")
echo "  Created INT-1: #$INT1"

# --- INT-2 ---
INT2=$(create_issue \
  "INT-2. Mobile testing of patient intake" \
  "$(cat <<'BODY'
**Parent:** #$EPIC5
**Week:** 7-8 | **Priority:** P0
**Effort:** 1 day

## What
Test the full patient intake flow on mobile devices.

### Test on
- iPhone (Safari)
- Android (Chrome)

### Verify
- [ ] Form renders correctly on small screens
- [ ] Progress saves between sessions
- [ ] Resume works (close browser, reopen)
- [ ] Conditional sections appear correctly
- [ ] AI follow-up questions render and respond quickly
- [ ] File upload works (for previous labs)
- [ ] All question types usable on mobile (dropdowns, scales, etc.)
BODY
)" \
  "P0,week-7-8")
echo "  Created INT-2: #$INT2"

# --- INT-3 ---
INT3=$(create_issue \
  "INT-3. Load testing on Aptible" \
  "$(cat <<'BODY'
**Parent:** #$EPIC5
**Week:** 7-8 | **Priority:** P1
**Effort:** 1 day

## What
Verify the platform handles concurrent use without issues.

### Tests
- [ ] Simulate 2-3 concurrent protocol generations
- [ ] Verify long-running requests (8+ minutes) don't crash on Aptible
- [ ] Verify stream recovery still works if connections drop
- [ ] Test behavior at usage limits (friendly error, no crashes)
- [ ] Check Aptible container resource usage (memory, CPU)
BODY
)" \
  "P1,week-7-8")
echo "  Created INT-3: #$INT3"

# --- INT-4 ---
INT4=$(create_issue \
  "INT-4. Security review" \
  "$(cat <<'BODY'
**Parent:** #$EPIC5
**Week:** 7-8 | **Priority:** P0
**Effort:** 1-2 days

## What
Verify all HIPAA security requirements are met.

### Checklist
- [ ] RLS prevents cross-practitioner data access (test with 2 practitioner accounts)
- [ ] Audit logs capture ALL PHI access
- [ ] S3 bucket has no public access (verify with AWS CLI)
- [ ] No PHI in application logs or error messages (review Aptible logs)
- [ ] Session timeouts work (15 minute default)
- [ ] TLS enforced on all endpoints
- [ ] Database encryption at rest confirmed
- [ ] Environment variables not exposed in client-side code
- [ ] File uploads validated (type, size limits)
- [ ] API endpoints all require authentication
- [ ] Disclaimer present on all outputs
BODY
)" \
  "P0,week-7-8")
echo "  Created INT-4: #$INT4"

# --- Deferred: Supplement OCR ---
echo ""
echo "--- Phase 2 (Deferred) ---"
IOCR=$(create_issue \
  "11a. Supplement photo upload with OCR" \
  "$(cat <<'BODY'
**Workstream:** Intake | **Priority:** Phase 2
**Effort:** 3-4 days

## What
Patient snaps a photo of supplement bottles. OCR extracts text, AI structures it into supplement records. Patient confirms before saving.

### Deferred from MVP
Patients can type supplements manually for now. This is a convenience feature.

### When to build
After MVP ships and core flow is stable.

### Implementation
- Photo upload component (camera capture + gallery selection)
- OCR: Claude Vision API (send photo, extract supplement name, brand, dosage, ingredients)
- AI structuring of OCR text into supplement records
- Patient confirmation screen: "We found these — is this right?"

## Acceptance criteria
- [ ] Photo upload works (camera + gallery)
- [ ] OCR extracts supplement details accurately
- [ ] Patient can confirm/correct
- [ ] Structured data saved to intake
BODY
)" \
  "intake,phase-2")
echo "  Created Phase 2 OCR: #$IOCR"

echo ""
echo "================================================"
echo "  All issues created!"
echo "================================================"
echo ""
echo "Summary:"
echo "  - 5 Epics (parent issues)"
echo "  - ~40 sub-issues across 4 workstreams"
echo "  - Labels: infra, intake, protocol, data-model"
echo "  - Priority: P0, P1, P2"
echo "  - Week targets: week-1 through week-7-8"
echo "  - Critical path items labeled: critical-path"
echo "  - 1 Phase 2 deferred issue (Supplement OCR)"
echo ""
echo "View all issues: gh issue list --repo $REPO --state open"
echo "View by label:   gh issue list --repo $REPO --label critical-path"
echo ""
