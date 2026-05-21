# PRD — Practice & Practitioner as First-Class Entities

**Status:** Draft, ready for review
**Last updated:** May 18, 2026
**Author:** Ryan (with codebase audit)
**Related:** `ONBOARDING-BUILD-PLAN.md` (this PRD is the basis for Issue #0)

## The question

> Do we have a first-class entity for *practice* and *practitioner* in the DB schema? Are we set up for account creation, BAA, and HIPAA from a database perspective?

## TL;DR

**Practitioner: yes.** `practitioners` is a real table with email, password hash, role, credentials JSONB, FK to tenant. It works.

**Practice: no.** We have a `tenants` table doing duty as the auth boundary, but it has only `id`, `name`, `subscription_tier`, `settings`, `created_at`. It cannot represent a real practice — there is no legal name, no address, no signing authority, no NPI, no state of practice, no covered-entity classification, no lifecycle state beyond "exists." Worse, every signup currently attaches to the same hardcoded `DEFAULT_TENANT_ID` (`00000000-0000-0000-0000-000000000001`, "Dev Tenant"). This means **two practitioners signing up today would share a tenant and see each other's patients.** That is a P0 production blocker disguised as an environment-variable default.

**Account creation: partially.** Signup writes a practitioner row and a session. It does not provision a tenant. It does not capture any practice-level information. It does not record acceptance of any legal document.

**BAA: not at all.** Zero schema support. The `BAA-EMAIL-DRAFT.md` is about getting Anthropic to sign a BAA *with us*; we have nothing in the DB to record practitioners signing one *with us*.

**HIPAA: structurally yes, semantically no.** RLS is correctly enforced on every PHI-touching table using `app.current_tenant_id`. Audit logging exists. PHI is on a tenant boundary at the row level. But none of that helps when every new practitioner gets routed to the same tenant — RLS isolates tenants from each other, not practitioners within the same tenant.

This PRD proposes the schema and provisioning fixes needed to unblock the rest of the onboarding work in `ONBOARDING-BUILD-PLAN.md`.

## Current state — what's actually in the schema

### `tenants` (migration 0001)

```
id UUID PK
name TEXT
subscription_tier TEXT DEFAULT 'solo'
settings JSONB DEFAULT '{}'
created_at TIMESTAMPTZ
```

Used as the RLS isolation boundary. Has no other practice-level data. One hardcoded row exists (`Dev Tenant`).

### `practitioners` (migration 0001)

```
id UUID PK
tenant_id UUID FK -> tenants
email_lower TEXT UNIQUE
email TEXT
password_hash TEXT
name TEXT
role TEXT CHECK (owner|practitioner|viewer)
credentials JSONB DEFAULT '{}'
last_login_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

This is fine for what it does. The role enum implies multi-user practices ("owner" vs "practitioner" vs "viewer") but the rest of the system doesn't actually support that flow because there is no practice-level entity to be owner *of*.

### Supporting tables

`sessions`, `password_reset_tokens`, `audit_log` — all FK to practitioner and/or tenant. Fine.

### The signup code path

`apps/web/lib/auth.ts` `signup()`:

```ts
const tenantId = process.env.DEFAULT_TENANT_ID;
if (!tenantId) return { ok: false, error: "Server misconfigured: DEFAULT_TENANT_ID unset." };
// ... INSERT INTO practitioners (tenant_id, ...) VALUES ($1, ...)
```

Every signup inserts into the env-configured tenant. There is no `INSERT INTO tenants` anywhere in the signup path. This is the bug.

## Gaps, ranked

1. **No per-signup tenant provisioning.** Every new practitioner lands in the same tenant. This breaks RLS-based isolation in practice (no pun) because RLS isolates tenants, not practitioners. **P0.**
2. **No practice-level entity.** Nowhere to store legal name, DBA, business address, NPI (optional), tax ID, state of practice, primary signing authority, or business contact email. **P0** for BAA execution; without these fields the BAA cannot identify who is signing.
3. **No BAA / legal acceptance storage.** No table for legal acceptances, no version tracking, no IP/UA capture. Already called out in `ONBOARDING-BUILD-PLAN.md` Issue #1 but that issue assumes a `practice` exists to associate with. **P0.**
4. **No practitioner license capture.** `practitioners.credentials` is free-text JSONB. Functional health practitioners often hold real licenses (DC, ND, RD, MD, NP, LAc). For HIPAA covered-entity classification and for future state-of-practice scoping, we need structured license data. **P1** — can ship after signup but needed before real-patient onboarding.
5. **No tenant/practice lifecycle.** No states for `active | suspended | terminated_for_non_payment | terminated_for_breach`. Today there's no way to mark a practice as "BAA terminated, do not accept new PHI." **P1.**
6. **Role enum is aspirational.** `owner | practitioner | viewer` exists but nothing in the app uses it meaningfully — there is no UI to invite a second user to a practice, and no flow assigns ownership at practice creation. **P2** — fine to keep as-is until multi-user practices land.
7. **No covered-entity classification.** HIPAA treats different practitioners differently. A cash-pay functional health practitioner may not be a covered entity at all; a practitioner who bills insurance is. We should capture self-attestation so we know which BAA relationship applies. **P1.**

## Target state

Two structural changes, one conceptual.

**Conceptual:** `tenants` becomes "practice." It is the same row, but its semantics are explicit: one practice = one tenant = one BAA = one billing relationship = one RLS boundary. Multi-user practices add more rows in `practitioners`. Future expansion (a single business operating multiple legal practices) is out of scope for MVP and can be modeled later by adding a `business_groups` parent if ever needed.

**Structural change 1 — extend the `tenants` table** with practice-identifying columns:

```sql
ALTER TABLE tenants
  ADD COLUMN slug TEXT UNIQUE,                       -- url-safe identifier
  ADD COLUMN legal_name TEXT,                        -- "Laura Smith Functional Health LLC"
  ADD COLUMN dba_name TEXT,                          -- "Lighthouse Functional Medicine"
  ADD COLUMN business_email TEXT,                    -- contact for the practice, may differ from owner
  ADD COLUMN business_phone TEXT,
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN address_city TEXT,
  ADD COLUMN address_region TEXT,                    -- state/province
  ADD COLUMN address_postal_code TEXT,
  ADD COLUMN address_country TEXT DEFAULT 'US',
  ADD COLUMN npi TEXT,                               -- optional, validated format
  ADD COLUMN covered_entity_status TEXT
    CHECK (covered_entity_status IN ('covered_entity','business_associate','self_attested_non_ce','unknown'))
    DEFAULT 'unknown',
  ADD COLUMN signing_authority_practitioner_id UUID REFERENCES practitioners(id),
  ADD COLUMN lifecycle_status TEXT
    CHECK (lifecycle_status IN ('pending_baa','active','suspended','terminated'))
    NOT NULL DEFAULT 'pending_baa',
  ADD COLUMN onboarded_at TIMESTAMPTZ;
```

Naming note: we keep the table named `tenants` rather than renaming to `practices`. Twenty-plus downstream migrations and most lib code reference `tenant_id`. Renaming churns the diff for no architectural gain. Internally we use both words — "tenant" when discussing isolation, "practice" when discussing the business entity. They refer to the same row.

**Structural change 2 — fix the signup transaction** so each signup provisions its own tenant:

`apps/web/lib/auth.ts` `signup()` runs a single transaction that:

1. `INSERT INTO tenants (...) RETURNING id` with `lifecycle_status = 'pending_baa'`, `name` set from input.
2. `INSERT INTO practitioners (tenant_id, role='owner', ...) RETURNING id`.
3. `UPDATE tenants SET signing_authority_practitioner_id = $newPractitionerId WHERE id = $newTenantId`.
4. Create the session.
5. Write audit log entries.

All in one `BEGIN / COMMIT`. If anything fails, the whole signup rolls back. `DEFAULT_TENANT_ID` becomes dev-only, gated behind an env flag, and is the *only* way to attach to an existing tenant — used for seeded test data, not for real signup.

**Structural change 3 (P1, can ship in a follow-up) — practitioner licenses:**

```sql
CREATE TABLE practitioner_licenses (
  id UUID PK DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  license_type TEXT NOT NULL,         -- 'MD','DO','DC','ND','NP','RD','LAc','RN','other'
  license_other TEXT,                 -- when license_type='other'
  license_number TEXT,
  issuing_state TEXT,                 -- 'CA', 'NY', etc.
  issuing_country TEXT DEFAULT 'US',
  expires_on DATE,
  verified_at TIMESTAMPTZ,            -- null until manually/externally verified
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Not required for MVP signup. Required before any production-real-patient release.

## Migration plan

One migration: `database/migrations/0021_practice_first_class.sql`.

1. `ALTER TABLE tenants` add columns above. All nullable except `lifecycle_status` (default `'pending_baa'`).
2. Backfill the Dev Tenant row: set `legal_name = 'Dev Tenant'`, `slug = 'dev'`, `lifecycle_status = 'active'`, `signing_authority_practitioner_id` left null (or set to whatever existing owner practitioner is in dev seed).
3. Add a unique partial index on `tenants(slug)` where slug is not null.
4. Add an index on `tenants(lifecycle_status)` for the common "find practices missing BAA" query.

Code changes in the same PR:

- `apps/web/lib/auth.ts`: rewrite `signup()` to provision tenant + practitioner in a transaction as described above. Take a new `practiceName` parameter (defaulting to "{Name}'s practice" if not provided by the form).
- `apps/web/app/(auth)/signup/form.tsx`: add a "Practice or business name" field below "Your name."
- `apps/web/app/(auth)/signup/actions.ts`: pass `practiceName` through.
- `apps/web/lib/db.ts`: confirm `app.current_tenant_id` is set per request to the user's tenant — should already be the case; verify.
- Add a one-line dev-only override: `if (env.NODE_ENV === 'development' && env.DEFAULT_TENANT_ID && env.ATTACH_TO_DEFAULT_TENANT === 'true') ...` so seeded dev data continues to work without forcing real production signups through it.

## Open decisions

1. **Should the BAA gate signup completion, or gate first-patient creation?** Current `ONBOARDING-BUILD-PLAN.md` Issue #2 gates signup. That means `lifecycle_status` transitions `pending_baa → active` happen during the signup transaction (since acceptances are recorded then). Cleaner UX, harder to recover from if someone bails mid-flow. **Recommended: keep gating at signup.** Half-provisioned practices in `pending_baa` with no acceptances become a cleanup job; small cost.
2. **Practice slug — generated or chosen?** Auto-generate from legal_name on insert; allow edit later. Don't show in onboarding (one less field).
3. **NPI required at signup?** No. Many functional practitioners don't have one. Capture optionally in `/dashboard/settings`.
4. **Address required at signup?** No for MVP. Required at first BAA acceptance for the rendered BAA to be valid — so the BAA acceptance flow (Issue #2) must capture address as part of that screen, not signup.
5. **Practice name on the BAA.** The accepted BAA snapshot stores `legal_name` and `address_*` at time of acceptance, not a live reference, so future edits to the tenant row don't retroactively alter what was agreed to. This is a `legal_acceptances.snapshot JSONB` column on Issue #1.

## Acceptance criteria for the Issue #0 work

- A fresh signup creates exactly one new tenant row, one new practitioner row owning it, and one session — all in one transaction.
- Two consecutive signups produce two distinct tenants, each isolated by RLS. (E2E test: sign up as A, create a patient; sign up as B in a fresh browser; confirm B sees zero patients.)
- The Dev Tenant still works for seeded dev data and explicit attach via env flag, but is not the default for real signup.
- The tenants table has practice-identifying columns; lifecycle defaults to `pending_baa`.
- `signing_authority_practitioner_id` is set to the signup practitioner.
- No existing migration or seed file breaks; `npm run migrate` is clean forward and backward.
- A query like `SELECT COUNT(*) FROM tenants WHERE lifecycle_status = 'pending_baa'` returns the expected count.

## How this unblocks the rest of the build plan

Without this work:

- Issue #1 (legal_acceptances) writes rows that point to a practice that has no legal name, no address, no signing authority. The accepted document literally cannot identify the parties.
- Issue #2 (BAA gating at signup) is meaningless because every practitioner is in one shared tenant. Accepting a BAA against "Dev Tenant" doesn't bind anyone to anything.
- Issue #3 (onboarding sequence) wants a "practice profile" screen — there's nowhere for it to write to.
- Issues #4 and #5 (patient creation CTA, hero empty state) still technically work, but ship onto a foundation that leaks PHI across practitioners. Not safe to put in front of real users.

With this work, every subsequent issue in the build plan has a real practice entity to attach to. Issue #1's `legal_acceptances` rows reference a real practice. Issue #2's BAA acceptance flips `lifecycle_status` from `pending_baa` to `active`. Issue #3's profile screen writes to columns that already exist.

## Caveats

I'm not a lawyer. "Covered entity" classification, BAA enforceability, and license capture all have nuance per state and per practitioner type. The schema above is the *minimum* required to support a defensible click-through BAA flow; before any real-patient release, the actual document language and the data fields it references should be reviewed by counsel.
