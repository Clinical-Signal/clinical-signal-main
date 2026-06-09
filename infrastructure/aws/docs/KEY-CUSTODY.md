# KEY-CUSTODY — pgcrypto column encryption (SEC-16)

**PRD:** SEC-16 — KMS key custody: `PGCRYPTO_KEY_REF` is an ARN or Secrets Manager reference, never plaintext key material. Annual rotation with a documented runbook.

This document describes how symmetric keys for `pgp_sym_encrypt` / `pgp_sym_decrypt` columns (`patients`, `records`, `analyses`, `intake_documents`, `document_chunks`, MFA secrets) are held in each environment.

---

## Environment model

| Environment | Variable | What it holds | Who may read it |
|---|---|---|---|
| **Local / CI** | `PGCRYPTO_KEY_REF_DEV` | Dev-only plaintext passphrase (`.env` only) | Developers on workstations; never committed |
| **Local / CI** (fallback) | `PHI_ENCRYPTION_KEY` | Legacy alias for the same dev passphrase | Same as above; prefer `PGCRYPTO_KEY_REF_DEV` for new work |
| **Production** | `PGCRYPTO_KEY_REF` | **Reference only** — KMS CMK ARN (`alias/cs-phi-column-prod`) or Secrets Manager secret ARN (`cs/prod/phi/data-key-wrapped`) | ECS task roles `ecsTaskRole-web`, `ecsTaskRole-engine` via `kms:Decrypt` |

**Non-negotiable:** Production task definitions must **not** set `PGCRYPTO_KEY_REF_DEV` or a literal `PHI_ENCRYPTION_KEY`. Plaintext key material exists only in process memory after KMS unwrap.

See also [data.md](../data.md#phi_encryption_key-migration-path) and [secrets-and-iam.md](../secrets-and-iam.md).

---

## Production custody flow

1. **Provision** — A data-encryption key (DEK) is generated under CMK `alias/cs-phi-column-prod`. Only the KMS-wrapped ciphertext is stored in Secrets Manager (`cs/prod/phi/data-key-wrapped`).
2. **Boot** — Each Fargate task assumes `ecsTaskRole-*` and calls `kms:Decrypt` on the wrapped DEK. Plaintext lives in process memory only.
3. **Per connection** — Application code sets the Postgres GUC `app.phi_key` (or passes the key as a bound parameter to `pgp_sym_*`) before any encrypted-column read/write. The database never stores the key.
4. **Audit** — CloudTrail logs every `kms:Decrypt` on `alias/cs-phi-column-prod`. Alerts on anomalous decrypt volume.

`PGCRYPTO_KEY_REF` in production is the **ARN string** the app uses to locate the wrapped key — for example:

```bash
PGCRYPTO_KEY_REF=arn:aws:secretsmanager:us-west-2:123456789012:secret:cs/prod/phi/data-key-wrapped
```

Operators rotate by re-wrapping a new DEK; application code picks up the new ciphertext on its refresh interval (see data.md).

---

## Local development flow

Developers copy `.env.example` and set:

```bash
PGCRYPTO_KEY_REF_DEV=dev_only_change_me_phi_crypt_key
```

Migrations that backfill encrypted columns use `current_setting('app.pgcrypto_key_dev')` with the same dev fallback documented in `database/migrations/0028_documents_pgcrypto.sql`.

**Do not** paste production key material into `.env`. **Do not** commit `.env`.

---

## Rotation runbook (production)

> **Human / infra task.** Execute only during a planned maintenance window with DBA + security sign-off.

### Preconditions

- [ ] New DEK generated and wrapped under `alias/cs-phi-column-prod`
- [ ] New ciphertext written to `cs/prod/phi/data-key-wrapped` (version bumped)
- [ ] Staged ECS task definition references updated secret version
- [ ] Rollback ciphertext version identified

### Steps

1. **Announce** — Notify on-call; freeze non-urgent deploys.
2. **Deploy dual-read** (if not already shipped) — Application must support ciphertext version headers on encrypted columns before bulk re-encryption.
3. **Roll tasks** — Deploy web + analysis-engine with new `PGCRYPTO_KEY_REF` secret version. Verify health checks and a sample patient name round-trip.
4. **Re-encrypt** (background) — Run `scripts/rotate-pgcrypto-key.ts` with explicit operator confirmation once the implementation is complete (today: stub refuses to run).
5. **Verify** — Spot-check decrypt on patients, records, intake documents; confirm CloudTrail decrypt events use the new CMK version.
6. **Retire** — Disable previous Secrets Manager version after all rows report the new ciphertext version.

### Rollback

Revert ECS to the previous Secrets Manager version and roll tasks. Rows encrypted with the new DEK only remain readable if dual-read was enabled; otherwise restore from PITR backup taken before step 3.

### Cadence

- **CMK automatic rotation:** annual (AWS-managed for symmetric CMKs).
- **DEK / data-key re-wrap:** at least annually or on personnel/incident trigger per SEC-16.

---

## Operator tooling

| Script | Purpose | Status |
|---|---|---|
| `scripts/rotate-pgcrypto-key.ts` | Offline re-encryption orchestrator | **Stub** — exits until `CONFIRM_PGCRYPTO_ROTATION=yes` and implementation lands |

Run locally (stub):

```bash
cd apps/web && pnpm exec tsx ../../scripts/rotate-pgcrypto-key.ts
```

Expected today: non-zero exit with TODO guidance.

---

## Verification checklist

- [ ] `grep -r "dev_only_change_me_phi_crypt_key" infrastructure/aws/` returns no production task definitions
- [ ] Production ECS task defs use `PGCRYPTO_KEY_REF` (ARN), not `PGCRYPTO_KEY_REF_DEV`
- [ ] `PHI_ENCRYPTION_KEY` absent from production Secrets injection
- [ ] CloudTrail `kms:Decrypt` on `alias/cs-phi-column-prod` visible for web/engine roles only
