# Network — VPC, Subnets, Security Groups, VPC Endpoints

**Scope:** us-west-2, single VPC per environment (prod + staging are separate VPCs in separate AWS accounts ideally; in a single-account setup they are separate VPCs with non-overlapping CIDRs).

**Goal:** Private-by-default. Nothing in this app needs to be on a public IP except the ALB.

---

## VPC and AZ layout

- **VPC CIDR:** `10.20.0.0/16` (prod), `10.30.0.0/16` (staging). 16-bit netmask leaves ~65k addresses and makes it easy to peer or VPN later without renumbering.
- **AZs:** `us-west-2a` and `us-west-2b` from day one ([ADR 0003](./decisions/0003-multi-az.md)). The CIDR plan reserves space in `us-west-2c` so a third AZ can be added without re-IPing anything that already exists.

### Subnet plan (per environment)

Three tiers × two AZs = six subnets. Each tier is a `/20` (4,096 addresses) — plenty of headroom for ECS task IPs (each task takes one ENI in awsvpc mode).

| Tier | Purpose | us-west-2a | us-west-2b | us-west-2c (reserved) |
|---|---|---|---|---|
| `public` | ALB, NAT Gateways | `10.20.0.0/20` | `10.20.16.0/20` | `10.20.32.0/20` |
| `private-app` | ECS Fargate tasks (web, engine, migrate, future scheduled tasks) | `10.20.64.0/20` | `10.20.80.0/20` | `10.20.96.0/20` |
| `private-data` | RDS, future ElastiCache, future OpenSearch | `10.20.128.0/20` | `10.20.144.0/20` | `10.20.160.0/20` |

**Routing:**
- `public` subnets route `0.0.0.0/0` to an Internet Gateway. ALB lives here. NAT Gateways live here (one per AZ for HA — single-NAT is cheaper but defeats the Multi-AZ rationale).
- `private-app` subnets route `0.0.0.0/0` to the AZ-local NAT Gateway. ECS tasks pull from ECR and reach Bedrock via VPC endpoints (see below), so NAT egress is minimized but not zero (e.g., `sentence-transformers` model downloads on first boot still go through NAT unless we pre-bake into the image).
- `private-data` subnets have **no route to `0.0.0.0/0`**. RDS Multi-AZ failover is internal to the VPC. No outbound internet from the data tier.

---

## Security groups

Named SGs, least-privilege. Rules expressed as "allow X from Y on port/proto":

| SG | Inbound | Outbound |
|---|---|---|
| `alb-sg` | 443/tcp from `0.0.0.0/0`; 80/tcp from `0.0.0.0/0` (redirect-only listener) | All to `web-sg`, `engine-sg` on their app ports |
| `web-sg` (ECS web tasks) | 3000/tcp from `alb-sg` only | 5432/tcp to `rds-sg`; 8000/tcp to `engine-sg`; 443/tcp to `0.0.0.0/0` (Bedrock, S3, Secrets via VPC endpoints when available, NAT otherwise) |
| `engine-sg` (ECS engine tasks) | 8000/tcp from `alb-sg` and from `web-sg` | 5432/tcp to `rds-sg`; 443/tcp to `0.0.0.0/0` (same as web) |
| `migrate-sg` (one-shot ECS migrate task) | none | 5432/tcp to `rds-sg`; 443/tcp to `0.0.0.0/0` (ECR pull, Secrets Manager) |
| `rds-sg` | 5432/tcp from `web-sg`, `engine-sg`, `migrate-sg` only | none (default deny) |
| `vpce-sg` (Interface VPC endpoints) | 443/tcp from `web-sg`, `engine-sg`, `migrate-sg` | none |

**Explicit non-rules:**
- ALB has no rule to RDS. Database is never reachable from the public listener.
- No SG references `0.0.0.0/0` as a source except the ALB on 443/80.
- ECS tasks have no public IP (`assign_public_ip = false` in the service config).

---

## VPC endpoints

Provisioning these is not free (Interface endpoints are ~$7/mo each + data) but they eliminate NAT egress for the hot paths and keep PHI-adjacent traffic on the AWS backbone.

| Service | Endpoint type | Why |
|---|---|---|
| S3 | **Gateway** (free) | Every record upload, every PDF read, every export. Highest-volume egress saver. |
| DynamoDB | **Gateway** (free) | Terraform state locks. Marginal traffic but free, so we add it. |
| Bedrock Runtime (`bedrock-runtime.us-west-2.amazonaws.com`) | **Interface** | Every clinical analysis call. PHI-adjacent — keeping it off the public internet is a defense-in-depth win. |
| Secrets Manager | **Interface** | Loaded on cold start of every Fargate task. Frequent, latency-sensitive. |
| KMS | **Interface** | Every per-request Decrypt for PHI fields. Hot path. |
| ECR (api + dkr) | **Interface** (both endpoints needed) | Image pulls on task launch. Without this, every cold start hits NAT. |
| CloudWatch Logs | **Interface** | Every log line. High volume. |
| STS | **Interface** | Task role assumption. Frequent. |

ECS Exec, SSM, EC2 messages endpoints are nice-to-have if we want SSM session access to debug Fargate tasks; defer to a follow-up if not needed initially.

---

## DNS

- Private hosted zone `internal.clinical-signal.local` for service-to-service discovery (mostly redundant once we use ECS Service Connect or Cloud Map, but useful for RDS endpoint aliasing).
- Public hosted zone for the product domain lives in Route 53 (separate ADR if we choose to move DNS from an existing registrar).

---

## Things this design deliberately does not do (yet)

- **No Transit Gateway, no VPC peering.** Single-VPC-per-env is enough until we have a corporate network to integrate with.
- **No PrivateLink endpoints into the VPC from outside.** We are not exposing internal services to partners.
- **No IPv6.** AWS support is fine, but it doubles the SG and route-table review surface; not worth the cost for MVP.
- **No WAF in front of the ALB.** Captured as a follow-up issue. The auth layer + RLS handles the access-control case; WAF would add bot/abuse protection that is not the highest priority for a small practitioner-only product.
