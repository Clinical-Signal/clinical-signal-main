# Compute — ECS Fargate, ALB, ACM

**Goal:** Run the same three-service topology defined in [docker-compose.yml](../../docker-compose.yml) on AWS, with the same boot order, behind one ALB with path-based routing. Zero servers to patch.

---

## Cluster

- **One ECS cluster per environment** (`cs-prod`, `cs-staging`)
- **Capacity providers:** `FARGATE` only. **Fargate Spot disabled for production** — Spot interruptions during a clinical analysis call are not worth the savings. Spot is acceptable for `staging`.
- **Container Insights:** enabled (CloudWatch Container Insights). Costs a few dollars per cluster per month and gives per-task CPU/memory/network visibility that is otherwise painful to assemble.

---

## Task definitions

Three task definitions, one per service in [docker-compose.yml](../../docker-compose.yml). Image references point at the ECR repos populated by the GitHub Actions workflow.

### `cs-migrate` — one-shot migration runner

Direct ECS analog of the `migrate` Docker service ([docker-compose.yml](../../docker-compose.yml) lines 25-43).

| Setting | Value |
|---|---|
| Launch type | Fargate |
| CPU / Memory | 0.25 vCPU / 0.5 GB |
| Network mode | `awsvpc` |
| Subnets | `private-app` (both AZs) |
| Security group | `migrate-sg` |
| Assign public IP | false |
| Task role | `ecsTaskRole-migrate` (RDS connect as master, Secrets Manager read for `rds-master`) |
| Execution role | `ecsTaskExecutionRole-migrate` (ECR pull, CloudWatch Logs write, Secrets Manager read for env injection) |
| Command | `["node", "/app/scripts/migrate.mjs"]` — exact match for [docker-compose.yml](../../docker-compose.yml) line 36 |
| Env | `DATABASE_URL` injected from Secrets Manager (master credentials), `MIGRATIONS_DIR=/app/database-migrations` |
| Restart | Never (task is one-shot) |

**Bring-up sequencing in production:** the deployment pipeline runs this task to `STOPPED` with a success exit code *before* updating the `cs-web` and `cs-engine` services. This is the ALB-fronted equivalent of the local `service_completed_successfully` pattern at [docker-compose.yml](../../docker-compose.yml) lines 63-64 and 106-107.

### `cs-web` — Next.js application

| Setting | Value |
|---|---|
| Launch type | Fargate |
| CPU / Memory | 0.5 vCPU / 1 GB |
| Desired count | 2 (one per AZ minimum for Multi-AZ) |
| Subnets | `private-app` (both AZs) |
| Security group | `web-sg` |
| Container port | 3000 |
| Task role | `ecsTaskRole-web` |
| Execution role | `ecsTaskExecutionRole-web` |
| Env injection (from Secrets Manager) | `DATABASE_URL` (as `app_user`), `AUTH_SECRET`, `ANTHROPIC_API_KEY` (kept as fallback during Bedrock cutover) |
| Env (plain) | `NODE_ENV=production`, `ANALYSIS_ENGINE_URL=http://cs-engine.cs.local:8000` (Service Connect / Cloud Map), `SESSION_IDLE_MINUTES=15`, `DEFAULT_TENANT_ID=...`, `UPLOADS_DIR=/uploads` (kept until the S3 client refactor lands), `ENGINE_UPLOADS_DIR=...` |
| Health check | `curl -fsS http://localhost:3000/api/health || exit 1` every 30s, 5s timeout, 3 retries, 60s start period. **Follow-up issue: `/api/health` does not exist today** — needs a minimal handler that returns 200 + DB ping. |
| Logging | `awslogs` driver, log group `/cs/prod/web`, retention 30 days |
| Stop timeout | 30s (lets in-flight requests drain when ALB takes a task out of service) |

Mirrors [docker-compose.yml](../../docker-compose.yml) lines 77-114.

### `cs-engine` — Python analysis engine

