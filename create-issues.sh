#!/bin/bash
# Run from the clinical-signal-main repo root:
#   chmod +x create-issues.sh && ./create-issues.sh
#
# Requires: gh auth login (already done)

REPO="Clinical-Signal/clinical-signal-main"

echo "Creating labels..."
gh label create "before-launch" --color "B60205" --description "Must fix before real patient data" --repo "$REPO" 2>/dev/null
gh label create "ai-quality" --color "5319E7" --description "AI output quality improvement" --repo "$REPO" 2>/dev/null
gh label create "data-integrity" --color "0E8A16" --description "Database constraints and data safety" --repo "$REPO" 2>/dev/null
gh label create "production" --color "1D76DB" --description "Production readiness and scale" --repo "$REPO" 2>/dev/null
gh label create "safety" --color "D93F0B" --description "Clinical safety guardrail" --repo "$REPO" 2>/dev/null
gh label create "critical" --color "B60205" --description "Critical severity" --repo "$REPO" 2>/dev/null
gh label create "security" --color "E4E669" --description "Security issue" --repo "$REPO" 2>/dev/null
gh label create "post-mvp" --color "C2E0C6" --description "Post-MVP polish" --repo "$REPO" 2>/dev/null
echo "Labels created."
echo ""

# ═══════════════════════════════════════════════════════════════
# EPIC 1: Security — Before Launch
# ═══════════════════════════════════════════════════════════════

echo "Creating Epic 1: Security — Before Launch..."
EPIC1=$(gh issue create --repo "$REPO" \
  --title "Epic: Security fixes — Before Launch" \
  --label "security,before-launch" \
  --body "$(cat <<'EOF'
## Security — Before Launch

These MUST be fixed before any real patient data enters the system. Two critical issues (RLS and SSL) plus three high-severity auth/validation gaps.

### Sub-issues
- [ ] [CRITICAL] Fix RLS policy GUC variable mismatch
- [ ] [CRITICAL] Enable SSL certificate validation on DB connections
- [ ] [HIGH] Sanitize error messages across all API routes
- [ ] [HIGH] Add content-type validation for file uploads
- [ ] [HIGH] Add authorization check on protocol outputs route

**Total effort:** ~6-8 hours
EOF
)" 2>&1 | grep -oE 'https://[^ ]+')
echo "  Epic 1: $EPIC1"

gh issue create --repo "$REPO" \
  --title "[CRITICAL] Fix RLS policy GUC variable mismatch" \
  --label "security,critical,before-launch" \
  --body "$(cat <<EOF
**Parent:** $EPIC1
**Effort:** 1 hour

