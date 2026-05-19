-- 0022_practice_first_class.sql
--
-- Issue #0 of ONBOARDING-BUILD-PLAN.md / PRACTICE-PRACTITIONER-SCHEMA-PRD.md.
-- Extends `tenants` so it can actually represent a practice (legal name,
-- address, signing authority, covered-entity classification, lifecycle
-- state). Required by Issues #1-#3 of the build plan — legal acceptances,
-- BAA gating at signup, and the onboarding sequence all need real practice
-- fields to write into.
--
-- Naming note from the PRD: we keep the table named `tenants` rather than
-- renaming to `practices` because ~20+ downstream migrations and most lib
-- code reference `tenant_id`. Internally: "tenant" when discussing
-- isolation, "practice" when discussing the business entity. Same row.
--
-- Number note: the PRD + Issue #0 reference this file as 0021. Renumbered
-- to 0022 to avoid colliding with the already-merged
-- 0021_extend_category_check_v2.sql. Functionally unchanged.
--
-- Repo convention is forward-only migrations (no down files). Idempotent
-- via IF NOT EXISTS so re-running is a no-op.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Practice-identity columns. All nullable except lifecycle_status.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS slug                              TEXT,
  ADD COLUMN IF NOT EXISTS legal_name                        TEXT,
  ADD COLUMN IF NOT EXISTS dba_name                          TEXT,
  ADD COLUMN IF NOT EXISTS business_email                    TEXT,
  ADD COLUMN IF NOT EXISTS business_phone                    TEXT,
  ADD COLUMN IF NOT EXISTS address_line1                     TEXT,
  ADD COLUMN IF NOT EXISTS address_line2                     TEXT,
  ADD COLUMN IF NOT EXISTS address_city                      TEXT,
  ADD COLUMN IF NOT EXISTS address_region                    TEXT,
  ADD COLUMN IF NOT EXISTS address_postal_code               TEXT,
  ADD COLUMN IF NOT EXISTS address_country                   TEXT DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS npi                               TEXT,
  ADD COLUMN IF NOT EXISTS covered_entity_status             TEXT
    CHECK (covered_entity_status IN (
      'covered_entity',
      'business_associate',
      'self_attested_non_ce',
      'unknown'
    ))
    DEFAULT 'unknown',
  -- FK to practitioners; ON DELETE SET NULL so a practitioner deletion
  -- doesn't block tenant cleanup. The practice survives in
  -- pending/suspended state until a new signing authority is assigned.
  ADD COLUMN IF NOT EXISTS signing_authority_practitioner_id UUID
    REFERENCES practitioners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status                  TEXT
    CHECK (lifecycle_status IN (
      'pending_baa',
      'active',
      'suspended',
      'terminated'
    ))
    NOT NULL DEFAULT 'pending_baa',
  ADD COLUMN IF NOT EXISTS onboarded_at                      TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Backfill the Dev Tenant row.
--    Set on every re-run; values are stable so this is idempotent.
--    signing_authority_practitioner_id is intentionally left NULL — no
--    single practitioner unambiguously owns dev data, and the signup
--    rewrite (Issue #0 application-code work) will set it on new tenants.
-- ---------------------------------------------------------------------------

UPDATE tenants
   SET legal_name       = 'Dev Tenant',
       slug             = 'dev',
       lifecycle_status = 'active'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. Indexes.
--    - slug is unique when present (partial index — pre-Issue #0 rows
--      legitimately have NULL slug and shouldn't collide with each other).
--    - lifecycle_status supports the common "find practices needing BAA"
--      query from the onboarding admin views.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique
  ON tenants(slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenants_lifecycle_idx
  ON tenants(lifecycle_status);

COMMIT;
