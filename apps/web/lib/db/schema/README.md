# Intake module — Drizzle schema (Phase 1)

Typed definitions in this folder map to PRD §4. SQL is produced two ways:

1. **`pnpm dlx drizzle-kit generate`** (from `apps/web`) — table DDL + btree indexes + partial unique token index.
2. **Hand-authored SQL** — `0001_phase1_supplemental.sql` (pgvector, `patients.intake_status`, HNSW, brownfield `ALTER`s) and `0002_rls.sql` (RLS).

## Apply to local Postgres

**Brownfield** (legacy `database/migrations` already applied):

```bash
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0001_phase1_supplemental.sql
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0002_rls.sql
```

**Greenfield** (empty DB after core tenant/patient/practitioner DDL):

```bash
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0000_phase1_intake.sql
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0001_phase1_supplemental.sql
psql "$DATABASE_URL" -f apps/web/drizzle/migrations/0002_rls.sql
```

Or: `pnpm --filter @clinical-signal/web db:intake-migrate` (brownfield path).

## Tables

| File | Table |
|------|--------|
| `intake-tokens.ts` | `intake_tokens` |
| `intake-documents.ts` | `intake_documents` |
| `document-chunks.ts` | `document_chunks` + `vector(1536)` |
| `processing-jobs.ts` | `processing_jobs` |
| `audit-log.ts` | `audit_log` (legacy column names) |
| `patients-intake.ts` | Documents `intake_status` + `intake_data` keys (no `pgTable`) |

## Verify

```bash
pnpm run verify:phase1   # from repo root
```