Migration 0011 (intake_documents) creates RLS policies that check \`current_setting('app.tenant_id')\`, but \`withTenant()\` in \`lib/db.ts\` sets the GUC as \`app.current_tenant_id\`. This mismatch means RLS policies on the intake_documents table may not enforce tenant isolation correctly.

### What to do
1. Audit every migration file — grep for \`app.tenant_id\` and \`app.current_tenant_id\`
2. Fix all RLS policies to use the correct GUC name that \`withTenant()\` sets
3. Add an integration test that attempts cross-tenant access and verifies it fails

### Why it matters
This could allow one practitioner to see another practitioner's patient documents. For PHI, this is a showstopper.

**File:** \`migrations/0011_intake_documents.sql\`, all other migration files with RLS
EOF
)"

gh issue create --repo "$REPO" \
  --title "[CRITICAL] Enable SSL certificate validation on database connections" \
  --label "security,critical,before-launch" \
  --body "$(cat <<EOF
**Parent:** $EPIC1
**Effort:** 30 min

\`lib/db.ts\` sets \`rejectUnauthorized: false\` for SSL connections. This disables certificate validation, meaning the app will connect to any server presenting any SSL certificate — including a man-in-the-middle attacker intercepting PHI.

### What to do
1. Set \`rejectUnauthorized: true\` in the SSL config
2. Configure the CA certificate from Railway (available in the connection string or dashboard)
3. Test the connection in staging before deploying

**File:** \`lib/db.ts\` — connection pool SSL configuration
EOF
)"

gh issue create --repo "$REPO" \
  --title "[HIGH] Sanitize error messages across all API routes" \
  --label "security,before-launch" \
  --body "$(cat <<EOF
**Parent:** $EPIC1
**Effort:** 2-3 hours

9 of 10 API routes return \`err.message\` directly in JSON responses. This can expose database schema details, file paths, and internal state. For HIPAA, error messages from DB queries could reveal table structures or data patterns.

### What to do
1. Create a centralized \`withErrorHandling()\` wrapper or utility
2. Log full error server-side with request context
3. Return generic error codes to client: \`{ error: "BRIEF_GENERATION_FAILED", code: "E4001" }\`
4. Apply to all routes in \`apps/web/app/api/patients/[id]/\`

**Files:** All API routes under \`apps/web/app/api/\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[HIGH] Add content-type validation for file uploads" \
  --label "security,before-launch" \
  --body "$(cat <<EOF
**Parent:** $EPIC1
**Effort:** 1-2 hours

File upload validation checks extension only (.pdf, .jpg, etc.) but not actual file content. A malicious file with a .pdf extension could be an executable.

### What to do
1. Add \`file-type\` npm package
2. Inspect magic bytes on upload
3. Reject files where extension doesn't match detected content type

**File:** Document upload route
EOF
)"

gh issue create --repo "$REPO" \
  --title "[HIGH] Add authorization check on protocol outputs route" \
  --label "security,before-launch" \
  --body "$(cat <<EOF
**Parent:** $EPIC1
**Effort:** 30 min

Protocol outputs route checks patient belongs to tenant but doesn't verify the protocolId belongs to that patient. A practitioner could access protocol outputs for a different patient within the same tenant.

### What to do
Add: \`SELECT 1 FROM protocols WHERE id = \$1 AND patient_id = \$2\` before returning outputs.

**File:** \`apps/web/app/api/patients/[id]/protocol/[protocolId]/\`
EOF
)"

# ═══════════════════════════════════════════════════════════════
# EPIC 2: AI Output Quality
# ═══════════════════════════════════════════════════════════════

echo ""
echo "Creating Epic 2: AI Output Quality..."
EPIC2=$(gh issue create --repo "$REPO" \
  --title "Epic: AI Output Quality" \
  --label "ai-quality" \
  --body "$(cat <<'EOF'
## AI Output Quality

The core value prop. These directly affect whether practitioners trust and adopt the platform. Protocol generation is the single biggest time bottleneck for practitioners — the quality of AI output determines product-market fit.

### Sub-issues
- [ ] [HIGH] Add document source attribution to AI prompts
- [ ] [HIGH] Add post-generation safety validation pass
- [ ] [HIGH] Detect and handle output truncation explicitly
- [ ] [MEDIUM] Smarter document text handling (replace naive 8K truncation)
- [ ] [MEDIUM] Add prompt versioning and tracking system
- [ ] [MEDIUM] Add explicit drug-interaction checklist to prep brief prompt
- [ ] [MEDIUM] Define explicit red-flag thresholds
- [ ] [MEDIUM] Enforce specific expected outcomes in client action plan layers
- [ ] [LOW] Add extraction quality validation for uploaded documents
- [ ] [LOW] Improve document chunking for structured data

**Total effort:** ~25-35 hours
EOF
)" 2>&1 | grep -oE 'https://[^ ]+')
echo "  Epic 2: $EPIC2"

gh issue create --repo "$REPO" \
  --title "[HIGH] Add document source attribution to AI prompts" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 1-2 hours

Documents fed to analysis prompts are labeled "Document 1", "Document 2" with no indication of type. The AI can't distinguish a practitioner note (highest authority) from an old PDF upload.

### What to do
1. In \`formatTimelineForPrompt()\`, query document metadata (doc_type) alongside text
2. Tag each document: \`[Transcript]\`, \`[Lab PDF]\`, \`[Practitioner Note]\`, \`[Intake Document]\`
3. Do the same in the prep brief route's document loop
4. The existing transcript-authority instruction will now have the context it needs to weight correctly

### Why this is highest-ROI
The prompts already instruct the AI to weight transcripts higher than intake forms, but the AI currently can't tell which is which. This single change makes that instruction actionable.

**Files:** \`lib/analysis.ts\` — \`formatTimelineForPrompt()\`, \`apps/web/app/api/patients/[id]/prep-brief/route.ts\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[HIGH] Add post-generation safety validation pass" \
  --label "ai-quality,safety" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 4-6 hours

The protocol prompt instructs the AI to check drug-supplement interactions, but there's no verification that it actually did. A separate validation pass would catch missed conflicts.

### What to do
1. Create \`validateProtocolSafety()\` in \`lib/analysis.ts\`
2. After protocol generation, run a focused prompt that takes: (a) the generated protocol supplements/interventions, (b) patient safety flags (medications, allergies, pregnancy)
3. Return a list of potential conflicts with severity levels
4. Store validation results in protocol metadata
5. Display conflicts as warnings in the protocol editor UI

### Example conflicts to catch
- Patient on Warfarin, protocol recommends fish oil
- Patient pregnant, protocol includes adaptogenic herbs
- Patient allergic to shellfish, protocol recommends glucosamine

**Files:** \`lib/analysis.ts\`, protocol editor \`edit-form.tsx\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[HIGH] Detect and handle output truncation explicitly" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 2-3 hours

Protocol generation at 64K tokens can truncate. \`salvageJson()\` silently closes open brackets — potentially dropping entire supplement lists or client action plan layers without warning.

### What to do
1. When \`stop_reason === 'max_tokens'\`, check which top-level JSON keys are present vs expected
2. Flag missing/incomplete sections in metadata: \`{ truncated: true, missing_sections: ['client_action_plan.layers[2]'] }\`
3. Show a visible warning in the protocol editor: "Protocol was too large and may be incomplete — review carefully or regenerate"
4. Log truncation events for monitoring

**File:** \`lib/analysis.ts\` — \`runProtocolGeneration()\`, \`salvageJson()\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Smarter document text handling (replace naive 8K truncation)" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 4-6 hours

Documents are truncated at first 8,000 characters. For lengthy lab reports, critical data at the end is lost (e.g., specialist notes, abnormal values summary).

### Options
a) Extract key sections (abnormal values, flagged results) instead of head-truncating
b) Two-pass approach: summarize each document first, use summaries in the main prompt
c) Increase the cap (requires testing token budget impact)

### Needs
Testing with real lab PDFs to understand what data is typically lost. Best paired with Dr. Laura review.

**Files:** \`lib/analysis.ts\` line 704, prep brief route line 120
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Add prompt versioning and tracking system" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 3-4 hours

Prompts are inline constants. When wording changes, there's no way to trace which version generated a given protocol. If a practitioner says "the protocol from two weeks ago was better," you can't determine what changed.

### What to do
1. Hash each prompt's content at startup (SHA-256 of the string)
2. Store the hash alongside the existing \`prompt_version\` field in protocol/analysis metadata
3. Add a \`prompt_versions\` table or JSON file that maps hashes to dates and change descriptions
4. When querying past protocols, surface which prompt version generated them

**Files:** \`lib/analysis.ts\`, protocol and analysis DB insert functions
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Add explicit drug-interaction checklist to prep brief prompt" \
  --label "ai-quality,safety" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 1 hour

The protocol generation prompt has a detailed list of critical drug-supplement interactions (Warfarin + fish oil, SSRIs + 5-HTP, thyroid meds + minerals, etc.) but the prep brief prompt just says "flag any potential interactions."

### What to do
Copy the same explicit interaction checklist from \`PROTOCOL_GENERATION_V1\` into \`PREP_BRIEF_PROMPT\` so practitioners get interaction warnings at the earliest touchpoint (prep brief) rather than only after full protocol generation.

**File:** \`lib/analysis.ts\` — \`PREP_BRIEF_PROMPT\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Define explicit red-flag thresholds in prep brief prompt" \
  --label "ai-quality,safety" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 1-2 hours

The prep brief prompt lists example red flags (chest pain, sudden weight loss, blood in stool) but doesn't define what qualifies. The AI may under-flag borderline cases.

### What to do
Add structured criteria for conventional referral:
- Symptom combinations (chest pain + shortness of breath, sudden neurological changes)
- Lab value critical ranges (fasting glucose >126, HbA1c >6.5, TSH >10 or <0.1)
- Vital sign thresholds where applicable
- Duration/severity qualifiers (weight loss >10% in 6 months without trying)

**File:** \`lib/analysis.ts\` — \`PREP_BRIEF_PROMPT\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Enforce specific expected outcomes in client action plan layers" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 1 hour

The protocol prompt requires layers to have expected outcomes but doesn't enforce specificity. "Feel better" doesn't help patients self-assess progress.

### What to do
Add prompt guidance and examples:

**Good:** "Sleep through the night most nights, morning energy noticeably higher, fewer 3am wake-ups"
**Bad:** "Improved sleep", "Feel better", "More energy"

Require outcomes to be observable, specific, and tied to the patient's actual symptoms.

**File:** \`lib/analysis.ts\` — \`PROTOCOL_GENERATION_V1\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[LOW] Add extraction quality validation for uploaded documents" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 2-3 hours

\`insertDocument()\` accepts extracted text without quality checks. Bad OCR, corrupted transcripts, or empty extractions are stored and fed to clinical analysis silently.

### What to do
Add heuristic quality check: minimum length, character distribution, language detection. Flag low-quality extractions for manual review rather than silently feeding them to the AI.

**File:** \`lib/intake-documents.ts\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[LOW] Improve document chunking for structured data" \
  --label "ai-quality" \
  --body "$(cat <<EOF
**Parent:** $EPIC2
**Effort:** 3-4 hours

\`chunkText()\` splits on sentence boundaries with rough token estimation (length/4). This breaks structured data like lab tables mid-row, losing context for clinical analysis.

### What to do
Add awareness of table/structured data boundaries. Detect tabular patterns and keep rows together within chunks.

**File:** \`lib/intake-documents.ts\` — \`chunkText()\`
EOF
)"

# ═══════════════════════════════════════════════════════════════
# EPIC 3: Data Integrity
# ═══════════════════════════════════════════════════════════════

echo ""
echo "Creating Epic 3: Data Integrity..."
EPIC3=$(gh issue create --repo "$REPO" \
  --title "Epic: Data Integrity" \
  --label "data-integrity" \
  --body "$(cat <<'EOF'
## Data Integrity

Prevent orphaned records, improve query performance, protect credentials.

### Sub-issues
- [ ] [HIGH] Add foreign key constraints to migrations
- [ ] [MEDIUM] Add missing database indexes
- [ ] [MEDIUM] Store S3 keys instead of pre-signed URLs
- [ ] [LOW] Fix protocol version numbering race condition

**Total effort:** ~5-7 hours
EOF
)" 2>&1 | grep -oE 'https://[^ ]+')
echo "  Epic 3: $EPIC3"

gh issue create --repo "$REPO" \
  --title "[HIGH] Add foreign key constraints to intake_documents and protocol_outputs" \
  --label "data-integrity" \
  --body "$(cat <<EOF
**Parent:** $EPIC3
**Effort:** 1-2 hours

\`intake_documents\` and \`protocol_outputs\` reference patient_id and protocol_id but lack FK constraints. Orphaned records can be created if a patient or protocol is deleted.

Add FKs with ON DELETE RESTRICT (for PHI tables — prevent accidental data loss).

**Files:** New migration, referencing \`migrations/0010\` and \`migrations/0011\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Add missing database indexes for common query patterns" \
  --label "data-integrity" \
  --body "$(cat <<EOF
**Parent:** $EPIC3
**Effort:** 1 hour

Add composite indexes:
- \`(tenant_id, patient_id, created_at)\` on intake_documents
- Partial index on \`metadata->>'type'\` for prep_brief lookups
- \`(patient_id, record_date)\` on records

**Files:** New migration
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Store S3 keys instead of pre-signed URLs in blob_url" \
  --label "data-integrity,security" \
  --body "$(cat <<EOF
**Parent:** $EPIC3
**Effort:** 2-3 hours

\`blob_url\` column may store full pre-signed S3 URLs containing AWS signatures. Store only the S3 key (bucket path) and generate pre-signed URLs on-demand with short expiration (5-15 min).

**Files:** \`lib/intake-documents.ts\`, document upload route, document access routes
EOF
)"

gh issue create --repo "$REPO" \
  --title "[LOW] Fix protocol version numbering race condition" \
  --label "data-integrity" \
  --body "$(cat <<EOF
**Parent:** $EPIC3
**Effort:** 1 hour

Read-then-write version increment can produce duplicate version numbers under concurrent requests.

Add UNIQUE constraint on \`(patient_id, version)\` in protocols table. Use atomic \`INSERT ... SELECT MAX(version) + 1\`.

**Files:** New migration, protocol generation route
EOF
)"

# ═══════════════════════════════════════════════════════════════
# EPIC 4: Production Readiness
# ═══════════════════════════════════════════════════════════════

echo ""
echo "Creating Epic 4: Production Readiness..."
EPIC4=$(gh issue create --repo "$REPO" \
  --title "Epic: Production Readiness" \
  --label "production" \
  --body "$(cat <<'EOF'
## Production Readiness

Scale and reliability improvements for onboarding more practitioners.

### Sub-issues
- [ ] [MEDIUM] Increase connection pool and optimize long-running queries
- [ ] [MEDIUM] Add pagination to list endpoints
- [ ] [MEDIUM] Log silent failures instead of swallowing them
- [ ] [MEDIUM] Wrap GET routes in error handlers
- [ ] [MEDIUM] Make disclaimer text configurable per tenant
- [ ] [LOW] Validate and sanitize practitioner preferences before prompt injection

**Total effort:** ~12-16 hours
EOF
)" 2>&1 | grep -oE 'https://[^ ]+')
echo "  Epic 4: $EPIC4"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Increase connection pool and optimize long-running queries" \
  --label "production" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 1-2 hours

Pool max is 10. Prep brief generation holds a connection for 30-60 seconds. Increase to 20-25 and refactor long-running ops to release connections after data gathering.

**File:** \`lib/db.ts\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Add pagination to list endpoints" \
  --label "production" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 3-4 hours

Patient list and record queries return all rows without pagination. Add cursor-based pagination (default 25 per page).

**Files:** \`lib/patients.ts\`, \`lib/records.ts\`, dashboard components
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Log silent failures instead of swallowing them" \
  --label "production" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 1-2 hours

Five routes use empty catch blocks for "non-fatal" operations (document text extraction, preferences loading). Log at warning level with context so you know when they fail.

**Files:** Prep brief route, analysis routes — all empty \`catch {}\` blocks
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Wrap GET routes in consistent error handlers" \
  --label "production" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 1-2 hours

Some GET handlers lack try/catch wrappers. Create a \`withErrorHandling()\` wrapper and apply to all routes.

**Files:** All GET routes under \`apps/web/app/api/\`
EOF
)"

gh issue create --repo "$REPO" \
  --title "[MEDIUM] Make disclaimer text configurable per tenant" \
  --label "production" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 1-2 hours

Disclaimer text is hardcoded. Different practitioners may have different legal requirements. Move to per-tenant configuration with a sensible default.

**Files:** \`intake-hub.tsx\`, protocol views, tenant settings
EOF
)"

gh issue create --repo "$REPO" \
  --title "[LOW] Validate and sanitize practitioner preferences before prompt injection" \
  --label "production,security" \
  --body "$(cat <<EOF
**Parent:** $EPIC4
**Effort:** 2-3 hours

Practitioner preference text is inserted directly into AI prompts. Add length limits, strip instruction-like patterns, wrap in delineated XML sections that tell the model this is user-provided context, not instructions.

**Files:** \`lib/preferences.ts\`, \`lib/analysis.ts\`
EOF
)"

# ═══════════════════════════════════════════════════════════════
# EPIC 5: Frontend Polish (Post-MVP)
# ═══════════════════════════════════════════════════════════════

echo ""
echo "Creating Epic 5: Frontend Polish..."
EPIC5=$(gh issue create --repo "$REPO" \
  --title "Epic: Frontend Polish (Post-MVP)" \
  --label "post-mvp" \
  --body "$(cat <<'EOF'
## Frontend Polish — Post-MVP

Minor UX improvements. None are blockers.

### Sub-issues
- [ ] [LOW] Split large component files (edit-form.tsx, intake-hub.tsx)
- [ ] [INFO] Add loading skeleton screens
- [ ] [INFO] Add optimistic updates to form saves
- [ ] [LOW] Sync clipboard copy with rendered brief fields
- [ ] [LOW] Use deep equality instead of JSON.stringify for reset button

**Total effort:** ~8-12 hours
EOF
)" 2>&1 | grep -oE 'https://[^ ]+')
echo "  Epic 5: $EPIC5"

gh issue create --repo "$REPO" --title "[LOW] Split large component files" --label "post-mvp" \
  --body "Extract SafetyReviewCard, SectionNav, PrepBriefDisplay into own files. Parent: $EPIC5"

gh issue create --repo "$REPO" --title "[INFO] Add loading skeleton screens" --label "post-mvp" \
  --body "Add shimmer/skeleton components for prep brief panel, protocol sections, patient summary. Parent: $EPIC5"

gh issue create --repo "$REPO" --title "[INFO] Add optimistic updates to form saves" --label "post-mvp" \
  --body "Add visual save indicator per section. Consider autosave with debouncing. Parent: $EPIC5"

gh issue create --repo "$REPO" --title "[LOW] Sync clipboard copy with rendered brief fields" --label "post-mvp" \
  --body "Generate clipboard text from same data structure that drives rendering. Parent: $EPIC5"

gh issue create --repo "$REPO" --title "[LOW] Use deep equality for reset button comparison" --label "post-mvp" \
  --body "Replace JSON.stringify comparison with lodash isEqual or equivalent. Parent: $EPIC5"

echo ""
echo "================================================"
echo "All issues created! Check your repo."
echo "================================================"
