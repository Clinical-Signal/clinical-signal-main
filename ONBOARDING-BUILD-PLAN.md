# Onboarding & First-Run Build Plan

**For:** Claude Code (CLI)
**Status:** Spec — ready to break into GitHub issues
**Last updated:** May 18, 2026
**Owner:** Ryan

## Why this exists

Four gaps in the current flow are blocking a clean first-run experience for new practitioners:

1. **No terms / user agreement / BAA gate at signup.** `signup/actions.ts` creates the practitioner and drops them straight on the dashboard. We can't legally accept PHI without a signed BAA, and we have no record of which version of the terms each practitioner accepted.
2. **No onboarding sequence after signup.** New practitioners land on an empty dashboard with no context on what to do, why protocol generation is the core value, or what data the system needs.
3. **The "add patient → generate protocol" loop is broken by a redirect.** `createPatientAction` calls `redirect("/dashboard")` after creating the patient, dropping the user back into the patient list. They have to find the patient they just created and click in to discover the protocol button.
4. **The empty dashboard is a small dashed-border card, not a destination.** `EmptyState` in `components/ui/empty-state.tsx` is fine for sub-views but is undersized for a first-run main screen.

This plan turns those four gaps into five GitHub issues, in dependency order. Each issue is independently shippable.

## Scope boundaries

In scope: signup gating, terms/BAA versioning, post-signup onboarding, post-patient-creation CTA flow, first-run empty state.

Out of scope: email verification (separate issue), 2FA, team/seat management, billing, in-product tour beyond first screen, patient-facing onboarding (this is practitioner-only).

## Architecture decisions — locked

These have been decided and the issues below reflect them.

- **Onboarding sequence.** Signup with minimal details (name, email, password) → practice builder (multi-step, captures legal_name, address, optional NPI, covered-entity self-attestation) → BAA + Terms acceptance (rendered with the practice details filled in) → straight into the dashboard with the first-patient hero empty state. No separate "welcome" or "product tour" screens; the practice builder is the orientation.
- **BAA + Terms timing.** Both accepted in a single combined screen *after* the practice builder, not at signup. Acceptance flips `tenants.lifecycle_status` from `pending_baa` to `active`. Without acceptance, the practitioner is routed back to onboarding on every login.
- **Versioning.** Terms, Privacy Policy, and BAA each have a semantic version string (e.g. `terms@2026-05-18`). Acceptance rows store the exact version *and* a snapshot of the practice details at time of acceptance (legal_name, address, signing authority). Snapshots are immutable.
- **Practice details editable after acceptance.** Practitioners can edit practice details in `/dashboard/settings/practice` at any time. The prior BAA acceptance snapshot stays on file unchanged. On save, a confirmation modal warns: "These changes may require you to update your BAA on file. Your previous acceptance remains valid for the practice details captured at that time." No automatic BAA re-prompt — that's deferred until a signed-PDF BAA process exists.
- **Routing enforcement (middleware).** If `tenants.legal_name IS NULL` → redirect any `/dashboard/*` request to `/onboarding/practice`. If `legal_name IS NOT NULL` and `lifecycle_status = 'pending_baa'` → redirect to `/onboarding/agreements`. Otherwise → through to `/dashboard`. Allow `/onboarding/*`, `/legal/*`, `/logout` always.

## The build plan

### Issue #0 — Practice as a first-class entity, per-signup tenant provisioning (BLOCKING)

**Goal:** Make the `tenants` table actually represent a practice (legal name, address, signing authority, covered-entity classification, lifecycle status) and fix the signup transaction so every new practitioner gets their own tenant instead of all funneling into `DEFAULT_TENANT_ID`. Without this, every other issue in this plan ships onto a foundation that leaks PHI across practitioners.

**Why this is Issue #0:** Issue #1 writes `legal_acceptances` rows that reference a "practice" with no legal name, no address, and no signing authority — meaning the BAA cannot identify the parties. Issue #2 gates signup behind BAA acceptance against "Dev Tenant," which binds no one to anything. Issue #3's profile screen has no columns to write to. Resolve this first.

**Authoritative spec:** `PRACTICE-PRACTITIONER-SCHEMA-PRD.md` in repo root. Read that before opening this issue.

**Summary of changes:**

