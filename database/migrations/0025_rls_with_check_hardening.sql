-- 0025_rls_with_check_hardening.sql
--
-- Phase 1 / PR2: closes the cross-tenant write loophole on RLS policies
-- that were created with USING but no WITH CHECK clause.
--
-- Background:
--   PostgreSQL evaluates RLS policy clauses in two stages:
--     - USING       : applied to existing rows for SELECT / UPDATE / DELETE.
--                     A row whose USING expression is false is invisible.
--     - WITH CHECK  : applied to NEW row values for INSERT / UPDATE.
--                     A row whose WITH CHECK is false is rejected.
--   When a policy specifies USING only (no WITH CHECK), Postgres falls back
--   to USING for WITH CHECK on UPDATE *only when the new row is read back* —
--   but for INSERT, an absent WITH CHECK means "permit any value." More
--   importantly, an UPDATE that changes `tenant_id` itself can pass the
--   USING filter (the existing row belongs to the current tenant) while the
--   new value sets tenant_id to another tenant. Without WITH CHECK that
--   write succeeds, producing a row whose tenant_id no longer matches the
--   policy and which is then invisible to either tenant.
--
--   This is a real defect — not theoretical. RLS without WITH CHECK has
--   been the source of multiple cross-tenant write CVEs in production
--   PostgreSQL deployments.
--
-- Affected policies (USING-only as of this migration):
--   - patient_timeline           (0007)
--   - protocol_outputs           (0009)
--   - protocol_edits             (0011, replaced by 0012 — still no WITH CHECK)
--   - suggested_preferences      (0011, replaced by 0012 — still no WITH CHECK)
--   - clinical_dialogues         (0013)
--   - practitioner_knowledge     (0013)
--   - foundational_plans         (0014)
--   - practitioner_preferences   (0010, replaced by 0015 — still no WITH CHECK)
--
-- Strategy:
--   For each affected table, DROP the existing policy and CREATE a new one
--   with both USING and WITH CHECK. The whole thing runs in one transaction
--   so there is never a moment when any of these tables has no policy.
--
-- Canonical clause used:
--   tenant_id = current_setting('app.current_tenant_id', true)::uuid
--   - The second arg `true` makes current_setting return empty string when
--     the GUC is unset (instead of erroring). The application always sets
--     the GUC inside withTenant() / tenant_conn() before any PHI query, so
--     in practice this just adds defensive consistency with the policies
--     in 0002, 0004, 0006, 0012, 0015.
--   - lowercase `uuid` matches the majority style across existing policies.
--
-- Repo convention is forward-only migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- patient_timeline (0007)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON patient_timeline;
CREATE POLICY tenant_isolation ON patient_timeline
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- protocol_outputs (0009)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON protocol_outputs;
CREATE POLICY tenant_isolation ON protocol_outputs
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- protocol_edits (0011 -> 0012)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON protocol_edits;
CREATE POLICY tenant_isolation ON protocol_edits
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- suggested_preferences (0011 -> 0012)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON suggested_preferences;
CREATE POLICY tenant_isolation ON suggested_preferences
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- clinical_dialogues (0013)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON clinical_dialogues;
CREATE POLICY tenant_isolation ON clinical_dialogues
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- practitioner_knowledge (0013)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON practitioner_knowledge;
CREATE POLICY tenant_isolation ON practitioner_knowledge
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- foundational_plans (0014)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON foundational_plans;
CREATE POLICY tenant_isolation ON foundational_plans
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- practitioner_preferences (0010 -> 0015)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON practitioner_preferences;
CREATE POLICY tenant_isolation ON practitioner_preferences
  USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Self-check: every policy we just (re)created must have a non-NULL
-- with_check expression. Belt-and-braces for a future hand edit that
-- accidentally drops the WITH CHECK clause again.
-- ---------------------------------------------------------------------------
DO $audit$
DECLARE
  affected_tables TEXT[] := ARRAY[
    'patient_timeline',
    'protocol_outputs',
    'protocol_edits',
    'suggested_preferences',
    'clinical_dialogues',
    'practitioner_knowledge',
    'foundational_plans',
    'practitioner_preferences'
  ];
  t TEXT;
  has_with_check BOOLEAN;
BEGIN
  FOREACH t IN ARRAY affected_tables LOOP
    SELECT with_check IS NOT NULL
      INTO has_with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = t
       AND policyname = 'tenant_isolation';
    IF has_with_check IS NULL THEN
      RAISE EXCEPTION 'tenant_isolation policy missing on table %', t;
    END IF;
    IF NOT has_with_check THEN
      RAISE EXCEPTION 'tenant_isolation policy on table % has no WITH CHECK clause', t;
    END IF;
  END LOOP;
END
$audit$;

COMMIT;
