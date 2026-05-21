# Observability — CloudWatch Logs, Metric Filters, Alarms

**Goal:** Audit logs satisfy HIPAA retention. Application logs are short-lived. Alarms catch the failure modes we can predict (5xx storms, RDS exhaustion, RLS policy violations). No PHI is ever written to any log.

---

## CloudWatch log groups

All log groups encrypted with `alias/cs-logs-prod` (see [data.md](./data.md#kms--customer-managed-keys)). Retention enforced by SCP, not just policy — the app's IAM role cannot change retention, and `logs:DeleteLogGroup` is denied at the SCP level for any log group under `/cs/prod/audit/*`.

| Log group | Source | Retention | Notes |
|---|---|---|---|
| `/cs/prod/web` | `cs-web` Fargate tasks | 30 days | Application logs — request lines, errors, performance traces. **No PHI.** |
| `/cs/prod/engine` | `cs-engine` Fargate tasks | 30 days | Same standard as web. PDF processing telemetry is fine; extracted text is not. |
| `/cs/prod/migrate` | `cs-migrate` one-shot task | 30 days | Captures DDL output and the `schema_migrations` bookkeeping from the runner shipped in [#220](https://github.com/Clinical-Signal/clinical-signal-main/pull/220) |
| `/cs/prod/audit/access` | Shipped from the application — every action that touches PHI, mirroring rows that already go into the `audit_log` table (see [ARCHITECTURE.md](../../ARCHITECTURE.md#audit-logging)) | **6 years**, enforced by SCP-locked retention | This is the HIPAA artifact. The DB `audit_log` table is the source of truth; CloudWatch is the off-DB copy that survives a database compromise. |
| `/cs/prod/audit/auth` | Sign-in successes, failures, MFA prompts, session revocations | **6 years**, SCP-locked | Tracks the access-control story |
| `/cs/prod/alb-access` | ALB access logs (delivered to S3, mirrored into Logs via a subscription for searchability) | 365 days in Logs; underlying S3 keeps original log files indefinitely under lifecycle | The S3 copy is the authoritative one; Logs is for quick filter queries |
| `/cs/prod/rds-postgres` | RDS Postgres log_destination | 90 days | Slow-query log, statement log for `app_user` connection errors |
| `/cs/prod/vpc-flow` | VPC flow logs (REJECT only to keep volume down) | 90 days | Catch SG misconfiguration; full-traffic flow logs are an option later if needed |

---

## What goes into application logs (and what does not)

Restating the rule from `CLAUDE.md`: **no PHI in logs, no PHI in error messages, no PHI in client-side storage.**

**Allowed:**
- HTTP method, path with route parameters templated out (`/api/patients/[id]/protocol` — not `.../<actual-uuid>`)
- Status code, latency
- Tenant ID and practitioner ID (these are identifiers, not PHI)
- Stable resource IDs (record ID, patient UUID) — these are pointers, not the data itself
- Error type and stack trace **only after PHI redaction** (no patient name, DOB, extracted text, or protocol body in the error message)

**Never allowed:**
- Patient name, DOB, address, contact info
- Extracted lab values or clinical findings
- Raw model prompts or responses (those contain the patient timeline)
- Protocol content, dietary recommendations, supplement lists
- File contents or file paths that include any of the above

**Enforcement:** the application-layer logger has a redaction middleware that scrubs known PHI fields by name. CloudWatch metric filter (see below) catches any log line that matches a list of "shouldn't be in logs" patterns (e.g., names that look like DOBs) and triggers an alarm — defense in depth.

---

## Metric filters

CloudWatch metric filters that pattern-match log lines and emit metrics we can alarm on.

| Filter | Pattern | Metric |
|---|---|---|
| `Web5xx` | On `/cs/prod/web`, lines matching `"status":5` | `CS/Web/5xxCount` |
| `Engine5xx` | On `/cs/prod/engine`, same | `CS/Engine/5xxCount` |
| `AuthFailure` | On `/cs/prod/audit/auth`, lines matching `"event":"signin_failure"` | `CS/Auth/FailureCount` |
| `RlsViolation` | On `/cs/prod/web` and `/cs/prod/engine`, lines matching Postgres `permission denied for table` or `new row violates row-level security policy` | `CS/Db/RlsViolationCount` |
| `PhiLeakSuspicion` | On any app log group, lines matching known-PHI patterns (e.g., `\d{2}/\d{2}/\d{4}` DOB-shaped strings, `\d{3}-\d{2}-\d{4}` SSN-shaped strings) | `CS/Logs/PhiLeakSuspicionCount` |
| `MigrationFailure` | On `/cs/prod/migrate`, lines matching `Migration failed` | `CS/Migrate/FailureCount` |

The `RlsViolation` and `PhiLeakSuspicion` filters are the most important. `app_user` is `NOSUPERUSER` and the RLS policies are written so a correctly-scoped query always passes. A permission-denied or RLS violation means the app is asking for data outside its tenant scope — that is the kind of bug that should page someone immediately, not show up in a quarterly review.

---

## Alarms

CloudWatch alarms wired to an SNS topic `cs-prod-alerts`. The topic fans out to email (initial) and PagerDuty (once we have an on-call rotation).

| Alarm | Threshold | Severity |
|---|---|---|
| `ALB5xxRate` | ALB `HTTPCode_ELB_5XX_Count` over 1% of `RequestCount` for 5 minutes | High |
| `Web5xxRate` | `CS/Web/5xxCount` increasing by more than 10 in 5 minutes | High |
| `Engine5xxRate` | `CS/Engine/5xxCount` same | High |
| `RdsCpu` | RDS `CPUUtilization` over 80% for 10 minutes | Medium |
| `RdsStorage` | RDS `FreeStorageSpace` under 20% | High |
| `RdsConnections` | RDS `DatabaseConnections` over 80% of the parameter-group max for 5 minutes | Medium |
| `EcsTaskFailures` | ECS service `RunningTaskCount` under `DesiredCount` for 5 minutes (any of `cs-web`, `cs-engine`) | High |
| `MigrateFailure` | `CS/Migrate/FailureCount` over 0 in any deploy window | High (blocks deploy) |
| `BedrockThrottling` | Bedrock `ThrottlingException` count over 0 for 5 minutes | Medium (triggers a fallback/retry investigation) |
| `RlsViolation` | `CS/Db/RlsViolationCount` over 0 ever | **Critical (pages immediately)** |
| `PhiLeakSuspicion` | `CS/Logs/PhiLeakSuspicionCount` over 0 ever | **Critical (pages immediately)** |
| `AuthFailureSpike` | `CS/Auth/FailureCount` over 20 in 5 minutes from a single source IP | Medium (possible credential stuffing) |
| `SecretsRotationOverdue` | Secrets Manager `RotationOccurringTooLate` for the RDS secrets | Medium |
| `AcmCertExpiry` | ACM `DaysToExpiry` under 30 | Medium |

---

## Audit log shipping

Two-track approach:

1. **`audit_log` PostgreSQL table** remains the source of truth (already exists in [ARCHITECTURE.md](../../ARCHITECTURE.md#audit-logging) — append-only, no UPDATE/DELETE grants).
2. **Mirror to CloudWatch** at `/cs/prod/audit/access` and `/cs/prod/audit/auth` via the application's logging pipeline. Both writes happen synchronously inside the same request — if the CloudWatch write fails, we log the failure to the DB row metadata and keep serving (the DB row is still authoritative).

**Why both:** the DB copy is queryable for compliance reporting and is fast. The CloudWatch copy survives a DB-only compromise, has SCP-enforced retention the app cannot tamper with, and integrates with Athena queries spanning years of history if we ever need that.

**Read access:** a separate IAM role `auditReaderRole` has `logs:GetLogEvents` and `logs:StartQuery` on the audit log groups and read-only access to the `audit_log` table via a dedicated PostgreSQL role. Application roles do not have read access to audit logs — auditors do.

---

## Dashboards

One CloudWatch dashboard per environment with:
- ALB request rate + latency + 5xx
- ECS service health (running tasks vs desired) for web and engine
- RDS CPU, connections, free storage, replication lag (Multi-AZ standby)
- Bedrock invocation count + latency + throttle count
- Active alarms list

Dashboards are checked into Terraform like everything else.

---

## What this design deliberately does not do (yet)

- **No third-party APM** (Datadog, New Relic, Sentry). CloudWatch + Container Insights covers the operational picture for MVP. Revisit when we have a real on-call rotation that needs better tooling.
- **No tracing (AWS X-Ray).** Useful but not on the critical path for MVP. Easy to add once the services are stable.
- **No log archival to S3 + Glacier.** Six-year CloudWatch retention is the simplest compliant story. The cost trade-off only matters at log volumes we don't have yet.
- **No SIEM integration.** Single-tenant product, small operator team — CloudTrail + CloudWatch alarms are sufficient. Add when we have a SOC team to give a SIEM to.
