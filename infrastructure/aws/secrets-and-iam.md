# Secrets and IAM — Secrets Manager, Task Roles, GitHub OIDC, KMS Policies

**Goal:** No long-lived AWS credentials anywhere in the repo or in a developer's `~/.aws/credentials` for production. Every machine identity (Fargate task, GitHub Actions job) gets a scoped IAM role via STS. Every secret value (DB passwords, API keys) lives in Secrets Manager, encrypted with a KMS CMK, and is injected at task launch.

---

## Secrets Manager

One secret per logical credential. Names follow `cs/<env>/<service-or-purpose>/<key>` for legibility in IAM policies (wildcard `cs/prod/web/*` etc.).

| Secret name | Holds | Consumers | Rotation |
|---|---|---|---|
| `cs/prod/rds/master` | RDS master username + password | `ecsTaskExecutionRole-migrate` (env injection), Secrets Manager rotation Lambda | Automatic, 90 days, via the AWS-managed `SecretsManagerRDSPostgreSQLRotationSingleUser` Lambda template |
| `cs/prod/rds/app-user` | `app_user` password (the NOSUPERUSER role from [database/migrations/0002_core_schema.sql](../../database/migrations/0002_core_schema.sql) line 178-179) | `ecsTaskExecutionRole-web`, `ecsTaskExecutionRole-engine` (env injection as part of `DATABASE_URL`), `ecsTaskExecutionRole-migrate` (so the migrate task can `ALTER ROLE app_user WITH PASSWORD` to keep RDS aligned with the secret) | Custom rotation Lambda that does the password change + `ALTER ROLE`. 90 days. |
| `cs/prod/web/auth-secret` | NextAuth `AUTH_SECRET` (the value at [docker-compose.yml](../../docker-compose.yml) line 90) | `ecsTaskExecutionRole-web` | Manual rotation; updating invalidates all existing sessions, which is the intended behavior on rotation |
| `cs/prod/anthropic/api-key` | Anthropic API key (kept as fallback during Bedrock cutover; eventually retired) | `ecsTaskExecutionRole-web`, `ecsTaskExecutionRole-engine` | Manual; coordinate with key issuance in the Anthropic console |
| `cs/prod/phi/data-key-wrapped` | The KMS-wrapped data key used as the per-request column-encryption key. **Plaintext key material never lives here** — only the ciphertext. The app calls `kms:Decrypt` to unwrap at runtime. See [data.md](./data.md#phi_encryption_key-migration-path). | `ecsTaskRole-web`, `ecsTaskRole-engine` | Rotate by re-wrapping a new data key under the CMK and bumping the version; the app picks up the new ciphertext on its next refresh tick |

**Encryption at rest:** every secret encrypts with `alias/cs-secrets-prod` (see [data.md](./data.md#kms--customer-managed-keys)), not the default AWS-managed `aws/secretsmanager` key. Customer-managed gives us a key policy we control and an audit trail for `kms:Decrypt` calls against the secrets key specifically.

**ECS env injection pattern:** task definitions use the `secrets` block (not `environment`), which causes ECS to call `secretsmanager:GetSecretValue` at task launch using the execution role and pipe the value into the container env. Plaintext secret values never appear in the task definition JSON or in CloudTrail outside of the GetSecretValue call.

---

## IAM roles

Two role categories per workload: **execution role** (used by ECS infra to launch the task — pulls the image, reads secrets for env injection, writes the container log stream) and **task role** (used by the application code inside the task — the AWS SDK in the app assumes this role).

### Execution roles

All three execution roles share the same base policy (`AmazonECSTaskExecutionRolePolicy` for ECR + Logs) plus a scoped `secretsmanager:GetSecretValue` on exactly the secrets that workload needs:

| Role | Secrets read |
|---|---|
| `ecsTaskExecutionRole-migrate` | `cs/prod/rds/master`, `cs/prod/rds/app-user` |
| `ecsTaskExecutionRole-web` | `cs/prod/rds/app-user`, `cs/prod/web/auth-secret`, `cs/prod/anthropic/api-key` |
| `ecsTaskExecutionRole-engine` | `cs/prod/rds/app-user`, `cs/prod/anthropic/api-key` |

Plus `kms:Decrypt` on `alias/cs-secrets-prod` (without which `GetSecretValue` fails on a CMK-encrypted secret).

### Task roles

Task roles are what the application uses at runtime. Scoped per service:

#### `ecsTaskRole-migrate`

- `rds-db:connect` for the RDS master DB user (so the IAM-auth path is available if we move off password-auth; password-auth via Secrets Manager is the default for now)
- Nothing else. The migrate task does not need S3, Bedrock, or KMS-Decrypt-on-PHI-key — it only runs SQL.

#### `ecsTaskRole-web`

- `bedrock:InvokeModel` on the specific pinned model ARN (no wildcards)
- `bedrock:InvokeModelWithResponseStream` on the same model ARN
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` scoped to `clinical-signal-records-prod` and `clinical-signal-exports-prod`
- `kms:Decrypt`, `kms:GenerateDataKey` on `alias/cs-s3-records-prod` and `alias/cs-s3-exports-prod` (needed for SSE-KMS reads/writes)
- `kms:Decrypt` on `alias/cs-phi-column-prod` (the column-encryption key)

#### `ecsTaskRole-engine`

- Same Bedrock permissions as `web`
- `s3:GetObject` on `clinical-signal-records-prod` (the engine reads uploads but does not write originals; it writes derived data back into the DB, not S3, in MVP)
- `kms:Decrypt` on `alias/cs-s3-records-prod`
- `kms:Decrypt` on `alias/cs-phi-column-prod`

**Trust policy** for all task roles: principal `ecs-tasks.amazonaws.com`. Standard.

---

## GitHub OIDC — `githubActionsDeployRole`

No long-lived AWS access keys in the repo, in GitHub Actions secrets, or in a developer's local environment. GitHub Actions assumes a role via OIDC.

**OIDC provider:** one per AWS account, URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.

**Role:** `githubActionsDeployRole` (one per environment account, or one role with branch-scoped conditions if we keep prod and staging in the same account during MVP).

**Trust policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:Clinical-Signal/clinical-signal-main:ref:refs/heads/main"
      }
    }
  }]
}
```

The `StringLike` on `sub` pins the federation to the `Clinical-Signal/clinical-signal-main` repo on the `main` branch only. PR branches do not get a deploy role; CI on PRs runs the validate workflow from [#222](https://github.com/Clinical-Signal/clinical-signal-main/pull/222) which does not need AWS credentials.

**Permissions:**

- `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` on the three ECR repos
- `ecs:UpdateService`, `ecs:RegisterTaskDefinition`, `ecs:DescribeServices`, `ecs:DescribeTasks` on the prod/staging ECS resources
- `ecs:RunTask` on the `cs-migrate` task definition (CI runs the migrate task as part of every deploy)
- `iam:PassRole` on the execution roles + task roles, scoped to the ECS service principal via the `iam:PassedToService` condition
- `logs:CreateLogStream`, `logs:PutLogEvents` on the deploy workflow's log group

No `*` actions, no `Resource: *`.

---

## KMS key policies

A KMS key policy is *additive to* IAM, not a substitute. For the most sensitive keys we constrain both. Order of operations: the principal calling KMS must be allowed by *both* its IAM policy and the key policy. This is the difference between "the engine task role has `kms:Decrypt`" and "the engine task role is allowed by the PHI key's key policy to use it."

### `alias/cs-phi-column-prod` — most restrictive

```text
Statement 1: Root account admin (standard — required to manage the key)
Statement 2: Allow ecsTaskRole-web and ecsTaskRole-engine to kms:Decrypt and kms:DescribeKey ONLY
Statement 3: Allow CloudTrail service principal to log key usage
```

No `kms:Encrypt` for the runtime task roles. New wrapped data keys are issued by an out-of-band rotation process (Lambda or a one-shot script) using a separate role with `kms:Encrypt`. The runtime path can only decrypt — even a fully compromised app cannot rewrap key material under a different envelope.

### Other CMKs (RDS, S3-records, S3-exports, secrets, logs)

Standard pattern: root admin + the AWS service principal that needs to use the key (e.g., `rds.us-west-2.amazonaws.com` for the RDS key) + the named task roles for the S3 keys. CloudTrail logging clause on all of them.

---

## What this design deliberately does not do (yet)

- **No IAM users at all.** Anywhere a human needs AWS access, they use SSO via Identity Center and assume a role. No `aws_access_key_id` lives anywhere.
- **No `AdministratorAccess` granted to any deploy role.** Even break-glass admin access is human-only via Identity Center.
- **No cross-account roles.** Single-account MVP. Splitting prod/staging across accounts is a follow-up.
- **No KMS grants.** Key policies + IAM cover the needed cases. Grants add an audit dimension that is not worth the complexity at this stage.
- **No Secrets Manager replication.** Single-region MVP; replication is a DR concern.
