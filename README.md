# Clinical Signal

AI-driven clinical protocol generation for functional health practitioners. See `CLAUDE.md` for project overview, `ARCHITECTURE.md` for the technical design, and `MVP-BUILD-SPEC.md` for the workflow-to-architecture mapping.

> **Deployment status (May 2026):** Aptible and Railway have both been retired (Aptible per #222; Railway in this commit — its deploy had been red since PR3 because its build context didn't know about `packages/`). AWS migration is in progress (target: Bedrock for LLM, RDS for Postgres, S3 + KMS for PHI storage, ECS Fargate behind ALB). **Until AWS bring-up is complete, all development and testing happens locally** via the docker-compose stack below. No hosted environment is currently running.

## Local Development

### Prerequisites

- Docker Desktop (with Docker Compose v2)
- Node.js 20+ and Python 3.12+ (only needed if you want to run pieces outside Docker — for example, executing `npm run db:migrate` from the host)

### One-command bring-up

```bash
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY (dev only — synthetic data, no BAA required)
docker compose up --build
```

Boot order (enforced via `service_completed_successfully` gates):

1. **`postgres`** — pgvector/pg16 image, persists in the `postgres_data` volume
2. **`migrate`** — one-shot runner that applies any unapplied SQL files in `database/migrations/`. On an existing dev volume, baselines historical migrations as already-applied so you don't double-apply. See `apps/web/scripts/migrate.mjs` for the algorithm.
3. **`analysis-engine`** and **`web`** start in parallel once the migrate container exits 0.

Services:

| Service          | URL                          |
|------------------|------------------------------|
| Web (Next.js)    | http://localhost:3000        |
| Analysis engine  | http://localhost:8000/health |
| PostgreSQL       | localhost:5432               |

Stop with `Ctrl+C`, or `docker compose down` to remove containers. Add `-v` to also drop the database volume — useful if you want a clean migration run from `0001` instead of the baseline path.

### Running migrations manually

The same runner that powers the `migrate` container also runs from the host:

```bash
cd apps/web
DATABASE_URL=postgresql://clinical_signal:change_me_dev_only@localhost:5432/clinical_signal \
  npm run db:migrate
```

The runner:

- Tracks applied migrations in `schema_migrations` (version + SHA-256 hash)
- Refuses to start on duplicate version prefixes or hash drift on previously-applied migrations
- Applies each file in its own transaction
- Idempotent — re-running is a no-op

### Running tests

```bash
cd apps/web
npm install
npx tsc --noEmit                  # typecheck
npx vitest run lib/__tests__/     # unit tests
```

> Why `npx vitest run lib/__tests__/` and not `npm run test:unit`? The package.json script currently globs `e2e/*.spec.ts` (Playwright) too, which fails under Vitest. Tracked as a separate cleanup; until then, scope vitest explicitly to the unit-test directory.

Engine-side sanity (no full pytest suite yet):

```bash
cd services/analysis-engine
pip install -r requirements.txt
python -m compileall -q app scripts
```

## Continuous Integration

`.github/workflows/validate.yml` runs on every PR and push to `main`:

- **web** — typecheck + vitest unit tests
- **engine** — `compileall` over `app/` and `scripts/`
- **migrations** — filename hygiene (no duplicate version prefixes, all conform to `NNNN_name.sql`)

There is no deploy workflow at the moment (Aptible was deleted; AWS isn't wired yet). Merges to `main` only validate — they don't deploy anywhere.

## Repo layout

```
apps/web/                  Next.js 14 (App Router, TypeScript, Tailwind)
services/analysis-engine/  Python FastAPI service
packages/shared/           Shared types and validation schemas
database/migrations/       Versioned SQL migrations (runner: apps/web/scripts/migrate.mjs)
database/seed/             Synthetic dev data + knowledge corpus staging dirs
infrastructure/docker/     Per-service Dockerfiles (web + engine)
Dockerfile                 Root multi-stage build for the production web image
docker-compose.yml         Local dev orchestration (postgres + migrate + engine + web)
.github/workflows/         CI (validate.yml)
```

## Security Notes

- Never commit `.env` files or real credentials
- **Synthetic data only outside production — PHI lives in production alone.** Until AWS production is up, there *is* no production; do not load real patient data into local Postgres
- All `database/migrations/*.sql` are immutable once applied; create a new file to amend a schema rather than editing in place
- See `CLAUDE.md` for the full security checklist
