-- 0002_rls.sql — Tenant-scoped RLS for intake module tables (PRD Phase 1.4b).
-- Canonical GUC: app.current_tenant_id (see database/migrations/0012_fix_rls_guc_name.sql).
--
-- Run after 0001_intake_schema.sql:
--   psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0002_rls.sql

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'intake_tokens',
    'intake_documents',
    'document_chunks',
    'processing_jobs',
    'audit_log'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %1$I
        USING      (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    $p$, t);
  END LOOP;
END $$;

-- Brownfield note: legacy audit rows with NULL tenant_id are hidden under FORCE RLS.
-- Pre-tenant events (e.g. login) use the existing withSystem() / superuser paths.
-- New intake audit writes MUST set tenant_id (C-AUDIT).

COMMIT;
