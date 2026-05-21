# AWS Target Architecture — Clinical Signal

**Status:** Design only. No AWS resources have been provisioned. This document and its siblings exist so each subsequent bring-up issue is execution, not deliberation.

**Audience:** Anyone picking up one of the per-resource-group bring-up issues (VPC, RDS, S3+KMS, ECS, Secrets, ALB+ACM, IAM, CloudWatch).

**See also:**
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — application architecture
- [CLAUDE.md](../../CLAUDE.md) — security and HIPAA requirements that constrain everything below
- [docker-compose.yml](../../docker-compose.yml) — current source of truth for service topology, env vars, and boot order

---

## Why this PR exists

Aptible was retired in [#222](https://github.com/Clinical-Signal/clinical-signal-main/pull/222). The deterministic migration runner landed in [#220](https://github.com/Clinical-Signal/clinical-signal-main/pull/220). Four other PRs ([#196](https://github.com/Clinical-Signal/clinical-signal-main/pull/196), [#219](https://github.com/Clinical-Signal/clinical-signal-main/pull/219), [#215](https://github.com/Clinical-Signal/clinical-signal-main/pull/215), [#216](https://github.com/Clinical-Signal/clinical-signal-main/pull/216)) are merged to `main` but have nowhere hosted to run. Until AWS bring-up is done, all dev/test happens locally via `docker compose up`.

We use this window to lock down the target architecture on paper so the actual provisioning work is small, sequential, and predictable.

---

## Locked decisions

Three blocking decisions are recorded as ADRs in [`decisions/`](./decisions/):

| ADR | Decision | Why |
|---|---|---|
| [0001-region.md](./decisions/0001-region.md) | **us-west-2 (Oregon)** | Bedrock model availability historically lands here first; lower latency for west-coast practitioners |
| [0002-iac-tool.md](./decisions/0002-iac-tool.md) | **Terraform** | HCL is greppable in security review; remote state in S3 + DynamoDB lock doubles as a change log |
| [0003-multi-az.md](./decisions/0003-multi-az.md) | **Multi-AZ from day one** | $70-100/mo cost delta is rounding error against "practitioner doesn't lose access mid-call" |

---

## Mapping: today → AWS target

Cross-reference the "Today" column against [docker-compose.yml](../../docker-compose.yml) to verify each row is faithful to the current local setup.

| Today (local, from `docker-compose.yml`) | AWS target | Why |
|---|---|---|
| `pgvector/pgvector:pg16` container in `postgres_data` named volume (line 2-3) | **RDS Postgres 16**, `db.t4g.medium`, Multi-AZ, KMS-encrypted at rest, automated backups 35d, PITR. Parameter group enables `pgvector` and `pgcrypto`. | Managed, KMS-encrypted, Multi-AZ failover, automated backups — HIPAA-eligible. See [data.md](./data.md). |
| `uploads` Docker named volume holding patient PDFs (line 75, 114) | **S3 bucket per environment** (`clinical-signal-records-prod`, `-staging`), SSE-KMS, block-all-public, versioning + object-lock | PHI requires AES-256 + audit trail; S3 + KMS is the canonical HIPAA pattern. See [data.md](./data.md). |
| `PHI_ENCRYPTION_KEY=dev_only_change_me_phi_crypt_key` literal env var (line 52, 96) | **AWS KMS customer-managed key**, loaded per-request via KMS Decrypt with a small caching window | Honors `CLAUDE.md` rule: "PHI_ENCRYPTION_KEY never leaves secret storage." See [data.md](./data.md) + [secrets-and-iam.md](./secrets-and-iam.md). |
| `AUTH_SECRET`, `ANTHROPIC_API_KEY`, DB passwords sourced from host `.env` (line 53, 89, 90) | **AWS Secrets Manager**, rotation enabled on DB credentials | Same rule. See [secrets-and-iam.md](./secrets-and-iam.md). |
| `migrate`, `web`, `analysis-engine` Docker services with `service_completed_successfully` boot order (line 25-114) | **ECS Fargate**: one-shot `migrate` task + two long-running services (`web`, `analysis-engine`) behind one **ALB** with path-based routing (`/api/engine/*` → engine, default → web), private subnets | Fargate is the lowest-ops Container option; ALB gives BAA-covered TLS termination. See [compute.md](./compute.md). |
| TLS terminated by Aptible (removed in #222) | **ACM cert** on the ALB, DNS validation | Free, auto-renewed, in-region. See [compute.md](./compute.md). |
| `ANTHROPIC_API_KEY` + Anthropic direct API for LLM calls (line 53, 89) | **Bedrock InvokeModel** — pinned Claude Sonnet 4.5 snapshot ID. Anthropic key kept in Secrets Manager as fallback during cutover. | BAA-covered under the standard AWS BAA — no separate Anthropic Enterprise contract needed for PHI. Follow-up issue for the provider-agnostic LLM client refactor. |
| `audit_log` table rows (no shipping today) | Keep DB rows + ship to **CloudWatch Logs** group with retention enforced via SCP, ≥6 years | HIPAA log-retention requirement. See [observability.md](./observability.md). |
| No background jobs today | **EventBridge + ECS scheduled task** for the Phase 5 Drive watcher (see [docs/HISTORICAL-BATCH-INGEST-DESIGN.md](../../docs/HISTORICAL-BATCH-INGEST-DESIGN.md)) | Future state; called out so the network design has room for it. |
| GitHub Actions deploy (none today; #222 made CI validate-only) | **GitHub OIDC → IAM role**, no long-lived AWS keys in repo | Standard 2026 deployment pattern. See [secrets-and-iam.md](./secrets-and-iam.md). |

---

## Still-open decisions (not blocking, called out for review feedback)

These are the secondary decisions from #223. Recommendations are noted; surface objections in review.

- **Bedrock model identity** — **Recommendation: pin a specific snapshot ID** (e.g., `anthropic.claude-sonnet-4-5-20250929-v1:0`-style) rather than the alias. Reproducibility of clinical output matters more than auto-upgrades; alias-tracking creates silent prompt-behavior drift that a practitioner will notice before we do.
- **S3 layout** — **Recommendation: one bucket per environment, prefixed by tenant.** Per-env buckets enable distinct lifecycle/retention policies and per-env KMS CMKs; per-tenant prefixes inside a bucket keep tenant isolation legible in S3 access logs.
- **VPC endpoints** — **Recommendation: provision Gateway endpoints for S3 + DynamoDB and Interface endpoints for Bedrock, Secrets Manager, KMS, ECR, CloudWatch Logs.** Kills NAT egress costs on the hot paths (every Bedrock call, every S3 fetch, every secret load) and keeps traffic on the AWS backbone.
- **Cost ceiling** — **Recommendation: target $350/mo for MVP staging + prod combined.** Rough breakdown: RDS Multi-AZ `db.t4g.medium` ~$130, two Fargate services 0.5 vCPU/1 GB ~$30, ALB ~$25, NAT ~$35, KMS + Secrets + CloudWatch + ECR ~$30, Bedrock variable. If we cross this, we're either over-provisioned or growing — both worth noticing.

---

## Bring-up sequence

Each numbered step becomes its own GitHub issue. Steps are ordered by dependency. Steps within the same number can be parallelized.

1. **Terraform skeleton + remote state** — bootstrap S3 backend bucket + DynamoDB lock table (one-time, manual via Console or seed Terraform), then commit a Terraform root with provider config and module layout. Wire GitHub OIDC trust at the same time so subsequent steps can deploy from CI.
2. **Network** — VPC, 2 AZs (us-west-2a, us-west-2b), public/private-app/private-data subnet trios, NAT gateways, VPC endpoints, baseline security groups. See [network.md](./network.md).
3. **Data layer** — KMS CMKs first (RDS, S3-records, S3-exports, secrets, logs), then RDS Postgres 16 Multi-AZ instance with parameter group enabling `pgvector` + `pgcrypto`, then S3 buckets. See [data.md](./data.md).
4. **Secrets** — Secrets Manager entries with placeholder values + rotation Lambda for `rds-master` and `app-user-password`. KMS policy wiring. See [secrets-and-iam.md](./secrets-and-iam.md).
5. **ECR + image push** — ECR repos for `web`, `analysis-engine`, `migrate`. GitHub Actions workflow assuming the OIDC role to push tagged images on every merge to `main`.
6. **ECS cluster + services** — Fargate cluster, three task definitions (`migrate`, `web`, `analysis-engine`), two services behind one ALB with path-based routing, ACM cert attached to the HTTPS listener. The `migrate` task runs to completion before `web`/`analysis-engine` services deploy, mirroring the `service_completed_successfully` pattern in [docker-compose.yml](../../docker-compose.yml). See [compute.md](./compute.md).
7. **Observability** — CloudWatch log groups (with retention enforced by SCP), metric filters, alarms, audit-log shipping. See [observability.md](./observability.md).
8. **Bedrock readiness** — request model access in us-west-2 for Claude Sonnet 4.5 (and any image/embedding models we plan to use), attach `bedrock:InvokeModel` to `ecsTaskRole-web` and `ecsTaskRole-engine`, write a no-PHI smoke test that invokes the model end-to-end from a Fargate task. The provider-agnostic LLM client refactor is a separate follow-up issue.

---

## Out of scope for this PR

Per #223:

- **Provisioning any actual AWS resources.** That happens in the per-step follow-up issues.
- **Multi-tenant patterns beyond what RLS already does.** Orthogonal.
- **Disaster recovery runbook.** Separate issue after AWS is up and we have something to fail over.
- **Real BAA execution with AWS.** Separate procurement task; this design doc just calls out that the BAA must be signed before any PHI lands in AWS.

## Related

- [#220](https://github.com/Clinical-Signal/clinical-signal-main/pull/220) — migration runner. Runs identically in an ECS one-shot task as it does locally.
- [#222](https://github.com/Clinical-Signal/clinical-signal-main/pull/222) — Aptible removed; CI is now PR-time validate only.
- Follow-up issue: "Provider-agnostic LLM client + Bedrock readiness" — separate issue.
