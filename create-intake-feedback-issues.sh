#!/bin/bash
# Create the 7 GitHub issues from github-issues-intake-feedback.md
#
# Source: Dr. Laura intake QA feedback (May 5, 2026)
#
# Run from the clinical-signal-main repo root:
#   chmod +x create-intake-feedback-issues.sh && ./create-intake-feedback-issues.sh
#
# Requires: gh auth login (already done)
# Idempotent: skips an issue if a matching open/closed issue title already exists.
#
# Note: bodies are written to temp files first to avoid macOS bash 3.2's
# heredoc-inside-command-substitution bug.

set -euo pipefail

REPO="Clinical-Signal/clinical-signal-main"
BODY_DIR="$(mktemp -d -t cs-intake-issues-XXXXXX)"
trap 'rm -rf "$BODY_DIR"' EXIT

# ────────────────────────────────────────────────────────────────
# Labels
# ────────────────────────────────────────────────────────────────
echo "Ensuring labels exist..."
gh label create "bug"               --color "D73A4A" --description "Something isn't working"     --repo "$REPO" 2>/dev/null || true
gh label create "enhancement"       --color "A2EEEF" --description "New feature or request"      --repo "$REPO" 2>/dev/null || true
gh label create "intake"            --color "0052CC" --description "Patient intake form / flow"  --repo "$REPO" 2>/dev/null || true
gh label create "epic"              --color "3E4B9E" --description "Large multi-part initiative" --repo "$REPO" 2>/dev/null || true
gh label create "nice-to-have"      --color "C2E0C6" --description "Non-essential improvement"   --repo "$REPO" 2>/dev/null || true
gh label create "priority-critical" --color "B60205" --description "Critical priority"           --repo "$REPO" 2>/dev/null || true
gh label create "priority-high"     --color "D93F0B" --description "High priority"               --repo "$REPO" 2>/dev/null || true
gh label create "priority-medium"   --color "FBCA04" --description "Medium priority"             --repo "$REPO" 2>/dev/null || true
gh label create "priority-low"      --color "0E8A16" --description "Low priority"                --repo "$REPO" 2>/dev/null || true
echo "Labels ready."
echo ""

# ────────────────────────────────────────────────────────────────
# Helper: only create an issue if no issue (open or closed) has the
# same title. Body is read from a file to avoid bash 3.2 quirks.
# ────────────────────────────────────────────────────────────────
create_issue () {
  local title="$1"
  local labels="$2"
  local body_file="$3"

  local existing
  existing=$(gh issue list --repo "$REPO" --state all --search "in:title \"$title\"" --json title,url --jq ".[] | select(.title == \"$title\") | .url" | head -n1)
  if [[ -n "$existing" ]]; then
    echo "SKIP (already exists): $title"
    echo "  $existing"
    return
  fi

  local url
  url=$(gh issue create --repo "$REPO" --title "$title" --label "$labels" --body-file "$body_file" 2>&1 | grep -oE 'https://[^ ]+' | head -n1)
  echo "CREATED: $title"
  echo "  $url"
}

# ────────────────────────────────────────────────────────────────
# Body files
# ────────────────────────────────────────────────────────────────

cat > "$BODY_DIR/issue1.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
The exercise field in the Lifestyle section (Section 6) only allows a single text entry for exercise type. Patients who do multiple activities (e.g., yoga + running + strength training) can't properly fill this out.

This was first flagged on May 3 and confirmed again by Dr. Laura on May 5.

### Acceptance Criteria
- [ ] Exercise section allows adding multiple activity entries (type, frequency, duration)
- [ ] "Add another activity" button to add rows
- [ ] Remove button on each entry
- [ ] Auto-save works for all entries
- [ ] Existing single-entry data migrates cleanly

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx` — LifestyleSection
EOF

cat > "$BODY_DIR/issue2.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
Dr. Laura confirmed that the Goals section (Section 11) is redundant — the same questions are already covered in "Why You're Here" (Section 2) which asks about top goals for the next 3-6 months, 6-month vision, and motivation.

Per Dr. Laura: "these are really similar to questions asked at the start of the intake, so I don't think you need to repeat them here."

### Acceptance Criteria
- [ ] Section 11 (GoalsSection) removed from the intake form
- [ ] GoalsSection component removed or deprecated
- [ ] Progress bar calculation updated to exclude goals section
- [ ] Existing goals data preserved in the database (don't delete)
- [ ] Intake completion percentage still calculates correctly

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx` — lines 267-273
EOF

cat > "$BODY_DIR/issue3.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
The metabolism deep dive currently leads with weight-related questions. Dr. Laura's feedback: "Not all metabolism goals are weight-related, so while I think these are good questions, maybe don't lead with them."

### Acceptance Criteria
- [ ] Add a gate question at the top: "Do you have a body composition or weight-related goal right now?" (yes/no)
- [ ] If yes, show weight-related questions
- [ ] If no, skip to non-weight metabolism questions (energy, blood sugar, thyroid symptoms, etc.)
- [ ] Weight questions moved below the gate, not the first thing patients see

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/metabolism-deep-dive.tsx`
EOF

cat > "$BODY_DIR/issue4.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
Dr. Laura wants the sleep section to ask about wearable devices for sleep tracking, and whether the patient can share that data.

### Acceptance Criteria
- [ ] Add question: "Do you use a wearable device to track your sleep?" (yes/no)
- [ ] If yes, follow-up: "Which device?" (dropdown: Oura Ring, Apple Watch, Whoop, Fitbit, Garmin, Other)
- [ ] Add question: "Can you share your sleep data or screenshots before your intake visit?"
- [ ] Auto-save works for new fields

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/sleep-deep-dive.tsx`
EOF

