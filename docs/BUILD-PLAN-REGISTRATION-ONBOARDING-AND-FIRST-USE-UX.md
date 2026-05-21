# Build Plan — Registration, Onboarding, and First-Use UX

**Created:** May 19, 2026
**Status:** Plan — ready to hand to Claude Code as three sequential PRs
**Author:** Cowork planning session with Ryan
**Companions:** `docs/SECURITY-AND-HIPAA-AUDIT-2026-05-19.md` (the audit this plan partially addresses), `CLAUDE.md` (project framing), `docs/MVP-PRIORITIZATION-2026-05-08.md` (where this slots in)

---

## Why these features matter

Three problems are addressed by this plan:

**1. Critical security and compliance gaps.** The current signup flow (`apps/web/lib/auth.ts:86-119`) auto-creates owner accounts in a shared `DEFAULT_TENANT_ID` with no email verification, no terms acceptance, no MFA, and no BAA. This is the largest privilege-escalation risk in the codebase (audit finding C2 + C4) and a HIPAA blocker — Clinical Signal must execute a Business Associate Agreement with every practitioner-customer before processing their patients' PHI.

**2. First-impression product gap.** A new practitioner who signs up today lands on an empty dashboard with no guidance. There's no welcome message, no obvious next action, no acknowledgment that the system is set up correctly. The first 60 seconds of a SaaS product determine whether the user comes back; right now that experience is "I see an empty table, what do I do?"

**3. Workflow discoverability gap.** A practitioner who successfully creates their first patient currently has to know to click into that patient and find the protocol-generation flow buried in a side panel. The natural next step (intake → labs → protocol) isn't surfaced as a CTA. Dr. Laura specifically called this out — she shouldn't have to "know to click" the patient row to find what to do next.

All three problems compound each other. Fixing them in one coherent build creates the registration → onboarding → patient → protocol path that turns a first-time user into a successful practitioner using the system end-to-end.

---

## Scope

Three PRs, sequential because each builds on the prior:

- **PR A — Registration overhaul.** Replace `auth.ts` signup with a multi-step flow: account details → ToS + Privacy Policy acceptance → embedded BAA acceptance → email verification → tenant creation → first login.
- **PR B — Dashboard empty state and onboarding checklist.** When the practitioner has zero patients, show an inviting empty state with a large primary CTA. Show a dismissible onboarding checklist that tracks first-use milestones.
- **PR C — Patient creation → protocol generation workflow CTA.** After a patient is created, render a workflow status block on the patient detail page showing the next action (intake → labs → protocol). Make "Generate Protocol" a primary CTA when prerequisites are met.

Total estimated engineering: 8-12 days across the three PRs. PR A is the heaviest (~5-7 days) because it touches auth, schema, email, and legal. PR B and C are 1-2 days each.

---

## PR A — Registration overhaul with ToS, BAA, and email verification

### Goal

Replace the current single-step signup that creates an owner account in DEFAULT_TENANT_ID with a multi-step flow that creates a new tenant per practitioner, captures legal agreement to ToS + Privacy Policy + BAA, and verifies the email before granting a session.

### Schema changes

**Migration `0023_registration_overhaul.sql`:**

New table `legal_document_versions` — append-only registry of legal document versions:

```sql
CREATE TABLE legal_document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   TEXT NOT NULL CHECK (document_type IN ('terms_of_service', 'privacy_policy', 'business_associate_agreement')),
  version         TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  content_md      TEXT NOT NULL,
  effective_date  DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, version)
);
```

New table `terms_acceptances` — append-only per-practitioner acceptance log:

```sql
CREATE TABLE terms_acceptances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_version_id UUID NOT NULL REFERENCES legal_document_versions(id),
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address          INET,
  user_agent          TEXT,
  signature_method    TEXT NOT NULL DEFAULT 'click_through' CHECK (signature_method IN ('click_through', 'docusign', 'wet_signature')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX terms_acceptances_practitioner_idx ON terms_acceptances(practitioner_id);
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON terms_acceptances
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
REVOKE UPDATE, DELETE ON terms_acceptances FROM app_user;
```

