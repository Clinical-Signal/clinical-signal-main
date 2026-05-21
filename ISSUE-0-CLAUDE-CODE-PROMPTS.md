# Issue #0 — Claude Code Prompts

Four prompts, in order. Each is self-contained and meant to be pasted into a fresh Claude Code session as a single PR's worth of work. Run them sequentially, review and merge each before starting the next.

**Important:** the signup form stays minimal (name + email + password only). Practice name and all other practice details are captured in Issue #2's practice builder, not at signup. The signup transaction provisions an empty tenant with a placeholder name; the practice builder fills it in.

Reference docs Claude Code should read at the start of every prompt:

- `PRACTICE-PRACTITIONER-SCHEMA-PRD.md` — authoritative spec for the schema and signup transaction changes.
- `ONBOARDING-BUILD-PLAN.md` — Issue #0 section explains scope and the relationship to Issues #1–#5.
- `CLAUDE.md` — repo-level conventions (security requirements, build order, PHI handling).

---

## Prompt 1 of 5 — Schema migration

```
Read PRACTICE-PRACTITIONER-SCHEMA-PRD.md and the Issue #0 section of
ONBOARDING-BUILD-PLAN.md before doing anything else. Also read
database/migrations/0001_auth.sql to understand the current tenants
and practitioners shape.

Your task: write database/migrations/0021_practice_first_class.sql.

Required ALTER TABLE on tenants — add the following columns, all
nullable except where noted:

  slug TEXT
  legal_name TEXT
  dba_name TEXT
  business_email TEXT
  business_phone TEXT
  address_line1 TEXT
  address_line2 TEXT
  address_city TEXT
  address_region TEXT
  address_postal_code TEXT
  address_country TEXT DEFAULT 'US'
  npi TEXT
  covered_entity_status TEXT CHECK (covered_entity_status IN
    ('covered_entity','business_associate','self_attested_non_ce','unknown'))
    DEFAULT 'unknown'
  signing_authority_practitioner_id UUID REFERENCES practitioners(id)
  lifecycle_status TEXT CHECK (lifecycle_status IN
    ('pending_baa','active','suspended','terminated'))
    NOT NULL DEFAULT 'pending_baa'
  onboarded_at TIMESTAMPTZ

Indexes:
  - CREATE UNIQUE INDEX tenants_slug_unique ON tenants(slug) WHERE slug IS NOT NULL
  - CREATE INDEX tenants_lifecycle_idx ON tenants(lifecycle_status)

Backfill the Dev Tenant row (id 00000000-0000-0000-0000-000000000001):
  - legal_name = 'Dev Tenant'
  - slug = 'dev'
  - lifecycle_status = 'active'
  - Leave signing_authority_practitioner_id NULL for now (no practitioner
    is unambiguously the owner of dev data).

Write a matching down migration if the repo follows that convention —
check whether existing migrations have rollbacks; match the existing style.

Do NOT modify any application code in this PR. This is migration-only.

Acceptance:
  - npm run migrate runs cleanly from a fresh database (database/init
    is the canonical entrypoint per migration 0001's comment).
  - Re-running the migration is a no-op (IF NOT EXISTS where applicable,
    or the migration runner handles it).
  - psql query: SELECT lifecycle_status, slug, legal_name FROM tenants
    WHERE id = '00000000-0000-0000-0000-000000000001' returns
    ('active','dev','Dev Tenant').

Verify before reporting done:
  - Run the migration locally against the dev database.
  - Run `npm test` — no existing tests should break (the migration
    is additive).
  - Show me the new migration file content in your final summary.
```

---

## Prompt 2 of 4 — Transactional signup that provisions a tenant per practitioner

