# Clinical Signal

AI-driven clinical protocol generation for functional health practitioners. See `CLAUDE.md` for project overview, `ARCHITECTURE.md` for the technical design, and `MVP-BUILD-SPEC.md` for the workflow-to-architecture mapping.

## Local Development

### Prerequisites

- Docker Desktop (with Docker Compose v2)
- Node.js 20+ and Python 3.12+ (only needed if you want to run services outside Docker)

### Run everything

```bash
cp .env.example .env
docker compose up --build
```

Services:

| Service          | URL                          |
|------------------|------------------------------|
| Web (Next.js)    | http://localhost:3000        |
| Analysis engine  | http://localhost:8000/health |
| PostgreSQL       | localhost:5432               |

Stop with `Ctrl+C`, or `docker compose down` to remove containers. Add `-v` to also drop the database volume.

### Repo layout

```
apps/web/                  Next.js 14 (App Router, TypeScript, Tailwind)
services/analysis-engine/  Python FastAPI service
packages/shared/           Shared types and validation schemas
database/                  Migrations, RLS policies, seed data
infrastructure/docker/     Dockerfiles
docker-compose.yml         Local dev orchestration
```

## Security Notes

- Never commit `.env` files or real credentials
- Synthetic data only outside production — PHI lives in production alone
- See `CLAUDE.md` for the full security checklist