New table `email_verification_tokens`:

```sql
CREATE TABLE email_verification_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_token_hash_idx ON email_verification_tokens(token_hash);
CREATE INDEX email_verification_tokens_practitioner_idx ON email_verification_tokens(practitioner_id);
```

Extend `practitioners` table:

```sql
ALTER TABLE practitioners
  ADD COLUMN email_verified_at      TIMESTAMPTZ,
  ADD COLUMN signup_completed_at    TIMESTAMPTZ,
  ADD COLUMN signup_step            TEXT DEFAULT 'pending_email_verification'
    CHECK (signup_step IN ('pending_email_verification', 'pending_terms', 'completed'));
```

### Legal document content

Three Markdown documents to seed in `database/seed/legal/`:

- `terms_of_service_v1.md` — standard SaaS ToS adapted for healthcare
- `privacy_policy_v1.md` — describes data handling, retention, third parties (Anthropic, Aptible, S3)
- `business_associate_agreement_v1.md` — HIPAA-compliant BAA between Clinical Signal (Business Associate) and the practitioner (Covered Entity)

**Note on the BAA legal review.** The BAA template should be reviewed by a HIPAA-experienced attorney before launch. For the build phase, use a well-known template (e.g., HHS sample BAA at https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html) adapted for the SaaS context. Flag in PR body that legal review is required before this PR ships to production.

A seed migration loads version `v1` of each into `legal_document_versions`. Future versions are added via subsequent seed migrations; old versions stay queryable for compliance.

### Pages and components

**Route: `/signup` (replaces existing).** Multi-step flow with progress indicator:

Step 1 — Account details:
- Full name, email, password, password confirmation
- Password strength meter (use zxcvbn or equivalent)
- Minimum 12 characters (up from current 8)
- Real-time email uniqueness check (debounced, generic response to prevent enumeration: "Continue to verify your email")

Step 2 — Practice information:
- Practice name (becomes the tenant name)
- License type dropdown (DC, ND, MD, DO, RD, NP, RN, Other)
- License number (optional, stored on `practitioners.credentials` JSONB)
- State / region

Step 3 — Legal acknowledgments:
- Three required checkboxes, each with a "Read" link that opens the document in a modal:
  - [ ] I have read and agree to the **Terms of Service**
  - [ ] I have read and understand the **Privacy Policy**
  - [ ] I am a HIPAA Covered Entity and I agree to the **Business Associate Agreement** governing Clinical Signal's handling of my patients' PHI
- Submit button disabled until all three are checked
- Below the checkboxes: small text "By signing up you confirm that you have authority to enter into these agreements on behalf of your practice."

Step 4 — Email verification:
- Show confirmation "We've sent a verification link to <email>. Click it to complete signup."
- Resend link (rate-limited to 1 per minute, max 5 per hour)
- After ~5 minutes without verification, show a "Wrong email? Update it" link

Step 5 (after verification) — Welcome:
- "Welcome to Clinical Signal, <name>." 
- "Your account is set up and your practice <practice_name> is ready to go."
- Primary CTA: "Add Your First Patient" → redirects to `/dashboard/patients/new` (or shows the empty state from PR B if no patients)

### API endpoints

**`POST /api/auth/signup`** — accepts account + practice details + acknowledgments. Creates `practitioners` row (signup_step = 'pending_email_verification', role = 'owner' is fine since this is a new tenant), creates a new `tenants` row (one per signup), creates three `terms_acceptances` rows. Returns success or specific error code. Does NOT create a session yet.

**`POST /api/auth/verify-email`** — accepts a token, validates against `email_verification_tokens` (not expired, not consumed), sets `practitioners.email_verified_at = now()` and `signup_step = 'completed'`, marks token consumed, creates session, returns success. Client redirects to `/dashboard`.

**`POST /api/auth/resend-verification`** — rate-limited resend.

