-- 0029_role_check_constraint.sql — PRD §5.6: add 'coach' to practitioners.role CHECK.
--
-- Brownfield: practitioners.role is TEXT with an inline CHECK from 0001_auth.sql.
-- Existing rows are unchanged; only the constraint widens to accept 'coach'.

DO $drop_role_check$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'practitioners'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE practitioners DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$drop_role_check$;

ALTER TABLE practitioners
  ADD CONSTRAINT practitioners_role_check
  CHECK (role IN ('owner', 'practitioner', 'viewer', 'coach'));

COMMENT ON COLUMN practitioners.role IS
  'PRD §5.6 RBAC role: owner | practitioner | viewer | coach.';
