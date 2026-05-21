-- 0023_schema_migrations_table.sql
--
-- Phase 1 / PR1: introduces the `schema_migrations` table that the migration
-- runner (apps/web/scripts/migrate.mjs) uses to track which migration files
-- have been applied to this database.
--
-- Until this PR landed, migrations were run manually (.aptible.yml comment:
-- "migrations are run manually") and partially via database/init/*.sql which
-- only covered 0001-0005. Files 0006-0022 had no automated application path,
-- so a fresh container could ship with an incomplete schema. The migration
-- runner closes that gap and uses this table to do so safely.
--
-- Why this is a regular numbered migration rather than a runner bootstrap:
--   - Keeps migration history homogeneous and discoverable in one place.
--   - The runner creates the table itself first if missing (CREATE IF NOT
--     EXISTS), then adopts/baselines historical migrations, then applies
--     new ones. Including this file in the migrations directory means the
--     runner records its own existence as "applied" on first successful run,
--     which is the desired self-referential behavior.
--
-- Repo convention is forward-only migrations (no down files). This table
-- intentionally has no RLS — it's metadata, not PHI, and is read/written
-- exclusively by the deploy-time migration process running as the database
-- owner (Aptible) or superuser (local dev), never by the application
-- runtime which connects as `app_user`.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  -- "0023" style version prefix. TEXT (not INT) so we never lose leading
  -- zeros and so future formats (e.g. timestamps) remain compatible.
  version     TEXT PRIMARY KEY,
  -- The descriptive remainder of the filename, e.g. "schema_migrations_table".
  name        TEXT NOT NULL,
  -- SHA-256 hex digest of the migration file's bytes at application time.
  -- The runner compares this to the on-disk hash on every subsequent run
  -- and refuses to start if they don't match. Migrations are immutable;
  -- amend prior schema by adding a new migration, never by editing an
  -- already-applied file.
  sha256      TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT current_user
);

COMMIT;