**`GET /api/legal/:document_type/latest`** — returns the latest version of a legal document (Markdown). Used by the modal in step 3 of signup and by a "View current ToS" link in settings.

### Email sending

Pick a HIPAA-eligible transactional email provider. Options:

- **Postmark** — BAA available on Pro plan (~$100/mo+). Good deliverability.
- **AWS SES** — BAA via AWS Artifact. Cheaper, more setup.
- **Resend** — Newer, BAA available on Pro plan. Simple integration.

Recommendation: **Resend** for speed (~30 min integration, modern API) unless you have an existing AWS preference. Sign their BAA before sending any verification emails to real users.

Initial templates needed:
- `verification.html` — "Verify your email to complete signup"
- `welcome.html` — "Welcome to Clinical Signal" (sent after verification)
- `password_reset.html` (separate ticket; reuses the same provider)

PHI safety in emails: NEVER include patient data in any transactional email. Practitioner name + their email is OK; patient name/info is not.

### Removing the auto-owner DEFAULT_TENANT_ID flow

After PR A merges, the old signup path no longer works. Specifically:
- `auth.ts:86-119` — current signup function gets replaced with the multi-step flow
- `process.env.DEFAULT_TENANT_ID` — keep as fallback for dev seed data (`0003_seed_dev.sql` continues using it), but production should not have this env var set
- Add a production startup assertion: if `NODE_ENV=production` and `DEFAULT_TENANT_ID` is set, log a warning. Optionally refuse to start.

### Verification

```bash
# Schema applies cleanly
docker compose exec db psql -f /migrations/0023_registration_overhaul.sql
docker compose exec db psql -c "\d practitioners; \d terms_acceptances; \d email_verification_tokens; \d legal_document_versions"

# Three legal docs seeded
docker compose exec db psql -c "SELECT document_type, version FROM legal_document_versions ORDER BY 1;"
# Expect: 3 rows (terms_of_service v1, privacy_policy v1, business_associate_agreement v1)

# Signup end-to-end (manual)
# 1. Visit /signup
# 2. Complete step 1 (account)
# 3. Complete step 2 (practice info)
# 4. Step 3 — try to submit without checking all 3 boxes (should be disabled)
# 5. Check all 3, submit, confirm "check your email" screen
# 6. Open the email in Mailhog (dev) or real inbox (staging), click link
# 7. Confirm session created, land on /dashboard, see welcome message
# 8. Verify in DB: practitioners row exists, signup_step='completed', 3 terms_acceptances rows present, tenant created
```

Estimated effort: 5-7 days.

---

## PR B — Dashboard empty state and onboarding checklist

### Goal

When a practitioner has zero patients (just signed up, or actively cleaning up data), show an inviting empty state with a single large primary CTA. Show a dismissible onboarding checklist that tracks early milestones until they're complete or dismissed.

### Components

**Empty state — replaces the empty patient table.** Centered card, takes up the main content area:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    [icon or illustration]               │
│                                                         │
│              Welcome to Clinical Signal                 │
│                                                         │
│       Add your first patient to get started.           │
│       We'll guide you through intake, labs, and        │
│       generating their first protocol.                  │
│                                                         │
│              ┌─────────────────────────┐                │
│              │   Add Your First Patient│ ← primary CTA  │
│              └─────────────────────────┘                │
│                                                         │
│       Watch a 2-minute tour · Read the getting-        │
│       started guide                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

When `patients.length === 0`, render this component instead of the table. When `patients.length > 0`, render the normal table.

**Onboarding checklist — persistent until dismissed.** Floating card in the corner (or pinned to the top of the dashboard above the patient table):

```
┌──────────────────────────────────────────────┐
│  Getting started · 1 of 5 complete       [×] │
│                                              │
│  ✓ Account created                           │
│  ☐ Add your first patient                    │
│  ☐ Complete patient intake                   │
│  ☐ Upload first lab document                 │
│  ☐ Generate first protocol                   │
│                                              │
│  Skip onboarding                             │
└──────────────────────────────────────────────┘
```

