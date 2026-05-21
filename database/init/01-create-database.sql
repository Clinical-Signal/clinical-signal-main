-- 01-create-database.sql
--
-- Postgres docker-entrypoint-initdb.d only runs once on first cluster
-- initialization (POSTGRES_DB / POSTGRES_USER are set up before this).
-- Everything in here is the minimum to make the database accept the
-- migration runner — the runner (apps/web/scripts/migrate.mjs) takes
-- over from migration 0001_auth.sql onward.
--
-- Why pgcrypto here and not in a migration:
--   - The `pgp_sym_*` functions used for column-level PHI encryption
--     are referenced in early migrations and at runtime by the app.
--   - Creating the extension requires superuser; the migration runner
--     also runs as superuser in dev, but Aptible-managed databases ship
--     with pgcrypto pre-enabled, so this CREATE EXTENSION is a local-dev
--     convenience only.

\connect clinical_signal
CREATE EXTENSION IF NOT EXISTS pgcrypto;
