-- 0009_audit_log_no_rls.sql — Restore audit_log as a cross-tenant append-only table.
-- 0002_rls.sql mistakenly enabled tenant_isolation on audit_log; WITH CHECK casts
-- current_setting('app.current_tenant_id') to uuid, which fails when withSystem()
-- clears the GUC to '' during login_success / login_failure writes.

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON audit_log;
ALTER TABLE audit_log NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;

COMMIT;
