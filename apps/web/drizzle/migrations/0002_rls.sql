-- 0002_rls.sql — Tenant-scoped RLS for intake module tables (PRD Phase 1.4b).
-- Canonical GUC: app.current_tenant_id (see 0012_fix_rls_guc_name.sql).
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
    'processing_jobs'
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

-- audit_log: intentionally NO RLS (legacy 0002 — append-only, cross-tenant admin reads,
-- pre-tenant login events). Intake audit writes use withSystem({ reason: ... }) like
-- the existing lib/audit.ts pattern. C-AUDIT payload rules enforced in application code.

COMMIT;
