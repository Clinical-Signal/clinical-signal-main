-- 0012_fix_rls_guc_name.sql
-- CRITICAL FIX: Migration 0011 used 'app.tenant_id' in RLS policies but
-- the application sets 'app.current_tenant_id'. This mismatch could allow
-- cross-tenant data access or block all access depending on PostgreSQL's
-- behavior when a GUC is unset.

BEGIN;

-- Drop the incorrect policies
DROP POLICY IF EXISTS tenant_isolation ON protocol_edits;
DROP POLICY IF EXISTS tenant_isolation ON suggested_preferences;

-- Recreate with the correct GUC name (matching withTenant() in lib/db.ts)
CREATE POLICY tenant_isolation ON protocol_edits
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON suggested_preferences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- The second parameter `true` means return NULL instead of throwing an error
-- when the GUC is not set. This matches the pattern used in migrations
-- 0002, 0004, and 0006.

COMMIT;