- `database/migrations/0021_practice_first_class.sql` (new). `ALTER TABLE tenants` to add `slug`, `legal_name`, `dba_name`, `business_email`, `business_phone`, full address columns, `npi`, `covered_entity_status`, `signing_authority_practitioner_id` (FK to practitioners), `lifecycle_status` (default `'pending_baa'`), `onboarded_at`. Backfill the Dev Tenant row. Add a partial unique index on `slug` and an index on `lifecycle_status`.
- `apps/web/lib/auth.ts`. Rewrite `signup()` so a single transaction does: INSERT tenant → INSERT practitioner with `role='owner'` and the new tenant's id → UPDATE tenant.signing_authority_practitioner_id → create session → audit. Take a new `practiceName` parameter, default to `"{Name}'s practice"` if not provided.
- `apps/web/app/(auth)/signup/form.tsx`. Add a "Practice or business name" field below "Your name." Optional in the field, defaulted server-side.
- `apps/web/app/(auth)/signup/actions.ts`. Plumb `practiceName` through.
- `apps/web/lib/db.ts`. Verify `app.current_tenant_id` is being set correctly on every request to the user's tenant (should already be the case post-migration 0012 — just confirm).
- Dev-only escape hatch: `DEFAULT_TENANT_ID` continues to exist but is only used when `ATTACH_TO_DEFAULT_TENANT=true` is also set, intended for seeded dev fixtures. Real signup always provisions a new tenant.

**Acceptance criteria:**

- A fresh signup creates exactly one new tenant, one practitioner (owner), one session — atomically.
- Two consecutive signups produce two distinct tenants. E2E test: sign up as A in one browser context, create a patient. Sign up as B in a fresh context. Assert B's dashboard shows zero patients.
- The tenants table has all the columns listed in the PRD; `lifecycle_status` defaults to `'pending_baa'` for new rows.
- The Dev Tenant row is intact and continues to work for seeded dev data.
- `npm test` and `npm run migrate` are both clean.

**Verification:** Run the E2E "isolation" test described above. Then a SQL check: `SELECT id, name, legal_name, lifecycle_status, signing_authority_practitioner_id FROM tenants ORDER BY created_at DESC LIMIT 5` should show real values for new rows, not nulls and not the Dev Tenant id.