Each unchecked item is clickable and navigates to the relevant page. Checkmarks fill in as the practitioner completes each step. After all 5 are complete (or after clicking "Skip onboarding"), the checklist is hidden permanently for that practitioner.

### Schema additions

Extend `practitioners`:

```sql
ALTER TABLE practitioners
  ADD COLUMN onboarding_checklist_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN onboarding_dismissed_at TIMESTAMPTZ;
```

`onboarding_checklist_state` schema:

```json
{
  "account_created": "2026-05-19T14:32:00Z",
  "first_patient_added": null,
  "first_intake_completed": null,
  "first_lab_uploaded": null,
  "first_protocol_generated": null
}
```

Server actions update each field as the milestone fires. `account_created` is populated by the signup flow. The other four are populated by their respective creation flows (in `lib/patients.ts`, `lib/intake.ts`, `lib/records.ts`, `lib/protocols.ts`).

### Component locations

- `apps/web/components/dashboard/EmptyState.tsx` — the empty-state card
- `apps/web/components/dashboard/OnboardingChecklist.tsx` — the checklist card
- `apps/web/app/(dashboard)/dashboard/page.tsx` — conditionally renders empty state vs. table, always renders the checklist while incomplete

### Copy

Empty state copy in plain prose, not heavy jargon. Tone: warm, brief, action-oriented. Suggested:

> Welcome to Clinical Signal
>
> Add your first patient to get started. We'll guide you through intake, lab uploads, and generating their first clinical protocol — usually about 15 minutes for the first patient and faster after that.

The "Watch a 2-minute tour" and "Read the getting-started guide" links can be stubbed to placeholder pages for now. Actual tour video and guide content are separate deliverables (note in PR body, file follow-up issues).

### Visual

