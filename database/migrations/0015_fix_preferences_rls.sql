-- 0015_fix_preferences_rls.sql
-- Fix practitioner_preferences RLS policy: add missing `true` parameter
-- to current_setting() so it returns NULL instead of throwing when
-- the GUC is not set. Same fix that 0012 applied to protocol_edits
-- and suggested_preferences.

BEGIN;

DROP POLICY IF EXISTS tenant_isolation ON practitioner_preferences;

CREATE POLICY tenant_isolation ON practitioner_preferences
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

COMMIT;