cat > "$BODY_DIR/issue5.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
Dr. Laura's core feedback: the dynamic intake form should be **client-facing**. Patients fill it out before their first meeting with the practitioner. It syncs to the practitioner's Clinical Signal dashboard where they can review, annotate, and flag areas for follow-up during the actual intake visit.

This is a strategic shift from the current practitioner-facing model. Benefits:
- Practitioners arrive at the first meeting with all info pre-reviewed
- Maximizes practitioner time — no basic intake questions during the call
- Eliminates copy/pasting intake forms into Clinical Signal
- The dynamic deep-dive triggers already work great for patients

### Sub-tasks
- [ ] Patient access flow — magic link or invite code, no account creation required
- [ ] Patient-facing UI review — ensure all language, instructions, and flow make sense for a patient filling it out alone
- [ ] Practitioner review view — read-only view of submitted intake with ability to:
  - [ ] Highlight/flag specific answers for follow-up
  - [ ] Add practitioner notes per section
  - [ ] Mark sections as "reviewed"
- [ ] Notification to practitioner when patient completes intake
- [ ] Duration estimate visible to patient ("set aside 15-20 minutes")
- [ ] Progress persistence — patient can leave and come back across devices
- [ ] Security — patient link expires after submission or after X days, PHI protection maintained

### Location
This touches multiple files across the intake system. Key areas:
- Auth/access: new patient access route
- `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/` — form components
- `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/review/` — practitioner review view
- `apps/web/lib/intake.ts` — server operations
EOF

cat > "$BODY_DIR/issue6.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
Allow patients to upload files during intake: voice memos, supplement bottle photos, past lab results, and other documents. For now, this is simple file upload without auto-transcription (transcription pipeline will come later).

Per Dr. Laura: "Area for past labs/results, current supplement photos, they can upload a voice note/memo in case it can't be built into the dynamic intake."

### Acceptance Criteria
- [ ] File upload component available in relevant intake sections (Medications for supplement photos, Previous Labs for lab PDFs, Anything Else for voice memos)
- [ ] Accepted file types: images (jpg, png, heic), PDFs, audio (m4a, mp3, wav)
- [ ] Files stored securely in S3 with encryption at rest
- [ ] Practitioner can view/listen to uploaded files in the review view
- [ ] File size limits clearly communicated (e.g., 50MB max)
- [ ] Upload progress indicator

### Location
- New shared component: file upload widget
- `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/` — add to relevant sections
- `apps/web/app/api/patients/[id]/intake-docs/route.ts` — extend API
EOF

cat > "$BODY_DIR/issue7.md" <<'EOF'
**Source:** Dr. Laura intake QA feedback (May 5, 2026)

### Description
After intake submission, auto-generate a PDF summary of the client's health history, goals, symptoms, and lifestyle data. This PDF goes back to the client so they have a record to share with other providers or keep for themselves.

Per Dr. Laura: "What would also be great is at the end of intake visit, it populates a 'client health record' based on client form they filled out/health history/etc — and that goes back to client so they now have a PDF of their health history, goals, etc to share with other providers, their own records, etc."

### Acceptance Criteria
- [ ] PDF generated automatically after intake submission
- [ ] Includes all intake sections in a clean, readable format
- [ ] Patient-friendly language (no clinical jargon)
- [ ] Available for download by both patient and practitioner
- [ ] Clinical Signal branding on the PDF
- [ ] Excludes internal practitioner notes/annotations

### Dependencies
Depends on the "Make intake form client-facing with practitioner review layer" epic being implemented first.
EOF

# ────────────────────────────────────────────────────────────────
# Create issues
# ────────────────────────────────────────────────────────────────
create_issue "Fix exercise field to support multiple activity types"            "bug,intake,priority-high"                  "$BODY_DIR/issue1.md"
create_issue "Remove redundant Goals section (Section 11)"                      "enhancement,intake,priority-high"          "$BODY_DIR/issue2.md"
create_issue "Reorder metabolism deep dive — don't lead with weight"            "enhancement,intake,priority-medium"        "$BODY_DIR/issue3.md"
create_issue "Add wearable tracking question to sleep section"                  "enhancement,intake,priority-medium"        "$BODY_DIR/issue4.md"
create_issue "Make intake form client-facing with practitioner review layer"    "enhancement,intake,priority-critical,epic" "$BODY_DIR/issue5.md"
create_issue "Add simple audio/file upload to intake form"                      "enhancement,intake,priority-medium"        "$BODY_DIR/issue6.md"
create_issue "Auto-generate client health record PDF after intake"              "enhancement,intake,priority-low,nice-to-have" "$BODY_DIR/issue7.md"

echo ""
echo "Done. View all intake issues:"
echo "  https://github.com/$REPO/issues?q=is%3Aissue+label%3Aintake"