```
Read PRACTICE-PRACTITIONER-SCHEMA-PRD.md and the Issue #0 section of
ONBOARDING-BUILD-PLAN.md. Then read apps/web/lib/auth.ts (especially
the signup() function) and apps/web/lib/db.ts to understand how the
pool and the app.current_tenant_id GUC are wired.

Prerequisite: migration 0021 from the previous prompt has been merged
and applied. Verify by inspecting the migrations directory before
proceeding.

Your task: rewrite signup() in apps/web/lib/auth.ts so that each new
practitioner gets their own freshly provisioned tenant. All inserts
run inside a single transaction. The signup form stays minimal
(name, email, password) — practice details are captured in Issue #2's
practice builder, not here.

SignupInput stays as:

  export interface SignupInput {
    email: string;
    password: string;
    name: string;
  }

Transaction order:

  1. BEGIN
  2. INSERT INTO tenants (name, legal_name, lifecycle_status)
     VALUES ($placeholderName, NULL, 'pending_baa')
     RETURNING id

     Where $placeholderName = `${name}'s practice` — this is a stopgap
     so the NOT NULL constraint on tenants.name is satisfied. The
     practice builder in Issue #2 will overwrite both name and
     legal_name. The fact that legal_name is NULL is what the
     middleware will use to route new users to the practice builder.

  3. INSERT INTO practitioners (tenant_id, email_lower, email,
     password_hash, name, role) VALUES (...,'owner') RETURNING id
  4. UPDATE tenants SET signing_authority_practitioner_id = $newPractitionerId
     WHERE id = $newTenantId
  5. Create the session (createSession may need to participate in the
     transaction or be called immediately after COMMIT — match the
     existing pattern; if createSession opens its own client, COMMIT
     first and let session creation be its own atomic step).
  6. writeAudit({ action: 'signup', tenantId, practitionerId,
     metadata: { event: 'practice_provisioned' } })
  7. COMMIT (if not already)

If any step before COMMIT fails, ROLLBACK and surface a friendly error.

Dev escape hatch: introduce a single check at the top of signup():

  const attachToDefault = process.env.ATTACH_TO_DEFAULT_TENANT === 'true'
    && process.env.NODE_ENV === 'development'
    && !!process.env.DEFAULT_TENANT_ID;

  if (attachToDefault) {
    // Existing behavior: insert practitioner into DEFAULT_TENANT_ID
    // without creating a new tenant. Used for dev fixtures only.
  } else {
    // New transactional path described above.
  }

In production, ATTACH_TO_DEFAULT_TENANT is never set, so the env-var
fallback never triggers. Document this in a top-of-function comment.

Other changes:
  - Remove the hard requirement that DEFAULT_TENANT_ID be set. Real
    signup no longer needs it. Only the dev fallback path needs it.
  - The "Server misconfigured: DEFAULT_TENANT_ID unset" error goes
    away for the main path.

Tests:
  - Update apps/web/lib/__tests__/auth*.test.ts (or add a new one if
    none exists for signup) to cover:
      a) Happy path: signup creates one tenant + one practitioner +
         session, with lifecycle_status='pending_baa', legal_name IS
         NULL, name='{name}\'s practice', and
         signing_authority_practitioner_id set.
      b) Duplicate email: still returns the friendly error, no tenant
         row leaks (transaction rolls back).
      c) Dev escape hatch: with ATTACH_TO_DEFAULT_TENANT=true and
         NODE_ENV=development, signup attaches to DEFAULT_TENANT_ID
         and does not insert a new tenant.

Do NOT touch the signup form or action in this PR. They stay exactly
as they are. The new behavior is purely server-side.

Verify before reporting done:
  - `npm test` passes including the new auth tests.
  - Manual sanity: start the dev server, sign up a new user via the
    existing form (unchanged), confirm a new tenant row exists with
    legal_name NULL and the practitioner is its owner.
  - Show me the diff for lib/auth.ts and the new/changed test file.
```

---

## Prompt 3 of 4 — Tests, dev fixtures, and any code that assumed one shared tenant

```
Read PRACTICE-PRACTITIONER-SCHEMA-PRD.md and the Issue #0 section of
ONBOARDING-BUILD-PLAN.md.

Prerequisite: prompts 1 and 2 have been merged. Verify by checking
that signup() provisions a tenant transactionally and the migration
columns are present on tenants.

Your task: hunt for and fix anywhere else in the codebase that
implicitly assumed all practitioners share one tenant, and shore up
the dev fixture path so seeded data continues to work cleanly.

Step 1 — Audit:

Run these searches and report what you find:

  grep -rn "DEFAULT_TENANT_ID" apps/ database/ scripts/
  grep -rn "Dev Tenant\|dev-tenant\|00000000-0000-0000-0000-000000000001" apps/ database/ scripts/
  grep -rn "current_tenant_id" apps/web/lib/

For each match, decide:
  - Is it production code that incorrectly assumes a single tenant?
    → Fix it.
  - Is it dev-only seeding or test setup?
    → Confirm it still works with the new ATTACH_TO_DEFAULT_TENANT flag.
  - Is it the RLS GUC mechanism in lib/db.ts setting
    app.current_tenant_id per-request?
    → Verify it correctly reads the authenticated user's tenant_id
       (not a hardcoded value).

Step 2 — Seed and dev fixtures:

Look at database/seed/ and database/migrations/0003_seed_dev.sql.
If seed scripts create practitioners directly via SQL, they should
still work (they bypass signup()). If anything calls signup() during
seeding, it must set ATTACH_TO_DEFAULT_TENANT=true.

