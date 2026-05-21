# Data Layer — RDS, S3, KMS

**Goal:** All PHI at rest is encrypted with customer-managed KMS keys, RDS is Multi-AZ, S3 is per-environment and versioned, and the key boundaries are clear enough that a security reviewer can read this doc and verify the model.

---

## KMS — customer-managed keys

Distinct CMKs per resource class. Single-key blast radius is unacceptable for PHI; separate keys also let us scope key policies tightly.

| Key alias | Purpose | Used by |
|---|---|---|
| `alias/cs-rds-prod` | RDS storage encryption | RDS service principal (via key policy), automated backups |
| `alias/cs-s3-records-prod` | SSE-KMS for the records bucket (uploaded PDFs, lab files) | `ecsTaskRole-web`, `ecsTaskRole-engine` for Decrypt/GenerateDataKey on bucket reads/writes |
| `alias/cs-s3-exports-prod` | SSE-KMS for the exports bucket (protocol PDFs, derived artifacts) | `ecsTaskRole-web` |
| `alias/cs-secrets-prod` | KMS key used by Secrets Manager to wrap secret material | Secrets Manager service principal |
| `alias/cs-logs-prod` | KMS key for CloudWatch Logs log groups carrying audit-relevant entries | CloudWatch Logs service principal |
| `alias/cs-phi-column-prod` | The CMK that replaces the dev literal `PHI_ENCRYPTION_KEY` from [docker-compose.yml](../../docker-compose.yml) line 52 + 96. App layer calls `kms:Decrypt` per request (with a small caching window) to load the column-encryption key into the database session, the same way local dev sets `app.phi_key`. | `ecsTaskRole-web`, `ecsTaskRole-engine` |

**Key policy posture:**
- Root account has the standard "admin" statement.
- Every other principal granted on the key is named — no wildcards, no `Principal: "*"` even with conditions.
- Cross-account access: none in MVP. Add explicitly per key if/when needed.

**Rotation:** automatic annual rotation enabled on all CMKs. The `cs-phi-column-prod` key uses key-policy-controlled access rather than IAM policy alone because the app role's access to it is the single most sensitive grant in the system.

---

## RDS — PostgreSQL 16, Multi-AZ

**Mirrors local Postgres:** [docker-compose.yml](../../docker-compose.yml) line 2-3 pins `pgvector/pgvector:pg16`. RDS gets the same major version with `pgvector` added via the parameter group so the dev-prod gap stays small.

| Setting | Value | Why |
|---|---|---|
| Engine | PostgreSQL 16 (latest minor available at provision time) | Match local |
| Instance class | `db.t4g.medium` | 2 vCPU / 4 GB. Right-sized for MVP load; burstable. Easy to upsize without downtime. |
| Multi-AZ | **Yes** | [ADR 0003](./decisions/0003-multi-az.md) |
| Storage | 100 GB gp3 baseline, auto-scaling up to 1 TB | Storage is cheap; running out is a Sev1 |
| Storage encryption | KMS CMK `alias/cs-rds-prod` | HIPAA |
| Automated backups | 35-day retention, PITR enabled | Maximum on the RDS dial |
| Maintenance window | Sunday 06:00-07:00 PT | Lowest practitioner activity |
| Backup window | Daily 04:00-05:00 PT | Separate from maintenance |
| Deletion protection | **On** | Tripwire |
| Public accessibility | **No** | Lives in `private-data` subnets, no IGW route |
| Parameter group | Custom group enabling `shared_preload_libraries = 'pg_stat_statements'`; extensions `pgvector` and `pgcrypto` created at first migration | Application requires both |
| Performance Insights | Enabled, 7 days retention (free tier) | Diagnostics without paying for the extended tier |
| Enhanced Monitoring | Enabled, 60s granularity | Visibility into IO and lock contention |

### Database users — superuser vs `app_user`

This split exists in local dev and must survive on RDS. See [docker-compose.yml](../../docker-compose.yml) lines 32-34 (migrate connects as `POSTGRES_USER`) vs lines 51 and 84 (web and engine connect as `app_user`):

| Role | Privileges | Used by | Why |
|---|---|---|---|
| `clinical_signal` (RDS master) | Default RDS master (NOT a real superuser on RDS — RDS reserves `rds_superuser`); has CREATEROLE, CREATEDB, and the membership in `rds_superuser` that gives it everything except touching the OS | The one-shot `migrate` ECS task (mirrors [docker-compose.yml](../../docker-compose.yml) line 30-36) | Migration 0002 at [database/migrations/0002_core_schema.sql](../../database/migrations/0002_core_schema.sql) line 178-179 does `CREATE ROLE app_user WITH LOGIN NOSUPERUSER NOINHERIT PASSWORD '...'`. CREATEROLE is required. |
| `app_user` | `LOGIN NOSUPERUSER NOINHERIT`; granted `CONNECT` on the database, `USAGE` on schema `public`, CRUD on all tables and sequences (defaults set for future tables) — see [database/migrations/0002_core_schema.sql](../../database/migrations/0002_core_schema.sql) lines 173-201 | `web` and `analysis-engine` Fargate services | NOSUPERUSER is the whole point: RLS policies only apply to non-superusers. The runtime services connecting as `app_user` is what makes tenant isolation real. |