**Open decisions to resolve before opening the issue** (see PRD for full discussion): BAA gates signup-completion vs first-patient-creation (recommended: signup); slug auto-generated vs user-chosen (recommended: auto); NPI required at signup (recommended: no); address required at signup (recommended: no, capture at BAA acceptance in Issue #2); whether to also ship the optional `practitioner_licenses` table now or defer to a follow-up (recommended: defer).

---

### Issue #1 — Terms, Privacy, and BAA acceptance schema + records

**Goal:** Capture which version of each legal document each practitioner accepted, with timestamp, IP, and user agent. Make this queryable for compliance.

**Files to add / change:**

- `database/migrations/0021_legal_acceptances.sql` (new). Table `legal_acceptances` with columns: `id uuid pk`, `practitioner_id uuid fk`, `tenant_id uuid fk`, `document_kind text check in ('terms','privacy','baa')`, `document_version text`, `accepted_at timestamptz default now()`, `ip_address text`, `user_agent text`. Index on `(practitioner_id, document_kind, accepted_at desc)`. RLS: practitioner can read their own rows; tenant owners can read tenant rows; no updates or deletes allowed (append-only).
- `apps/web/lib/legal.ts` (new). Exports `CURRENT_VERSIONS = { terms, privacy, baa }`, `recordAcceptance({ practitionerId, tenantId, kinds, ip, ua })`, `hasAcceptedAll(practitionerId): Promise<boolean>`, `missingAcceptances(practitionerId): Promise<DocKind[]>`.
- `apps/web/content/legal/terms-2026-05-18.mdx`, `privacy-2026-05-18.mdx`, `baa-2026-05-18.mdx` (new). Render via a simple MDX or markdown component. Each file's filename encodes its version.

**Acceptance criteria:**

- Migration runs cleanly forward and rolls back (write a down migration).
- A unit test in `lib/__tests__/legal.test.ts` verifies that `hasAcceptedAll` returns false until all three current-version rows exist.
- `legal_acceptances` is append-only at the DB level (no UPDATE/DELETE grants for the app role).

**Verification:** `npm test -- legal`. Then manually: insert a synthetic acceptance, downgrade `CURRENT_VERSIONS.terms`, confirm `hasAcceptedAll` returns true; upgrade it, confirm false.

### Issue #2 — Practice builder (multi-step onboarding)

**Goal:** After a minimal signup, route the practitioner through a multi-step builder that fills in their practice details. Writes to the structured columns added in Issue #0. No BAA in this step; this just captures the data the BAA will later be rendered against.

**Files to add / change:**

- `apps/web/app/(onboarding)/layout.tsx` (new). Auth-required but no dashboard chrome. Centered card layout with a step indicator at the top ("Step 2 of 3" etc.). Renders `{children}` only after `requireAuth()`.
- `apps/web/app/(onboarding)/practice/page.tsx` (new). Index route — redirects to whichever sub-step is incomplete, or to `/onboarding/agreements` if the practice is fully built. Logic: if `legal_name IS NULL` → `/onboarding/practice/identity`; if `address_line1 IS NULL` → `/onboarding/practice/address`; if `covered_entity_status = 'unknown'` → `/onboarding/practice/classification`; otherwise → `/onboarding/practice/review`.
- `apps/web/app/(onboarding)/practice/identity/page.tsx` + `form.tsx` + `actions.ts`. Fields: Practice legal name (required), DBA / doing-business-as name (optional). Hint copy explains legal name = the entity that will be named on the BAA. Submit → write to tenant row → redirect to `/onboarding/practice/address`.
- `apps/web/app/(onboarding)/practice/address/page.tsx` + `form.tsx` + `actions.ts`. Fields: address_line1 (required), address_line2 (optional), city (required), region/state (required), postal_code (required), country (default 'US'). Submit → write → redirect to `/onboarding/practice/classification`.
- `apps/web/app/(onboarding)/practice/classification/page.tsx` + `form.tsx` + `actions.ts`. Two fields. (1) Covered-entity self-attestation — radio group: "I am a covered entity under HIPAA (I bill insurance or transmit health info electronically for standard transactions)" / "I am not a covered entity (typical for cash-pay functional health practices)" / "Not sure" → maps to `covered_entity_status` values. (2) NPI number (optional, format-validated). Submit → write → redirect to `/onboarding/practice/review`.
- `apps/web/app/(onboarding)/practice/review/page.tsx`. Read-only summary of everything captured. Two CTAs: "Continue to agreements" → `/onboarding/agreements` (Issue #3 destination), "Edit" — a single link that lets them jump back to any step.
- `apps/web/lib/practice.ts` (new). Server helpers: `updatePracticeIdentity`, `updatePracticeAddress`, `updatePracticeClassification`, `getPractice(tenantId)`. Each writes only the columns that step owns, and audit-logs the change.
- `apps/web/middleware.ts`. Add the routing logic from the architecture-decisions section above: route to `/onboarding/practice` whenever `tenant.legal_name IS NULL`. Allow `/onboarding/*`, `/legal/*`, `/logout`.

**Acceptance criteria:**

- A freshly signed-up practitioner with `legal_name IS NULL` cannot reach `/dashboard` — they're routed to `/onboarding/practice` regardless of the URL they typed.
- They can complete all three sub-steps in order. Each step persists progress, so closing the browser and logging back in resumes at the right step.
- Going "back" via the browser back button doesn't lose entered data — server state is authoritative.
- After hitting "Continue to agreements" on the review page, the user lands at `/onboarding/agreements` (which is built in Issue #3 — if Issue #3 hasn't shipped yet, this page can be a placeholder that says "Agreements coming next" with a link back to `/dashboard`).
- All changes are audit-logged with action `practice_updated` and metadata naming the fields changed.

**Verification:** Sign up a fresh user. Walk through all three sub-steps. Confirm each step writes the correct columns via SQL. Close the browser mid-builder; log back in; confirm you resume at the right step. Try to visit `/dashboard` directly — assert redirect.

### Issue #3 — BAA + Terms + Privacy acceptance (single combined screen)

**Goal:** After the practice builder, present the BAA, Terms of Service, and Privacy Policy together. The BAA renders with the practice details from Issue #2 already populated in the document body. Accepting flips `tenants.lifecycle_status` from `pending_baa` to `active`.

**Files to add / change:**

- `apps/web/app/(onboarding)/agreements/page.tsx` + `form.tsx` + `actions.ts` (new). Single page. Top: "Before we begin, please review and accept the following agreements." Three expandable/scrollable sections rendered from the MDX files in Issue #1: Terms of Service, Privacy Policy, Business Associate Agreement. The BAA section dynamically interpolates the practice's legal_name, DBA, address, signing authority name, and covered-entity status into the document body — these are not editable on this screen (they were captured in Issue #2 and edits route the user back to `/onboarding/practice/review`). Three checkboxes, each required, each labeled "I have read and agree to the [document]." A single "Accept and continue" submit button.
- The submit action runs one transaction:
  1. Insert three rows into `legal_acceptances` (one per document kind) with the current version strings, IP, user agent, and a `snapshot JSONB` containing the practice details at this moment.
  2. UPDATE `tenants SET lifecycle_status = 'active', onboarded_at = now() WHERE id = $tenantId`.
  3. Write an audit log entry with action `legal_acceptance` and metadata listing the three versions accepted.
  4. COMMIT, then redirect to `/dashboard`.
- `apps/web/middleware.ts`. Extend the routing logic so that when `tenant.legal_name IS NOT NULL` and `tenant.lifecycle_status = 'pending_baa'`, any `/dashboard/*` request redirects to `/onboarding/agreements`.
- `apps/web/app/legal/[doc]/page.tsx` (new). Public route that renders the MDX from Issue #1 by version slug. Used for the inline "open in new tab" links from the agreements page (so practitioners can read the full document outside the embedded scroll area).

**Acceptance criteria:**

- A practitioner who completed the practice builder lands at `/onboarding/agreements` on next navigation.
- They cannot submit without all three checkboxes checked. Server re-validates.
- On submit, three legal_acceptances rows exist with matching `snapshot` JSONB containing legal_name, address, etc., and the tenant row has `lifecycle_status = 'active'` and `onboarded_at` set.
- The BAA section visually shows the practice's actual legal name and address — not template placeholders.
- After submit, they land on `/dashboard`. On a fresh-signup path, the dashboard is empty, so they see the hero empty state from Issue #5.
- Existing practitioners (seed/dev) get `lifecycle_status` backfilled to `'active'` and `onboarded_at` to their `created_at` in a small migration so they don't see onboarding on next login.

**Verification:** Walk through the full new-user path. Confirm legal_acceptances rows match the BAA content shown on screen. Try to skip past `/onboarding/agreements` by navigating directly to `/dashboard` — assert redirect back.

### Issue #4 — Post-patient-creation "Generate protocol" CTA

**Goal:** After a practitioner adds a new patient, they land on the patient detail page (not the dashboard list), with a clear "Next: capture intake" or "Generate protocol" CTA prominent at the top of the page. The current flow's `redirect("/dashboard")` is the bug; the fix is to redirect to the patient detail page.

**Files to change:**

- `apps/web/app/(dashboard)/dashboard/patients/new/actions.ts`. Change `redirect("/dashboard")` to `redirect(`/dashboard/patients/${id}?welcome=1`)`. Keep the `revalidatePath("/dashboard")` so the list updates on next visit.
- `apps/web/app/(dashboard)/dashboard/patients/[id]/page.tsx`. When `searchParams.welcome === "1"`, render a prominent banner above the four HubCards: title "Patient created", subtitle "Capture intake data and lab results to generate this patient's protocol." Two CTAs side by side: primary "Start intake" (links to `/dashboard/patients/[id]/intake`), secondary "Generate protocol" (links to `/dashboard/patients/[id]/protocol`, which already exists and handles the not-yet-ready state). The banner should be dismissible (close button) — set a cookie or just rely on the URL param going away on next navigation.
- The existing Protocol HubCard "Generate protocol" button stays — this is about giving it a *second*, more prominent surfacing for first-time-after-create context. Don't remove the HubCard CTA.

**Acceptance criteria:**

- Creating a new patient lands on `/dashboard/patients/[id]?welcome=1`, not `/dashboard`.
- The welcome banner is visible at the top of the page and only when `welcome=1` is in the URL.
- The "Start intake" CTA is the primary action; "Generate protocol" is secondary (because clinically you can't usefully generate a protocol with no intake data yet — make this explicit in the secondary CTA's tooltip or hint).
- Patient still appears in the dashboard list when the user navigates back.

**Verification:** E2E test: from dashboard, click "New patient", fill the form, submit. Assert URL contains the new patient ID and `welcome=1`. Assert banner text is present. Click "Start intake", assert navigation to intake. Hit back, navigate to dashboard, assert new patient is in the list.

### Issue #5 — First-run empty state for the dashboard

**Goal:** When a practitioner has zero patients, the dashboard main area is a large, centered, inviting call to action — not a small dashed-border card.

**Files to change:**

- `apps/web/components/ui/empty-state.tsx`. Add a new optional `size: "default" | "hero"` prop. When `size === "hero"`, switch to: min-height ~60vh, illustration or stylized icon (SVG inline, no asset dependency — something simple, e.g. a stylized clipboard or plus-in-circle, 80–120px), larger heading (`text-2xl`), longer description allowed (`max-w-lg`), and a larger primary button (use `Button` `size="lg"` if it exists, otherwise add it). Keep the existing default behavior for non-hero callers (don't break the foundations, records, or intake-hub empty states).
- `apps/web/app/(dashboard)/dashboard/page.tsx`. Update the empty-state branch:
  - Use `size="hero"`.
  - Title: "Add your first patient."
  - Description: "Clinical Signal turns intake data and labs into a clinical protocol and a phased client plan. Start by creating a patient record — you can complete their intake yourself or send them a secure link."
  - Action: primary "Add your first patient" button (size lg, links to `/dashboard/patients/new`); secondary text link below: "How the workflow works" → opens `/onboarding/ready` (or a static help page) in a new tab.
  - Hide the page header's "New patient" button when in this empty state — having two CTAs at different visual weights on an otherwise empty screen looks awkward. Keep it visible only when patients exist.
- `apps/web/components/ui/button.tsx`. Verify `size="lg"` is supported; if not, add it (taller padding, larger text). Don't break existing default/sm sizes.

**Acceptance criteria:**

- A practitioner with zero patients sees the hero empty state, not the small dashed-border one.
- The hero CTA is the only "new patient" CTA visible on the empty dashboard (the header button hides).
- A practitioner with one or more patients sees the existing table layout, unchanged.
- The non-hero `EmptyState` callers (`foundations`, `records`, `intake-hub`, etc.) render identically to before.

**Verification:** Visual smoke test in dev: sign up fresh, walk through onboarding, land on empty dashboard, confirm hero layout. Then add a patient, confirm table layout. Then check `foundations` page on a patient with no foundations assigned — confirm small empty state still looks right.

### Issue #6 — Settings hub conversion + practice details tab

**Goal:** Convert `/dashboard/settings` from a single-purpose playbook page into a tabbed/sub-routed hub. Add a Practice details tab that lets the practice owner edit any of the fields captured in the practice builder, with a confirmation modal warning that changes may require updating the BAA.

**Current state:** `/dashboard/settings/page.tsx` is the protocol playbook editor (reads `getPreferences`, renders `PreferencesForm` and `SuggestedPreferences`). The dashboard layout's top-nav already links to `/dashboard/settings`.

**Files to change / add:**

- `apps/web/app/(dashboard)/dashboard/settings/layout.tsx` (new). Adds an in-page sub-nav: Practice · Playbook · Account. Renders `{children}` below the sub-nav.
- `apps/web/app/(dashboard)/dashboard/settings/page.tsx`. Becomes an index that redirects to `/dashboard/settings/practice`.
- `apps/web/app/(dashboard)/dashboard/settings/playbook/page.tsx` (new). Move the current settings page body verbatim into this file. Keep `preferences-form.tsx`, `suggested-preferences.tsx`, `actions.ts` co-located (move them under `playbook/`).
- `apps/web/app/(dashboard)/dashboard/settings/practice/page.tsx` + `form.tsx` + `actions.ts` (new). Loads `getPractice(tenantId)` and renders an editable form with sections matching the practice builder: Identity (legal_name, dba_name), Address, Classification (covered_entity_status, npi), and Contact (business_email, business_phone). Read-only for non-owners (`user.role !== 'owner'`) — show a banner: "Only the practice owner can edit these details. Contact [owner name] to make changes."
- Save behavior: on submit, before persisting, show a confirmation modal: "Save changes? These changes may require you to update the Business Associate Agreement on file. Your previous BAA acceptance remains valid for the details captured at that time ([accepted date])." Two buttons: "Save changes" and "Cancel." Confirming submits the action; canceling closes the modal with the form still dirty.
- The action writes the changed columns (only the diffed fields) and audit-logs with action `practice_updated` and metadata listing the field names that changed. Does NOT touch `legal_acceptances` — snapshots remain immutable.
- `apps/web/app/(dashboard)/dashboard/settings/account/page.tsx` (new, can be stubbed). Placeholder for future account/security settings (change password, session settings, 2FA). For this issue, render a minimal "Coming soon" state and the practitioner's email + name (read-only). Counts as scaffolding for the sub-nav to feel complete.

**Acceptance criteria:**

- `/dashboard/settings` redirects to `/dashboard/settings/practice`.
- The three sub-nav links work and highlight the active section.
- Practice owner can edit all practice fields. The confirmation modal appears on save and the warning copy is exactly as specified.
- Non-owners see the read-only state with the contact-owner banner.
- The playbook page works identically to before — no behavior change visible to the user.
- After editing the practice, the changes are visible in the SQL `tenants` row but no new `legal_acceptances` row is written.
- `practice_updated` audit entries name the changed fields in metadata.

**Verification:** As an owner, change `legal_name` and `address_city`. Confirm modal appears, accept, confirm SQL row updated and audit log entry exists. As a non-owner (seed a second practitioner in the same tenant via SQL), confirm the form renders read-only. Confirm the playbook tab still works for adding/editing rules. Confirm legal_acceptances is unchanged after practice edits.

## Cross-cutting concerns

**Audit logging.** Issues #1, #2, #3, and #6 each touch identity/legal/practice state and must write to the audit log. Add these actions to whatever enum or string-set `writeAudit` uses: `legal_acceptance`, `practice_updated`, `onboarding_completed`. Reuse `signup` for the existing one. Update `apps/web/lib/audit.ts` accordingly. (The current `createPatientAction` already has a TODO about a patient-specific action type — out of scope here but worth noting.)

**No PHI in any of these flows.** Signup, onboarding, and the empty state never touch patient data. The post-creation CTA in Issue #4 does — it surfaces the patient name on the detail page, which is already a PHI surface. No new PHI handling required.

**Copy review.** Before shipping, have Dr. Laura or another functional health practitioner review the welcome screen, ready screen, empty state, and post-creation banner copy. The product's voice should match a clinical-but-warm tone, not generic SaaS.

**Accessibility.** All new forms must keep the existing `Field` component's label/hint/error pattern. The hero empty state must have a proper heading level (`h2`, since the page already has an `h1`). Onboarding screens are full-page; ensure focus order is sensible and the primary CTA is reachable by Tab.

## Suggested order and parallelization

**Issue #0 is blocking.** Nothing involving real practitioner signups, practice details, legal acceptances, or BAA enforcement should ship until per-signup tenant provisioning is in place.

Dependency chain:

- #0 (schema + per-signup tenant) blocks everything else.
- #1 (legal_acceptances schema) blocks #3.
- #2 (practice builder) blocks #3 (the BAA renders practice details captured here).
- #3 (BAA + Terms acceptance) blocks landing real users on `/dashboard` safely.
- #4 (post-patient CTA) and #5 (hero empty state) are technically independent of #1–#3 but depend on #0 for tenant isolation. Ship after the identity track or never put real users on them.
- #6 (settings hub + practice details edit) depends on #0 and #2 (it edits the same columns the builder writes), but does not block any other issue.

If working solo and serially: **#0 → #1 → #2 → #3 → #4 → #5 → #6.** That order produces a clean first-time path (signup → practice builder → BAA → dashboard with hero empty state → add first patient → land on patient detail with prominent CTAs) before retroactive editability comes online.

If parallelizing with two contributors: one takes the identity track (#0 → #1 → #2 → #3), the other takes the dashboard UX track (#4 → #5) starting as soon as #0 merges. #6 can ship anytime after #2 and is a good "first task for a third contributor" candidate.

## Done-done definition

The full feature set is done when a brand-new practitioner can:

1. Visit the signup page, enter only name + email + password, create an account, and have a fresh tenant provisioned in `pending_baa` state with them as the owner.
2. Be routed automatically into a multi-step practice builder that captures legal name, address, classification, and optional NPI — with the builder resumable across browser sessions.
3. After the builder, land on the BAA + Terms acceptance screen with the BAA rendered using their actual practice details, accept all three documents in one transaction, and have `lifecycle_status` flip to `active`.
4. Land on an inviting empty dashboard with a single obvious CTA.
5. Click "Add your first patient", fill the form, and immediately see the patient's detail page with prominent next-step CTAs (Start intake / Generate protocol).
6. Later, return to `/dashboard/settings/practice` to edit any practice detail, see a confirmation modal warning about BAA implications, and save without affecting their prior BAA acceptance record.
7. Have every step recorded in the audit log and in `legal_acceptances` with immutable snapshots of the practice details at time of acceptance.

…all without reading any documentation, asking Ryan for help, or knowing which thing to click. And with full tenant isolation between practitioners from the moment Issue #0 ships.
