#!/bin/bash
# Create GitHub issues for MVP trust-building priorities
# Run from the repo root: bash scripts/create-trust-issues.sh

set -e

echo "Creating MVP Trust Priority issues..."

# =============================================================================
# EPIC: Must-Have for Trust
# =============================================================================

gh issue create \
  --title "EPIC: Must-have trust items before launch" \
  --body "$(cat <<'BODY'
## Overview
These items must be complete before any practitioner sees the product. A single bad recommendation, missing file, or absent disclaimer can permanently destroy trust.

## Items
- [ ] #S3 — Encrypted document storage (lab PDFs must persist)
- [ ] #DISCLAIMER — Disclaimers on all output views
- [ ] #QUALITY — Protocol quality testing with Dr. Laura (2-3 real profiles)

## Already complete
- [x] Safety guardrails in AI prompts (drug interactions, dose ceilings, contraindications)
- [x] Practitioner preferences / protocol playbook
- [x] Protocol editor with versioning
- [x] Edit tracking (structured diff capture on approval)
BODY
)" \
  --label "epic,trust,MVP"

echo "Created epic issue"

# --- S3 Document Storage ---

gh issue create \
  --title "Set up encrypted S3 bucket for document storage" \
  --body "$(cat <<'BODY'
## Why this matters for trust
Lab PDFs currently don't persist on serverless (Aptible). If a practitioner uploads a lab report and it vanishes, trust is gone immediately. This is also a HIPAA requirement — PHI must be stored with AES-256 encryption at rest.

## Tasks
- [ ] Create S3 bucket with AES-256-SSE encryption
- [ ] Enable versioning (audit trail for compliance)
- [ ] Block all public access
- [ ] Create IAM user with least-privilege policy (PutObject, GetObject, DeleteObject only)
- [ ] Generate access key pair
- [ ] Add AWS credentials to Aptible environment variables

## Acceptance criteria
- Bucket exists with encryption enabled
- No public access possible
- IAM credentials are scoped to this bucket only
- Credentials are in Aptible env vars
BODY
)" \
  --label "infrastructure,trust,MVP"

echo "Created S3 bucket issue"

gh issue create \
  --title "Migrate file upload/download routes from local filesystem to S3" \
  --body "$(cat <<'BODY'
## Context
Depends on: S3 bucket setup issue

Currently, `lib/records.ts` uses local filesystem (`writeFile` to `/uploads` dir). On serverless, file bytes are not persisted. Must switch to AWS S3 SDK.

## Tasks
- [ ] Install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner
- [ ] Create lib/storage.ts with upload/download/delete helpers
- [ ] Update lab PDF upload in lib/records.ts (acceptLabUpload function)
- [ ] Update intake document upload routes
- [ ] Update document download/read routes
- [ ] Generate pre-signed URLs for secure temporary access
- [ ] Test: upload a lab PDF, verify it persists in S3, verify it reads back
- [ ] Test: verify old local-filesystem code path is fully removed
- [ ] Update any references to UPLOADS_DIR env var

## Key files to modify
- `apps/web/lib/records.ts` — acceptLabUpload function (lines 156-162)
- `apps/web/lib/intake-documents.ts` — document upload handling
- Any API routes that serve file downloads

## Acceptance criteria
- All file uploads go to S3 with encryption
- All file downloads use pre-signed URLs (expire after 15 min)
- No files stored on local filesystem
- Existing uploaded files migrated (if any exist in production)
BODY
)" \
  --label "infrastructure,trust,MVP"

echo "Created S3 migration issue"

# --- Disclaimers ---

gh issue create \
  --title "Add disclaimer to clinical protocol view and call deck view" \
  --body "$(cat <<'BODY'
## Why this matters for trust
Disclaimers are already on the client document and email draft outputs, but missing from the clinical protocol detail page and call deck viewer. Every AI-generated output must have a visible disclaimer for legal protection and to signal to practitioners that this is a decision-support tool, not autonomous medical advice.

## Tasks
- [ ] Add disclaimer footer to protocol detail page (apps/web/app/(dashboard)/dashboard/patients/[id]/protocol/[protocolId]/page.tsx)
- [ ] Add disclaimer to call deck view — either as a final slide or a footer (apps/web/app/(dashboard)/dashboard/patients/[id]/protocol/[protocolId]/outputs/call-deck-view.tsx)
- [ ] Verify disclaimer appears on clinical PDF export
- [ ] Verify disclaimer appears on client PDF export

## Disclaimer text
"This protocol was generated with AI assistance and is intended as a clinical decision-support tool. It requires practitioner review, clinical judgment, and approval before implementation. It is not a substitute for professional medical evaluation."

## Acceptance criteria
- Disclaimer visible on every AI-generated output view (protocol, client doc, call deck, email)
- Disclaimer visible on every PDF export
- Styled consistently: subtle, always present, not intrusive
BODY
)" \
  --label "trust,MVP"

echo "Created disclaimer issue"

# --- Protocol Quality Testing ---

gh issue create \
  --title "Protocol quality testing with Dr. Laura (2-3 real patient profiles)" \
  --body "$(cat <<'BODY'
## Why this matters for trust
This is THE most important item. Safety guardrails and preferences are meaningless if the baseline AI output isn't clinically sound. We need Dr. Laura to score real outputs against her standard.

## Goal
Run 2-3 real patient profiles through the full pipeline (intake → analysis → protocol → derivative outputs) and have Dr. Laura evaluate. Target: she'd change less than 15% of the output.

