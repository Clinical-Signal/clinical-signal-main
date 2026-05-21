# AWS Bring-Up — Engineer Handoff & PRD

**Audience:** the DevOps engineer who will provision Clinical Signal's first hosted environment on AWS.

**Status:** ready to start. All design decisions are locked. No AWS resources exist yet.

**Estimated effort:** ~3-5 working days for a single engineer with AWS + Terraform fluency, assuming the AWS account is already provisioned and the BAA conversation with AWS is in motion in parallel.

---

## 1. TL;DR

Clinical Signal is a clinical web app (Next.js + Python FastAPI + Postgres) that handles Protected Health Information (PHI). It used to deploy on Aptible. Aptible was retired in [#222](https://github.com/Clinical-Signal/clinical-signal-main/pull/222) and there is currently **no hosted environment** — everyone develops locally via `docker compose up`.

Your job: stand up the AWS environment per the design documents in this directory so the app is reachable at a TLS-terminated URL with real RDS, S3, KMS, Secrets Manager, and ECS Fargate behind it. Once you're done, every PR that merges to `main` should auto-deploy.

The design decisions (region, IaC tool, Multi-AZ posture) are already locked in three ADRs — you do **not** need to re-litigate them. Read them so you know the constraints; then build.

**Start here:**
1. Read [PLAN.md](./PLAN.md) — 10 minutes
2. Read the three ADRs in [decisions/](./decisions/) — 10 minutes
3. Skim the topic docs ([network.md](./network.md), [data.md](./data.md), [compute.md](./compute.md), [secrets-and-iam.md](./secrets-and-iam.md), [observability.md](./observability.md)) — 30 minutes
4. Read [CLAUDE.md](../../CLAUDE.md) — 10 minutes. This is the security contract you are building toward.
5. Then come back here for the actual delivery plan.

---

## 2. Context you need before touching anything

### 2.1 What the product is

Clinical Signal turns patient lab PDFs into a clinical protocol and a phased patient-facing action plan. The user is a functional health practitioner managing 5-15 active clients. The product is in MVP; it has not gone live with PHI yet, and **must not** until AWS is up and the BAA is signed.

Full product context: [CLAUDE.md](../../CLAUDE.md), [ARCHITECTURE.md](../../ARCHITECTURE.md).

### 2.2 What the codebase looks like

| Service | Tech | Location | Purpose |
|---|---|---|---|
| `web` | Next.js 14+ (TypeScript, App Router), Node.js | [apps/web/](../../apps/web/) | Practitioner UI, auth (NextAuth), API routes, CRUD, file uploads, calls Claude directly for prep brief / clinical analysis / protocol generation |
| `analysis-engine` | Python 3 + FastAPI | [services/analysis-engine/](../../services/analysis-engine/) | PDF/image OCR, lab data structuring, knowledge base, calls Claude for extraction |
| `migrate` | Node.js script | [apps/web/scripts/migrate.mjs](../../apps/web/scripts/migrate.mjs) | One-shot SQL migration runner; uses `schema_migrations` bookkeeping; landed in [#220](https://github.com/Clinical-Signal/clinical-signal-main/pull/220) |
| `postgres` | `pgvector/pgvector:pg16` image | (container) | Stores all structured data. Requires `pgvector` and `pgcrypto` extensions. |

The canonical local topology is [docker-compose.yml](../../docker-compose.yml). Your ECS task definitions must match its env vars and boot ordering precisely — this is what new local clones run against, so any divergence is a footgun.

### 2.3 What ran on Aptible (and why it's gone)

Aptible provided a managed PaaS with HIPAA-eligible Postgres, Redis, S3-equivalent object storage, TLS termination, and a `before_release` hook for migrations. It was retired because (a) `aptible-cli` had an unfixable encoding bug that made the deploy workflow red on every push, and (b) the cost trajectory at scale didn't match where the product was heading. See [#222](https://github.com/Clinical-Signal/clinical-signal-main/pull/222) for the full removal PR.

`.aptible.yml` and `.github/workflows/aptible.yml` are already gone. There is no zombie config to clean up. The PR-time `validate.yml` workflow is the only CI today — it runs typecheck + vitest + python compile + migration-filename hygiene on every PR.

### 2.4 What's locked in (do not re-litigate)

| Decision | Locked to | ADR |
|---|---|---|
| AWS region | **us-west-2** | [0001-region.md](./decisions/0001-region.md) |
| IaC tool | **Terraform** (HCL, remote state in S3 + DynamoDB lock) | [0002-iac-tool.md](./decisions/0002-iac-tool.md) |
| Availability | **Multi-AZ from day one** | [0003-multi-az.md](./decisions/0003-multi-az.md) |
| LLM provider on AWS | **Bedrock** (replaces direct Anthropic API; pin a specific Claude Sonnet 4.5 snapshot ID, do not use alias) | [PLAN.md](./PLAN.md) |
| Auth | **GitHub OIDC** for CI; **AWS Identity Center / SSO** for humans. No IAM users, no long-lived keys. | [secrets-and-iam.md](./secrets-and-iam.md) |

If any of these need to change, raise it before you start; do not silently deviate.

### 2.5 What's still open (your call, with recommendations)

These are flagged in [PLAN.md](./PLAN.md#still-open-decisions-not-blocking-called-out-for-review-feedback). Treat the recommendations as the default; surface objections in PR review.

- **Bedrock model identity** — recommended: pin snapshot ID, not alias
- **S3 layout** — recommended: one bucket per environment with tenant prefixes
- **VPC endpoints** — recommended: S3 + DynamoDB Gateway, Bedrock + Secrets + KMS + ECR + Logs + STS Interface
- **Cost ceiling** — target ~$350/mo for staging + prod combined; flag in PR if a step crosses this

---

## 3. Hard requirements (must satisfy or stop and ask)

These come from [CLAUDE.md](../../CLAUDE.md). They are not flexible.

### 3.1 PHI handling

- AES-256 encryption at rest for all data containing PHI (RDS storage, S3 buckets, EBS volumes, Secrets Manager secrets)
- TLS 1.2+ for all data in transit; TLS 1.3 preferred
- No PHI in application logs, error messages, browser-side storage, or any system outside production
- `PHI_ENCRYPTION_KEY` (today a dev literal at [docker-compose.yml](../../docker-compose.yml) line 52 + 96) must never leave secret storage in production. The migration path is documented in [data.md](./data.md#phi_encryption_key-migration-path).

### 3.2 AWS BAA

**The AWS Business Associate Agreement must be signed before any PHI is permitted to land in any AWS service.** Until then, only synthetic data, only in staging-equivalent environments.

This is a separate procurement task that you do not own, but you do own the build sequence:
- Provision everything (steps 1-7 in §5) with no real PHI.
- Smoke test with synthetic data.
- Block on the BAA before cutting practitioners over.

If you are asked to put real PHI in before the BAA is signed, say no.

### 3.3 Tenant isolation

Postgres Row-Level Security is the defense-in-depth backbone. The application connects as `app_user` (`NOSUPERUSER NOINHERIT`), created by [database/migrations/0002_core_schema.sql](../../database/migrations/0002_core_schema.sql) lines 173-201. RLS policies only fire when the connecting role is non-superuser, so:

- The `migrate` task connects as the RDS master.
- The `web` and `analysis-engine` tasks connect as `app_user` — **non-negotiable**. If they ever connect as master, RLS bypasses silently and tenant isolation is gone.
- Set up the [observability.md](./observability.md) alarm for RLS policy violations from day one. An RLS violation = pages on-call immediately.

### 3.4 Audit log retention

The `audit_log` PostgreSQL table is append-only and is the source of truth. Ship a CloudWatch mirror to `/cs/prod/audit/*` with **6-year retention enforced by SCP, not just by log group policy.** The application role must not be able to delete or shorten retention even with full IAM access. See [observability.md](./observability.md#audit-log-shipping).

### 3.5 Secrets

No secret values in the repo, in environment files committed to git, in CI variables, in CloudFormation/Terraform outputs, in CloudWatch logs. The pattern is:

- Value lives in Secrets Manager, encrypted with a customer-managed KMS CMK (`alias/cs-secrets-prod`).
- ECS task definition's `secrets` block references the secret ARN.
- ECS execution role has scoped `secretsmanager:GetSecretValue` + `kms:Decrypt`.
- The value appears in the container's env at task launch; it never appears in the task definition JSON, in CloudTrail outside the GetSecretValue call, or in any log.

---

## 4. Inputs you have / inputs you need

### 4.1 Already in the repo (read-only inputs)

- Design docs in this directory ([PLAN.md](./PLAN.md), [network.md](./network.md), [data.md](./data.md), [compute.md](./compute.md), [secrets-and-iam.md](./secrets-and-iam.md), [observability.md](./observability.md), three ADRs)
- Application code in [apps/web/](../../apps/web/) and [services/analysis-engine/](../../services/analysis-engine/)
- Database migrations in [database/migrations/](../../database/migrations/) (numbered, applied in order by the runner)
- Migration runner: [apps/web/scripts/migrate.mjs](../../apps/web/scripts/migrate.mjs)
- Existing Dockerfiles: [infrastructure/docker/Dockerfile.web](../docker/Dockerfile.web), [infrastructure/docker/Dockerfile.engine](../docker/Dockerfile.engine). These are the images you'll push to ECR. Don't rewrite them.
- Source-of-truth local topology: [docker-compose.yml](../../docker-compose.yml)
- Security contract: [CLAUDE.md](../../CLAUDE.md)

### 4.2 Things you need that you should ask for (these are not your responsibility to create)

- **AWS account** with billing set up and an admin user available via Identity Center to onboard you. If we're using a single account for prod + staging at MVP, fine; if separate accounts via AWS Organizations, you'll set up the OU layout.
- **Domain name** for the production hostname (e.g., `app.clinical-signal.example`) and DNS access. Route 53 hosted zone preferred; if DNS is at an external registrar, get the zone delegated to Route 53 or get write access for ACM validation records.
- **AWS BAA** status. You need to know whether it's been signed (so you can use prod for real PHI) or still pending (so you can only stand up infra with synthetic data).
- **Bedrock model access** request. This is a one-click form in the AWS Console per region per model — you can submit it yourself once you have account access. Approval is typically same-day for Claude Sonnet 4.x in us-west-2 for HIPAA-eligible accounts.
- **Production environment names** if different from `prod` / `staging`.
- **On-call destination** for the alarm SNS topic — an email address now, PagerDuty or Slack webhook later.

---

## 5. What you're being asked to deliver

Eight bring-up steps, in order. Each step should be its own GitHub issue, its own branch, its own PR. Small, sequential, auditable.

### Step 1 — Terraform skeleton + remote state + GitHub OIDC trust

**Deliverable:** a working Terraform repo layout under `infrastructure/aws/terraform/`, a state backend that survives team turnover, and a CI role that can apply changes without long-lived credentials.

**Concrete tasks:**
- Bootstrap (one-time, manual): create the state S3 bucket (`clinical-signal-terraform-state`, versioning + SSE-KMS + block-public-access) and the DynamoDB lock table (`clinical-signal-terraform-locks`, PK `LockID`). This part is OK to do via a small seed Terraform run from your laptop with SSO admin creds — it's a chicken-and-egg moment.
- Commit the seed Terraform that produces them, so the bootstrap is reproducible if we ever rebuild the account.
- Set up the GitHub OIDC provider in AWS (`token.actions.githubusercontent.com`).
- Create `githubActionsDeployRole` with the trust policy from [secrets-and-iam.md](./secrets-and-iam.md#github-oidc--githubactionsdeployrole), scoped to `repo:Clinical-Signal/clinical-signal-main:ref:refs/heads/main` only.
- Wire a GitHub Actions workflow that assumes the role and runs `terraform plan` on PRs (comment the plan on the PR), `terraform apply` on merges to `main`.
- Add `tfsec` and `tflint` to the PR-time checks.

**Acceptance:**
- A trivial Terraform PR (e.g., adding an empty CloudWatch log group) produces a `terraform plan` comment on the PR via OIDC and applies after merge.
- The state bucket has versioning + SSE-KMS + block-public-access verified.
- No AWS access keys exist anywhere in the GitHub repo, in GitHub Actions secrets, or in any developer's machine.

### Step 2 — Network

**Deliverable:** the VPC layout described in [network.md](./network.md).

**Concrete tasks:**
- One VPC per environment (`10.20.0.0/16` for prod, `10.30.0.0/16` for staging).
- 2 AZs (us-west-2a, us-west-2b), three subnet tiers per AZ (public, private-app, private-data) per the table in [network.md](./network.md#subnet-plan-per-environment).
- Internet Gateway on public; NAT Gateway per AZ; route tables wired.
- VPC endpoints: S3 (Gateway), DynamoDB (Gateway), Bedrock Runtime, Secrets Manager, KMS, ECR (both `api` + `dkr`), CloudWatch Logs, STS (all Interface).
- Baseline security groups: `alb-sg`, `web-sg`, `engine-sg`, `migrate-sg`, `rds-sg`, `vpce-sg` — with the exact rule matrix in [network.md](./network.md#security-groups). **No `0.0.0.0/0` source on any SG except `alb-sg` on 80/443.**
- VPC flow logs (REJECT) shipping to a CloudWatch log group.

**Acceptance:**
- A throwaway EC2 instance launched in `private-app` can reach S3 and Bedrock via the VPC endpoints (verifiable via VPC flow logs showing no NAT traversal).
- A throwaway instance in `private-data` cannot reach the internet (no route).
- SG rules pass `tfsec` checks.

### Step 3 — Data layer

**Deliverable:** RDS Multi-AZ, S3 buckets, KMS CMKs as described in [data.md](./data.md).

**Concrete tasks:**
- Five customer-managed KMS keys with the aliases in [data.md](./data.md#kms--customer-managed-keys): `cs-rds-prod`, `cs-s3-records-prod`, `cs-s3-exports-prod`, `cs-secrets-prod`, `cs-logs-prod`, plus `cs-phi-column-prod` for the per-request PHI column key.
- RDS Postgres 16, `db.t4g.medium`, Multi-AZ, encrypted with `cs-rds-prod`, 35-day backups, PITR, deletion protection on. Custom parameter group enabling `shared_preload_libraries=pg_stat_statements` and allowing the `pgvector` and `pgcrypto` extensions.
- The migrate task creates the extensions on first run (already in the existing migrations) and creates `app_user` (also already in [database/migrations/0002_core_schema.sql](../../database/migrations/0002_core_schema.sql) line 173-201).
- S3 buckets: `clinical-signal-records-prod`, `clinical-signal-exports-prod`, plus the access logs bucket. All with SSE-KMS (their own per-bucket CMK), block-public-access (all four toggles), versioning, the records bucket with Object Lock in governance mode (7-year minimum retention).
- Bucket policies that deny non-TLS requests and deny requests without the expected KMS key.

**Acceptance:**
- The migrate task can connect to RDS as master, create extensions, run all migrations end-to-end, and exit 0.
- After the migrate task runs, connecting as `app_user` and trying to SELECT a row from `patients` without setting `app.current_tenant_id` returns zero rows (RLS working).
- An attempt to PUT an object to the records bucket over HTTP (not HTTPS) is denied.
- An attempt to PUT with the wrong KMS key is denied.
- RDS Multi-AZ failover (`aws rds reboot-db-instance --force-failover`) completes and the connection from a Fargate task recovers within 120s.

### Step 4 — Secrets

**Deliverable:** Secrets Manager entries with rotation, plus the KMS policy wiring.

**Concrete tasks:**
- Create the five secrets listed in [secrets-and-iam.md](./secrets-and-iam.md#secrets-manager) with placeholder values, encrypted with `cs-secrets-prod`.
- Wire automatic 90-day rotation on `cs/prod/rds/master` using the AWS-managed `SecretsManagerRDSPostgreSQLRotationSingleUser` Lambda template.
- Custom rotation Lambda for `cs/prod/rds/app-user` that updates the secret + runs `ALTER ROLE app_user WITH PASSWORD :new` against RDS.
- KMS key policies match the patterns in [secrets-and-iam.md](./secrets-and-iam.md#kms-key-policies) — `cs-phi-column-prod` allows runtime task roles **Decrypt only**, never Encrypt.

**Acceptance:**
- A scripted rotation of `cs/prod/rds/app-user` updates the secret, ALTERs the role in RDS, and a freshly-launched `web` task connects successfully without manual intervention.
- The runtime task role cannot call `kms:Encrypt` against `cs-phi-column-prod` (verifiable via a denied test call).

### Step 5 — ECR + image push from GitHub Actions

**Deliverable:** three ECR repositories with images pushed on every merge to `main`.

**Concrete tasks:**
- ECR repos `cs-web`, `cs-engine`, `cs-migrate`. Lifecycle policies: keep last 30 images per repo, expire untagged images after 7 days. Scan-on-push enabled.
- GitHub Actions workflow that, on push to `main`, builds each image from the existing Dockerfiles, tags with the commit SHA and `latest`, and pushes via the OIDC role from Step 1.
- The build uses `docker buildx` with the GitHub Actions cache backend so subsequent builds are fast.

**Acceptance:**
- A merge to `main` produces three new images in ECR, tagged with the commit SHA, scanned, no critical findings.
- ECR lifecycle prunes correctly (verifiable after a few builds).

### Step 6 — ECS cluster + services + ALB + ACM

**Deliverable:** the topology in [compute.md](./compute.md). Two long-running services (`cs-web`, `cs-engine`) behind one ALB with path-based routing, plus the one-shot `cs-migrate` task wired into deploys.

**Concrete tasks:**
- ECS cluster `cs-prod` with Container Insights on; Fargate-only capacity provider; Spot disabled in prod.
- Three task definitions matching the spec tables in [compute.md](./compute.md) — env vars including `secrets` block references to Secrets Manager, task roles per [secrets-and-iam.md](./secrets-and-iam.md#task-roles).
- Two services (`cs-web` desired=2, `cs-engine` desired=2), spread across AZs, no public IPs.
- ALB in public subnets, HTTPS-only listener with ACM cert, rule for `/api/engine/*` → engine target group, default → web target group. HTTP redirect to HTTPS.
- ACM cert in us-west-2, DNS-validated via Route 53.
- ECS Service Connect or Cloud Map for internal `web` → `engine` discovery (so the `ANALYSIS_ENGINE_URL` env var resolves inside the VPC, not through the ALB).
- Deploy pipeline: GitHub Actions on merge to `main` runs `cs-migrate` to `STOPPED` exit-0 first, then updates the two services. Mirrors the `service_completed_successfully` boot ordering from [docker-compose.yml](../../docker-compose.yml) lines 63-64 and 106-107.
- Rolling deploys with `minimumHealthyPercent=100` and `maximumPercent=200`.

**Acceptance:**
- Hit the ALB hostname over HTTPS, get the Next.js sign-in page, sign up a synthetic practitioner, sign in, see the dashboard.
- Upload a synthetic patient PDF; the `web` service writes to the records S3 bucket; the `analysis-engine` service reads it back and runs the extraction pipeline.
- Generate a protocol end-to-end (this exercises Bedrock — gated on Step 8 below).
- A bad deploy (e.g., a task definition that fails health checks) does not take the service down; ECS keeps the old tasks running until the new ones are healthy.

### Step 7 — Observability

**Deliverable:** [observability.md](./observability.md) implemented end-to-end.

**Concrete tasks:**
- All log groups per the table in [observability.md](./observability.md#cloudwatch-log-groups), encrypted with `cs-logs-prod`, retention per the table.
- SCP on the account that denies `logs:DeleteLogGroup` and `logs:PutRetentionPolicy` on `/cs/prod/audit/*`. (If this is a single-account MVP without an Organization, set up an Organization first or document why the SCP is deferred.)
- Metric filters per the table.
- Alarms wired to SNS topic `cs-prod-alerts`, subscribed to the on-call destination provided by the team.
- CloudWatch dashboard per the spec.
- VPC flow logs (already from Step 2), ALB access logs (S3 + Logs subscription), RDS Postgres logs.

**Acceptance:**
- Force an RLS violation in staging (run a query that should be denied), confirm the `RlsViolation` metric increments and the alarm fires.
- Force a 5xx from the web service (kill an upstream dep temporarily), confirm the alarm fires.
- Confirm the SCP genuinely blocks the application role from deleting an audit log group (attempt and verify the deny).
- All audit-log events from the application show up in `/cs/prod/audit/*` within 5 seconds of the corresponding DB row appearing.

### Step 8 — Bedrock readiness

**Deliverable:** Claude inference works from Fargate, with the right IAM, against the right pinned model, with PHI-safe smoke-testing.

**Concrete tasks:**
- Request Bedrock model access for the chosen Claude Sonnet 4.5 snapshot in us-west-2 via the AWS Console.
- Attach `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` to `ecsTaskRole-web` and `ecsTaskRole-engine`, scoped to the specific model ARN (no wildcards).
- Write a no-PHI smoke test that runs as a one-shot ECS task: invoke the model with a synthetic prompt, log the response shape, exit 0.
- The application code still uses the direct Anthropic API today (`ANTHROPIC_API_KEY`). The provider-agnostic LLM client refactor (so the app can target Bedrock) is a **separate follow-up issue** — not your responsibility. Your responsibility is that the IAM, network path, and model access are in place so when the refactor lands, it works.

**Acceptance:**
- The smoke-test ECS task succeeds with a Claude response.
- VPC flow logs confirm the Bedrock traffic goes through the Interface endpoint, not through NAT.

---

## 6. Working agreements

### 6.1 One step = one PR

Each of the eight steps above is its own GitHub issue and its own PR. No "step 2 + step 3 in one PR" — they need to be independently reviewable and revertable.

### 6.2 Terraform-first, no clickops

Every resource lives in `infrastructure/aws/terraform/`. If you find yourself making a change in the AWS Console, stop. Add it to Terraform and apply through the pipeline. The only manual operation allowed is the one-time state-backend bootstrap in Step 1.

If you make an emergency Console change to put out a fire, file a ticket immediately to reconcile it back into Terraform.

### 6.3 Plan output in PR

Every `infrastructure/aws/terraform/` PR has the `terraform plan` output posted as a CI comment. Reviewers look at the plan, not just the HCL diff.

### 6.4 Staging first, prod second

Stand up `staging` (synthetic data only) before `prod`. Run the smoke tests against staging. Then mirror the apply to prod.

### 6.5 Synthetic data only until the BAA is signed

There is a seed script for synthetic patients in [database/seed/](../../database/seed/). Use it. Do not use practitioner-provided real PHI for testing under any circumstances.

### 6.6 Security PRs get extra eyes

Anything that touches IAM policies, KMS key policies, security group rules, S3 bucket policies, or the SCP needs two reviewers. Solo-merge is fine for everything else.

### 6.7 Cost ceiling tripwire

Target ~$350/mo for staging + prod combined. If a Terraform plan crosses this, call it out in the PR description. Not a hard block — but a "let's discuss" signal.

---

## 7. Done means

You're done with this engagement when:

- [ ] All eight steps are merged.
- [ ] The production hostname serves the Next.js app over HTTPS with the ACM cert.
- [ ] A synthetic practitioner can sign up, upload a synthetic patient PDF, run extraction, generate a protocol, and export it as a PDF — entirely through the AWS-hosted environment.
- [ ] Multi-AZ failover (`aws rds reboot-db-instance --force-failover`) succeeds and the app recovers in under 120s.
- [ ] All alarms in [observability.md](./observability.md) are wired and the on-call destination is receiving test alerts.
- [ ] A practitioner-style end-to-end smoke test (sign in → upload → analyze → protocol → export) passes against staging on the latest commit of `main`.
- [ ] You've handed off:
  - The bootstrap runbook (state backend setup) so a future engineer can rebuild the account if needed.
  - The runbook for rotating RDS credentials and the PHI column key.
  - The runbook for responding to each alarm (one paragraph per alarm: what it means, what to check first, what to escalate).
  - The cost-actuals dashboard for the first month, with a note on what to watch for as load grows.
- [ ] The repo `README.md` is updated to reference the AWS environment in the deployment-status section (currently says "AWS migration pending" — update it).

---

## 8. Explicitly out of scope (do not do these without a separate ticket)

- **Disaster recovery runbook beyond Multi-AZ failover.** Cross-region DR is a separate project.
- **WAF in front of the ALB.** Useful, but not required for MVP. Separate ticket.
- **Auto-scaling policies.** `desiredCount=2` is enough for MVP; add target-tracking once we have a real load profile.
- **CloudFront in front of the app.** Static asset delivery via Next.js is fine for MVP.
- **Real Anthropic-to-Bedrock cutover in the application code.** That's the provider-agnostic LLM client refactor, a separate follow-up issue. You make Bedrock *reachable and authorized*; the app team makes it *used*.
- **Multi-tenant scaling beyond RLS.** RLS is the design. If we need physical isolation per tenant in the future, that's a much larger project.
- **Practice management features** (scheduling, billing, payments). Out of MVP entirely.
- **Patient portal / patient login.** Out of MVP entirely.

---

## 9. How to reach the rest of the team

- **Product / clinical questions:** repo owner (the one who merged the design docs)
- **Application code questions:** open an issue, tag the relevant code area, repo owner will route
- **Security review:** route through the repo owner; expect 1 business day turnaround on IAM/KMS/SG changes
- **AWS account / billing / BAA:** repo owner (these are organizational, not engineering)

---

## 10. Appendix — file index

| File | Purpose |
|---|---|
| [PLAN.md](./PLAN.md) | Target architecture, mapping table, bring-up sequence (high level) |
| [network.md](./network.md) | VPC, subnets, security groups, VPC endpoints |
| [data.md](./data.md) | RDS, S3, KMS, PHI-key migration path |
| [compute.md](./compute.md) | ECS Fargate, ALB, ACM, task definitions |
| [secrets-and-iam.md](./secrets-and-iam.md) | Secrets Manager, task roles, GitHub OIDC, KMS policies |
| [observability.md](./observability.md) | CloudWatch logs, metric filters, alarms, audit retention |
| [decisions/0001-region.md](./decisions/0001-region.md) | ADR — us-west-2 |
| [decisions/0002-iac-tool.md](./decisions/0002-iac-tool.md) | ADR — Terraform |
| [decisions/0003-multi-az.md](./decisions/0003-multi-az.md) | ADR — Multi-AZ from day one |
| [../../CLAUDE.md](../../CLAUDE.md) | Security and HIPAA contract |
| [../../ARCHITECTURE.md](../../ARCHITECTURE.md) | Application architecture |
| [../../docker-compose.yml](../../docker-compose.yml) | Source-of-truth local topology your ECS task defs must mirror |

Welcome aboard. Read the docs, ask questions early, ship one step at a time.