For the icon/illustration: use a simple SVG icon (Lucide React's `Users` or `UserPlus` icon at large size) for v1. A proper illustration can come later. The empty state should not look broken or amateurish — center the layout, use generous whitespace, make the primary button visually prominent (filled, branded color, large touch target).

### Verification

```bash
# Run dev DB, create a fresh practitioner via signup
# Confirm landing on /dashboard with zero patients shows the empty state
# Click "Add Your First Patient" → lands on patient creation form
# Create a patient → empty state disappears, table appears with one row
# Onboarding checklist updates: "Add your first patient" checks off
# Dismiss the checklist with the × button → confirms hides on reload
# Verify in DB: practitioners.onboarding_checklist_state and onboarding_dismissed_at updated
```

Estimated effort: 1.5-2 days.

---

## PR C — Patient creation → protocol workflow CTA

### Goal

After creating a new patient, surface the next action clearly. On the patient detail page, render a workflow status block showing where the practitioner is in the intake-labs-protocol sequence with a primary CTA pointing at the next step. After patient creation, the practitioner should never have to wonder "what do I do next?"

### The four-step workflow

For each patient, the system tracks:

1. **Patient created** ✓ (always true if the patient row exists)
2. **Intake completed** — practitioner has completed the intake form for this patient
3. **Labs uploaded** — at least one document is associated with the patient
4. **Protocol generated** — at least one protocol exists for this patient

These states are computed from existing data (no new schema). Step 2 is `intake_data IS NOT NULL` and contains required fields; step 3 is `records.count > 0`; step 4 is `protocols.count > 0`.

### Components

**Workflow status block on patient detail page.** Rendered at the top of `/dashboard/patients/[id]/page.tsx`, above the existing patient info:

```
┌───────────────────────────────────────────────────────────┐
│  Patient: Sarah Chen                                       │
│  ─────────────────────────────────────────────────         │
│                                                            │
│   ✓ Patient created                                        │
│                                                            │
│   ●●●○                                                     │
│                                                            │
│   ☐ Step 1 of 3 — Complete intake          [Start intake] │← primary
│   ○ Step 2 of 3 — Upload labs              (locked until 1)│
│   ○ Step 3 of 3 — Generate protocol        (locked until 2)│
└───────────────────────────────────────────────────────────┘
```

As steps complete, checkmarks fill in and the CTA advances to the next step. The button styling makes it visually clear what to do next:

- Active step → primary filled button
- Completed steps → muted secondary look with checkmark
- Future steps → disabled or visually muted

Once all 3 are complete:

```
┌───────────────────────────────────────────────────────────┐
│  Patient: Sarah Chen                                       │
│  ─────────────────────────────────────────────────         │
│                                                            │
│  All set up. Continue working with Sarah:                  │
│                                                            │
│  [Regenerate protocol]  [View current protocol]  [Edit]    │
└───────────────────────────────────────────────────────────┘
```

After protocol is generated, the workflow block shifts into ongoing-use mode with regenerate/view/edit actions.

**Post-creation redirect.** When a new patient is created via `/dashboard/patients/new`, the success redirect goes to the new patient's detail page WITH the workflow block at the top. The first thing the practitioner sees after creating a patient is the "Start intake" CTA.

**Optional: post-creation modal.** Instead of (or in addition to) redirecting, a brief modal could appear: "Sarah Chen has been added. Ready to start her intake?" with primary action "Start intake" and secondary "I'll come back to it." Decide based on user testing — for v1 the redirect-with-CTA is probably enough.

### Component location

- `apps/web/components/patient/WorkflowStatus.tsx` — the workflow block
- `apps/web/app/(dashboard)/dashboard/patients/[id]/page.tsx` — renders the block at the top
- `apps/web/lib/patients.ts` — add a helper `getPatientWorkflowState(patientId)` that returns the four boolean flags

### Schema additions

None required. All four states are derivable from existing data:

```typescript
async function getPatientWorkflowState(tenantId, patientId) {
  // Use withTenant pattern from lib/db.ts
  const patient = await getPatient(tenantId, patientId);
  const intakeComplete = patient.intake_data && isIntakeComplete(patient.intake_data);
  const documentsUploaded = await countRecordsForPatient(tenantId, patientId) > 0;
  const hasProtocol = await countProtocolsForPatient(tenantId, patientId) > 0;
  return { patientCreated: true, intakeComplete, documentsUploaded, hasProtocol };
}
```

`isIntakeComplete()` checks for the minimum required fields (per the intake form's required-fields list). If the practitioner has started but not finished intake, this should return false until enough fields are populated.

### Copy

Workflow step labels — short, action-oriented:

- **"Complete intake"** — not "Patient Intake Form" or "Fill out questionnaire"
- **"Upload labs"** — not "Add Lab Documents" or "Patient Documents"
- **"Generate protocol"** — clear and confident

Button labels follow the step labels. Disabled-state tooltip: "Complete the previous step first."

### Verification

```bash
# 1. Add a new patient via UI → confirm landing on patient detail page, workflow block shows "Step 1 of 3 — Complete intake" with primary CTA
# 2. Click "Start intake" → land on intake form
# 3. Complete intake → return to patient detail → workflow block now shows "Step 2 of 3 — Upload labs"
# 4. Upload a lab document → workflow block now shows "Step 3 of 3 — Generate protocol"
# 5. Generate protocol → workflow block shifts to "All set up" with regenerate/view/edit options
# 6. Refresh the page at each step → workflow state persists (it's derived from data, not session)
```

Estimated effort: 1-2 days.

---

## Cross-PR concerns

### Audit logging additions

Per the security audit, every PHI-touching action should be logged. Add audit events for:

- `signup_started`, `signup_completed`, `email_verified`, `terms_accepted` (with document type + version)
- `patient_created` (already exists?)
- `workflow_step_completed` (intake, lab upload, protocol generation)
- `onboarding_dismissed`

Append to `AuditAction` enum in `apps/web/lib/audit.ts`.

### Testing

Each PR ships with at least:
- Schema migration test (apply + rollback works)
- One end-to-end happy-path test (Playwright or equivalent) — sign up, see empty state, add patient, see workflow CTA
- Unit tests for any non-trivial helpers (workflow state computation, onboarding state mutations, terms acceptance recording)

### Accessibility

The empty state, onboarding checklist, and workflow CTAs are key user surfaces. Each must:

- Use semantic HTML (button vs link appropriately)
- Have keyboard navigation
- Pass axe-core checks (no contrast violations, alt text on illustrations, proper ARIA labels for state)
- Work in screen reader (test with VoiceOver)

### Mobile / responsive

The dashboard is desktop-first per `CLAUDE.md`'s target user (practitioners working from a clinic computer or laptop). But the signup flow may be accessed from a phone (Dr. Laura mentioned signing up from her phone when traveling). Ensure signup steps work on a 375px viewport. Workflow block and empty state should also degrade gracefully on tablet — they can stack vertically rather than fit a desktop layout.

### Internationalization

Out of scope for v1. Hardcode English copy. Note in PR body that strings should be wrapped in an i18n helper later (e.g., `t('signup.welcome')`) when we add a second language.

---

## What this plan does NOT cover (separate workstreams)

- **MFA enrollment** — the audit's CRITICAL finding C3. Should ship as PR D after this build plan completes. Schema hooks for MFA columns can be added in PR A's migration to avoid a separate schema PR later.
- **Invite-based signup for additional practitioners in the same tenant** — currently each signup creates a new tenant. Multi-practitioner tenants are a Phase 1.5 feature. Add a follow-up issue.
- **Password reset flow improvements** — exists today, will need updating to match the new email infrastructure. Separate PR.
- **Account deletion / right to be forgotten** — HIPAA + state law requirement, separate workstream.
- **Tenant settings page redesign** — practitioners need a place to view their accepted ToS/BAA versions and re-accept new versions when documents update. v1: render in the existing settings page as a read-only "Legal acknowledgments" section showing what was signed and when. v2: full management UI.

---

## Suggested PR ordering and dependencies

PR A → PR B → PR C. Strict sequential dependency: PR B's onboarding checklist references the multi-step signup completion; PR C's workflow CTA assumes the empty-state pattern from PR B.

Branches:
- `feat/registration-overhaul-baa-tos` (PR A)
- `feat/dashboard-empty-state-and-onboarding` (PR B)
- `feat/patient-workflow-cta` (PR C)

Each opens as draft, gets reviewed, merges before the next starts. Total wall-clock estimate: 2-3 weeks of focused work.

---

## Security audit findings addressed by this plan

This build plan directly closes these items from `docs/SECURITY-AND-HIPAA-AUDIT-2026-05-19.md`:

- **C2 (CRITICAL)** — Auto-owner DEFAULT_TENANT_ID signup vulnerability. Closed by PR A's per-signup tenant creation.
- **C4 (CRITICAL)** — No email verification on signup. Closed by PR A's email verification flow.
- **H8 (HIGH)** — Weak 8-char password policy. Closed by PR A's 12-char minimum + zxcvbn strength check.
- Part of **C6 (CRITICAL)** — Anthropic BAA not signed. PR A creates the *practitioner-side* BAA (Clinical Signal → practitioner). The Anthropic BAA (Anthropic → Clinical Signal) is a separate task.

Not addressed here, must ship separately:
- C1 (RBAC enforcement)
- C3 (MFA)
- C5 (Vercel → Aptible migration)
- C6 Anthropic BAA execution
- C7 (Next.js upgrade)
- Most HIGH/MEDIUM items in the audit

---

## Next moves

When ready to execute:

1. Pass this doc to Claude Code with: "Execute PR A from `docs/BUILD-PLAN-REGISTRATION-ONBOARDING-AND-FIRST-USE-UX.md`. Open as draft. Tag Ryan for review before merge."
2. After PR A merges, repeat for PR B.
3. After PR B merges, repeat for PR C.

Each PR self-contains its scope and verification gate. No mid-PR ambiguity.

Open question for Ryan before starting PR A: do you want to use Resend, Postmark, or AWS SES for transactional emails? The implementation differs slightly per provider and your BAA preference may dictate the choice.