**Password handling on AWS:**
- `app_user_dev_password` literal in migration 0002 is dev-only. On RDS, the `migrate` task reads the production `app_user` password from Secrets Manager and `ALTER ROLE app_user WITH PASSWORD :secret;`s it on each run (idempotent; safe to re-apply on every deploy).
- Rotation rotates the secret and re-runs the migrate task; ALTER ROLE picks up the new password and existing connections are not affected until they reconnect.

---

## S3 — per-environment buckets

Two functional buckets per environment plus the Terraform state bucket (which is environment-agnostic but locked down separately).

| Bucket | Holds | KMS key | Lifecycle |
|---|---|---|---|
| `clinical-signal-records-prod` | Uploaded clinical PDFs, lab images, intake docs — the same blobs that today live in the `uploads` Docker volume ([docker-compose.yml](../../docker-compose.yml) line 75, 114) | `alias/cs-s3-records-prod` | Versioning + Object Lock (governance mode, 7-year minimum retention); transition objects to Standard-IA after 90 days; no expiration |
| `clinical-signal-exports-prod` | Generated protocol PDFs, derived clinician artifacts | `alias/cs-s3-exports-prod` | Versioning; transition to IA after 30 days; expire non-current versions after 365 days |
| `clinical-signal-terraform-state` | Terraform remote state | `alias/cs-secrets-prod` (or a dedicated `cs-tfstate` key — TBD) | Versioning required by Terraform; lifecycle expires non-current versions after 90 days |

**Bucket-wide settings (all buckets):**
- Block Public Access: all four toggles **on**
- Default encryption: SSE-KMS with the bucket's CMK; `BucketKeyEnabled = true` to amortize KMS calls
- Bucket policy: deny any request without `aws:SecureTransport = true`; deny any request that doesn't reference the expected KMS key
- Access logging: enabled, target is a dedicated `clinical-signal-access-logs` bucket with a 365-day expiration
- Per-tenant prefix layout: `s3://clinical-signal-records-prod/<tenant_uuid>/<patient_uuid>/<record_uuid>/...` so access logs are immediately legible at tenant granularity

**Object-level:**
- All uploads go via presigned PUT URLs generated server-side (the app never proxies bytes through its own memory)
- All downloads go via presigned GET URLs with short TTLs (≤5 minutes)
- This matches the architecture note in [ARCHITECTURE.md](../../ARCHITECTURE.md) ("Pre-signed URLs" — documents never served through the application)

---

## `PHI_ENCRYPTION_KEY` migration path

This is the bit that requires the most care because the dev literal in [docker-compose.yml](../../docker-compose.yml) line 52 and 96 is touched on every request that reads or writes a pgcrypto-encrypted column.

**Today (local):**
1. `PHI_ENCRYPTION_KEY=dev_only_change_me_phi_crypt_key` is exported into the `web` and `analysis-engine` containers.
2. The app sets `app.phi_key` on each connection from this env var.
3. pgcrypto reads `current_setting('app.phi_key')` to encrypt/decrypt patient name and DOB.

**On AWS:**
1. The actual key material lives only inside KMS — never written to env or disk.
2. On boot, each Fargate task assumes its task role and calls `kms:Decrypt` against `alias/cs-phi-column-prod` to retrieve a data key wrapped at provision time.
3. The plaintext data key is held in process memory and refreshed on a small interval (e.g., 10 minutes) — short enough that a compromise window is bounded, long enough to avoid hammering KMS.
4. The app sets `app.phi_key` on each DB connection using the in-memory data key, identical to local behavior from the database's perspective.
5. Rotation: provision a new wrapped data key in KMS; the next refresh tick picks it up. The encrypted-column ciphertext format must be versioned so we can rotate without re-encrypting all existing rows in one shot.

This is the cheapest pattern that honors the `CLAUDE.md` rule "PHI_ENCRYPTION_KEY never leaves secret storage" without putting KMS on the critical path of every single PHI read.

---

## Things this design deliberately does not do (yet)

- **No read replica.** Multi-AZ standby is not a read replica. Add a read replica only when the practitioner-facing analytics workload demands it.
- **No cross-region backup copies.** Daily snapshots stay in us-west-2. Cross-region DR is a follow-up.
- **No S3 Object Lock in compliance mode** (governance mode only). Compliance mode is irrevocable, which is a sharper foot-gun than we want during MVP. Governance gives us the same audit story without the operational risk.
- **No row-level encryption beyond name/DOB.** ICD-10 codes and other extracted fields stay in JSONB. Column encryption everywhere makes audit logs unreadable. RLS + KMS at rest is the policy.