Update the .env.example if needed to document the new
ATTACH_TO_DEFAULT_TENANT variable, with a comment that it is dev-only.

Step 3 — RLS sanity check:

Add a focused integration test (or extend an existing one) that:
  1. Signs up Practitioner A → creates Tenant A → creates a patient.
  2. Signs up Practitioner B → creates Tenant B.
  3. As B, queries listPatients(B.tenantId). Asserts zero results.
  4. As A, queries listPatients(A.tenantId). Asserts exactly the
     patient created in step 1.

This test is the load-bearing proof that Issue #0 actually fixed the
isolation bug. Name it something obvious like
isolation-between-signups.test.ts.

Step 4 — Documentation:

Update CLAUDE.md (or add a short section to PRACTICE-PRACTITIONER-
SCHEMA-PRD.md, your call) noting:
  - Real signup now provisions a tenant.
  - Dev seeding can opt into the shared Dev Tenant via the env flag.
  - When writing new server actions that touch PHI, do NOT hardcode
    or default a tenant_id — always read from the authenticated
    session.

Acceptance:
  - All findings from the audit are either fixed or explicitly
    documented as intentional.
  - The isolation test passes.
  - npm test and npm run migrate pass end-to-end.
  - .env.example reflects the new env flag.

Verify before reporting done:
  - Paste the grep output in your final summary so I can spot anything
    you missed.
  - Show me the new isolation test and any production code changes.
```

---

## Prompt 4 of 4 — End-to-end verification and PR-ready summary

```
Read PRACTICE-PRACTITIONER-SCHEMA-PRD.md and the Issue #0 section of
ONBOARDING-BUILD-PLAN.md.

Prerequisite: prompts 1–3 have been merged. Do not change any code
in this prompt unless verification surfaces a bug; this is a
verification-only pass.

Your task: prove Issue #0 is done by running the full acceptance
checklist and producing a written report.

Run and report on:

  1. Migration roundtrip:
     - Drop the test DB, re-init from scratch.
     - Apply all migrations.
     - Confirm tenants has every column from the PRD.
     - Confirm Dev Tenant row has correct backfilled values.

  2. Signup transaction integrity:
     - Sign up a new practitioner via the unchanged form. Confirm one
       new tenant row appears with lifecycle_status='pending_baa',
       legal_name IS NULL, name='{practitioner name}\'s practice', and
       signing_authority_practitioner_id pointing to the new
       practitioner.
     - Force a failure mid-transaction (temporarily make the practitioner
       insert fail, e.g. by trying to reuse an email). Confirm zero new
       rows in tenants — rollback works.
     - Restore.

  3. Isolation:
     - Sign up A. Add a patient. Note the patient name.
     - Sign up B in a private browser window.
     - As B, navigate to /dashboard. Assert empty patient list.
     - As B, try to navigate directly to /dashboard/patients/<A's patient id>.
       Should return notFound() or 404, not the patient.
     - As A, /dashboard still shows the patient.

  4. Dev fallback:
     - With ATTACH_TO_DEFAULT_TENANT=true and NODE_ENV=development,
       a signup attaches to the Dev Tenant — confirm via SQL.
     - Without the flag, signups provision new tenants. Confirm.

  5. Test suite:
     - npm test — full pass.
     - npm run lint — clean.
     - npm run build — no TS errors.

  6. Existing flows unbroken:
     - Login still works for an existing seeded practitioner.
     - Dashboard renders for an existing seeded practitioner. (Note:
       seeded practitioners may also have legal_name IS NULL on their
       tenant — if so, they will be routed to the practice builder
       once Issue #2 ships its middleware. For now, dashboard should
       still load.)
     - Creating a patient works.
     - Audit log captures the new signup with metadata
       event='practice_provisioned'.

Report format: one markdown section per numbered item above, with
✓ or ✗ and the relevant evidence (query output, screenshot path,
or test output). End with a one-paragraph readiness assessment for
Issue #1.

If anything fails, do not patch over it — flag it, file what needs
fixing, and stop.
```

---

## Notes for running these

- These prompts assume Claude Code has a worktree with the repo
  checked out and database access via `npm run migrate` and a
  working dev DB.
- Each prompt expects the previous one to be merged. Don't run them
  in parallel.
- The PRD is the spec. If a prompt and the PRD disagree, the PRD
  wins — fix the prompt and ask before proceeding.
- After Prompt 5 reports clean, Issue #0 is done and Issue #1
  (legal_acceptances) is unblocked.