| Setting | Value |
|---|---|
| Launch type | Fargate |
| CPU / Memory | 1 vCPU / 2 GB (PDF processing + sentence-transformers model in memory; engine carries the heavier workload) |
| Desired count | 2 |
| Subnets | `private-app` (both AZs) |
| Security group | `engine-sg` |
| Container port | 8000 |
| Task role | `ecsTaskRole-engine` |
| Execution role | `ecsTaskExecutionRole-engine` |
| Env injection (from Secrets Manager) | `DATABASE_URL` (as `app_user`), `ANTHROPIC_API_KEY`, `PHI_ENCRYPTION_KEY_KMS_ALIAS=alias/cs-phi-column-prod` (the engine fetches via KMS Decrypt — see [data.md](./data.md#phi_encryption_key-migration-path)) |
| Env (plain) | `ANTHROPIC_MODEL=anthropic.claude-sonnet-4-5-<pinned-snapshot>`, `USE_KNOWLEDGE_BASE=1`, `SENTENCE_TRANSFORMERS_HOME=/models` |
| Health check | `curl -fsS http://localhost:8000/health || exit 1` — the endpoint exists today at [services/analysis-engine/app/main.py](../../services/analysis-engine/app/main.py) line 41-43 |
| Logging | `awslogs`, `/cs/prod/engine`, retention 30 days |
| Ephemeral storage | 30 GB (sentence-transformers model cache + transient PDF processing) |

Mirrors [docker-compose.yml](../../docker-compose.yml) lines 45-75.

**Note on the `uploads` Docker volume sharing between `web` and `engine`** ([docker-compose.yml](../../docker-compose.yml) lines 75 and 114): the local shared filesystem disappears on ECS. The cutover replaces it with the records S3 bucket — `web` writes to S3 via presigned PUT, then passes the S3 key to `engine` (not a filesystem path). This is a small application-layer change tracked as a follow-up issue, separate from the AWS infra work.

---

## ALB — Application Load Balancer

One ALB per environment, dual-stack (IPv4/IPv6 to be decided per ADR; default IPv4-only for MVP).

| Setting | Value |
|---|---|
| Scheme | internet-facing |
| Subnets | `public` (both AZs) |
| Security group | `alb-sg` (443 from `0.0.0.0/0`, 80 from `0.0.0.0/0` redirect-only) |
| Listeners | **80**: `redirect 80 → 443`. **443**: default action forward to the web target group; rule for `/api/engine/*` forwards to the engine target group |
| TLS policy | `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.2 minimum per `CLAUDE.md`; 1.3 preferred) |
| Certificate | ACM cert in us-west-2 (see below) |
| Access logs | enabled, written to `clinical-signal-access-logs/alb/` |
| Idle timeout | 60s (default; bump only if a long-running analysis route exceeds it) |
| Deletion protection | on |

### Path-based routing

Single ALB, two target groups, rules ordered by specificity:

| Priority | Match | Action |
|---|---|---|
| 10 | path-pattern `/api/engine/*` | forward to `tg-engine` |
| (default) | everything else | forward to `tg-web` |

This is the AWS analog of the localhost split today where `web` calls `analysis-engine` over the internal Docker network at `http://analysis-engine:8000`. The ALB exposes a single hostname; the `web` ↔ `engine` internal traffic flows over ECS Service Connect inside the private subnets and does **not** go through the ALB, which keeps that hop off the public path entirely.

### Target groups

| Target group | Protocol/port | Health check |
|---|---|---|
| `tg-web` | HTTP/3000 | GET `/api/health`, 200 expected, 30s interval, 5s timeout, 2 healthy / 2 unhealthy thresholds, 60s deregistration delay |
| `tg-engine` | HTTP/8000 | GET `/health`, 200 expected, same thresholds |

Targets are registered automatically by the ECS service.

---

## ACM certificates

- One ACM cert per environment in `us-west-2`, covering the product hostname(s) (e.g., `app.clinical-signal.example`, `staging.clinical-signal.example`).
- DNS-validated via Route 53.
- Auto-renewal handled by ACM as long as the validation records stay in place.
- If we add CloudFront later for static asset delivery, that needs a **separate cert in `us-east-1`** — ACM CloudFront certs are us-east-1-only. Not needed for MVP.

---

## Deployment strategy

**Default:** ECS rolling deploys, `minimumHealthyPercent=100`, `maximumPercent=200`. The deployer brings up new tasks alongside old ones, drains the old, then removes them. No downtime, no extra infra.

**Optional upgrade:** ECS deployments via CodeDeploy in **blue/green** mode, with the ALB as the traffic shifter. Better rollback story (the old task set sticks around for a configurable bake time), but adds CodeDeploy app/deployment group resources to manage in Terraform. **Recommendation: start with rolling, switch to blue/green when the first incident demonstrates we need a faster rollback than `aws ecs update-service` provides.**

---

## Things this design deliberately does not do (yet)

- **No auto-scaling policies.** With desired count = 2 and burstable Fargate we have enough headroom for MVP. Add target-tracking on CPU once we have a load profile worth fitting to.
- **No App Runner.** App Runner is appealingly simple but lacks the IAM, VPC, and SG control we need for a HIPAA topology with a private RDS in `private-data` subnets.
- **No Lambda for the engine.** Cold starts on a service that loads sentence-transformers (~500 MB resident) would dominate latency.
- **No Step Functions yet.** The future scheduled Drive watcher (EventBridge → ECS task) is single-step. Add Step Functions when we have a real multi-step workflow worth orchestrating.
