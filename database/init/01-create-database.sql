-- The clinical_signal database is created by the Postgres entrypoint via POSTGRES_DB.
-- This script ensures pgcrypto is available; schema migrations land here in issue 1.3.
\connect clinical_signal
CREATE EXTENSION IF NOT EXISTS pgcrypto;