## Tasks
- [ ] Select 2-3 test patient profiles (gut-focused, hormone-focused, complex multi-system)
- [ ] Ensure each profile has complete intake data, lab results, and documents uploaded
- [ ] Generate clinical analysis for each patient
- [ ] Generate protocol for each patient (with safety guardrails and any test preferences)
- [ ] Approve protocol and generate derivative outputs (client doc, call deck, email)
- [ ] Export clinical and client PDFs for each
- [ ] Send all outputs to Dr. Laura for scoring
- [ ] Document her feedback: what's good, what's wrong, what's missing
- [ ] Categorize feedback: prompt issue vs data issue vs model limitation
- [ ] Iterate on prompts based on feedback (may require 2-3 rounds)

## Scoring criteria (suggested)
For each output, Dr. Laura rates:
1. **Clinical accuracy** — Are the findings and recommendations sound? (1-5)
2. **Sequencing** — Is the layer ordering correct for this patient? (1-5)
3. **Completeness** — Did it catch everything she would have caught? (1-5)
4. **Safety** — Any recommendations she'd consider risky or contraindicated? (Y/N)
5. **Edit effort** — What % of the output would she change? (<10% = great, 10-20% = acceptable, >20% = needs work)

## Acceptance criteria
- At least 2 patient profiles tested end-to-end
- Dr. Laura scores clinical accuracy ≥ 4/5 on average
- No safety flags (recommendations she'd consider risky)
- Edit effort < 20% on average
- Feedback documented and prompt iterations applied
BODY
)" \
  --label "trust,quality,MVP,critical-path"

echo "Created quality testing issue"

# =============================================================================
# EPIC: High Impact
# =============================================================================

gh issue create \
  --title "EPIC: High-impact items for impressive first experience" \
  --body "$(cat <<'BODY'
## Overview
These items take the product from "functional" to "impressive." They create the moments where a practitioner thinks "this is going to save me hours."

## Items
- [ ] #PREP-BRIEF — Pre-call prep brief improvements (already has UI in intake-hub)
- [ ] #PROTOCOL-EDITOR — Protocol editor polish (rich text, better UX)
- [ ] #INTAKE-DEPTH — Intake form depth improvements (more sections, better data capture)

## Already complete
- [x] 3-output flow (client doc + call deck + email auto-generated on approval)
- [x] PDF export (clinical + client)
- [x] Edit tracking (structured diff capture)
- [x] Prep brief API + basic UI in intake hub
BODY
)" \
  --label "epic,MVP"

echo "Created high-impact epic"

# --- Prep Brief Polish ---

gh issue create \
  --title "Polish pre-call prep brief experience" \
  --body "$(cat <<'BODY'
## Context
The prep brief API and basic inline UI already exist in the intake-hub page. This issue is about making it a more prominent, polished trust-building touchpoint.

## Why this matters
The prep brief is the practitioner's first interaction with the AI's clinical reasoning — before the high-stakes protocol moment. If the prep brief is sharp, they'll trust the protocol more.

## Tasks
- [ ] Add a "Prep brief" link/card to the patient detail page (hub page) so it's easy to find
- [ ] Ensure the prep brief references all uploaded documents (transcripts, lab reports, notes)
- [ ] Verify the prep brief includes suggested lab panels based on intake data
- [ ] Verify the prep brief includes targeted questions to ask during the call
- [ ] Add ability to regenerate the prep brief if new documents are uploaded
- [ ] Style the prep brief view for readability (clear sections, scannable)
- [ ] Test with Dr. Laura: does the prep brief surface the right things?

## Acceptance criteria
- Prep brief accessible from patient detail page
- References all available patient data (intake + documents + labs)
- Practitioner finds it useful for call preparation
BODY
)" \
  --label "trust,MVP"

echo "Created prep brief polish issue"

# --- Protocol Editor Polish ---

gh issue create \
  --title "Improve protocol editor UX for practitioner confidence" \
  --body "$(cat <<'BODY'
## Context
The protocol editor exists with structured field editing and version history. This issue is about UX improvements that make practitioners feel confident editing.

## Tasks
- [ ] Add visual diff between AI original and current edits (highlight what changed)
- [ ] Add inline help text explaining what each section is for
- [ ] Improve supplement editing UX (currently JSON-ish fields — should feel like a form)
- [ ] Add "Reset section to AI original" button per section
- [ ] Show safety review section prominently (new field from safety guardrails)
- [ ] Ensure the editor auto-saves reliably (verify localStorage approach works on Aptible)
- [ ] Add confirmation dialog before approving ("You're about to approve this protocol. Derivative outputs will be generated.")

## Acceptance criteria
- Practitioner can edit any section without feeling like they're editing code
- Changes are clearly visible compared to AI original
- Auto-save prevents data loss
- Approval has a confirmation step
BODY
)" \
  --label "trust,MVP"

echo "Created editor polish issue"

# --- Intake Depth ---

gh issue create \
  --title "Deepen intake form data capture for better protocol quality" \
  --body "$(cat <<'BODY'
## Context
Better intake data = better protocols = more trust. The intake form has conditional branching and good sections, but there are gaps that Dr. Laura's alpha feedback identified.

## Tasks
- [ ] Review Dr. Laura's intake feedback (hormone section required not conditional, deeper behavioral questions)
- [ ] Ensure hormone section is always shown (not conditional on MSQ scores)
- [ ] Add medications/supplements section with structured fields (name, dose, frequency, how long)
- [ ] Add "previous labs" section (what tests have been done, when, key results)
- [ ] Add health timeline section (major health events in chronological order)
- [ ] Verify all intake data flows into the clinical analysis prompt correctly
- [ ] Test: does richer intake data produce meaningfully better protocols?

## Acceptance criteria
- Intake captures medications, supplements, previous labs, and health timeline
- Hormone section always visible
- All new data fields are included in the AI analysis prompt
BODY
)" \
  --label "trust,quality,MVP"

echo "Created intake depth issue"

echo ""
echo "✓ All issues created! Check: gh issue list --state open"
