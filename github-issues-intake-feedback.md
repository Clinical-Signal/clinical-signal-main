# GitHub Issues — Dr. Laura Intake QA Feedback (May 5, 2026)

Copy each issue below into GitHub → New Issue at:
https://github.com/Clinical-Signal/clinical-signal-main/issues/new

---

## Issue 1: Fix exercise field to support multiple activity types

**Labels:** bug, intake, priority-high

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

---

## Issue 2: Remove redundant Goals section (Section 11)

**Labels:** enhancement, intake, priority-high

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

---

## Issue 3: Reorder metabolism deep dive — don't lead with weight

**Labels:** enhancement, intake, priority-medium

### Description
The metabolism deep dive currently leads with weight-related questions. Dr. Laura's feedback: "Not all metabolism goals are weight-related, so while I think these are good questions, maybe don't lead with them."

### Acceptance Criteria
- [ ] Add a gate question at the top: "Do you have a body composition or weight-related goal right now?" (yes/no)
- [ ] If yes, show weight-related questions
- [ ] If no, skip to non-weight metabolism questions (energy, blood sugar, thyroid symptoms, etc.)
- [ ] Weight questions moved below the gate, not the first thing patients see

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/metabolism-deep-dive.tsx`

---

## Issue 4: Add wearable tracking question to sleep section

**Labels:** enhancement, intake, priority-medium

### Description
Dr. Laura wants the sleep section to ask about wearable devices for sleep tracking, and whether the patient can share that data.

### Acceptance Criteria
- [ ] Add question: "Do you use a wearable device to track your sleep?" (yes/no)
- [ ] If yes, follow-up: "Which device?" (dropdown: Oura Ring, Apple Watch, Whoop, Fitbit, Garmin, Other)
- [ ] Add question: "Can you share your sleep data or screenshots before your intake visit?"
- [ ] Auto-save works for new fields

### Location
`apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/sleep-deep-dive.tsx`

---

## Issue 5: Make intake form client-facing with practitioner review layer

**Labels:** enhancement, intake, priority-critical, epic

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

---

## Issue 6: Add simple audio/file upload to intake form

**Labels:** enhancement, intake, priority-medium

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

---

## Issue 7 (Nice-to-have): Auto-generate client health record PDF after intake

**Labels:** enhancement, intake, priority-low, nice-to-have

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
Depends on Issue 5 (client-facing intake) being implemented first.
