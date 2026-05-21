# ADR 0002 — Infrastructure-as-Code tool

- **Status:** Accepted
- **Date:** 2026-05-20
- **Decision-makers:** Repo owners
- **Related:** [PLAN.md](../PLAN.md), [#223](https://github.com/Clinical-Signal/clinical-signal-main/issues/223)

## Context

Every AWS resource in [PLAN.md](../PLAN.md) must be expressed as code, version-controlled in this repo, and applied via CI through the GitHub OIDC role from [secrets-and-iam.md](../secrets-and-iam.md). No clickops in the Console past the one-time bootstrap of the Terraform state backend.

The candidates are Terraform (HCL), AWS CDK (TypeScript), and Pulumi (TypeScript). All three can provision the full set of resources in the mapping table; the choice is about audit story, review ergonomics, and how badly the wrong choice would hurt in the HIPAA review that has to happen before any PHI lands.

## Decision

**Terraform**, with remote state in S3 and state locking via DynamoDB. The state bucket and lock table are bootstrapped one-time via a small seed Terraform run; all subsequent infra changes go through the GitHub Actions workflow.

## Alternatives considered

### AWS CDK in TypeScript

- Pros: same language as the Next.js app (`apps/web`), so developers don't context-switch into a second language for infra; constructs library provides higher-level abstractions for common patterns; first-class AWS support.
- Cons: synthesizes CloudFormation under the hood, which is what actually gets applied. Reviewing a security-relevant change means reading either the CDK source (high-level, hides what AWS will actually do) or the synthesized template (low-level, hundreds of lines per change). Neither is what a HIPAA reviewer wants. CloudFormation rollback semantics on partial failures are also worse than Terraform's plan/apply model for the kinds of small targeted changes that infra work breaks into.

Rejected.

### Pulumi in TypeScript

- Pros: same TS-as-infra story as CDK; multi-cloud capable if we ever care; richer programming model than HCL.
- Cons: smaller community and ecosystem than Terraform; AWS provider lags Terraform's on bleeding-edge service support; the state-as-audit story is weaker because the state schema is private to Pulumi rather than the standardized Terraform state format that tooling (e.g., `tflint`, `tfsec`, `infracost`) targets.

Rejected.

### Terraform

- Pros: HCL is greppable — a reviewer can `grep` the repo for `aws_kms_key`, `aws_iam_policy`, `aws_security_group_rule` and read every instance directly. `terraform plan` output is a stable, human-readable diff that goes straight into the PR description for sensitive changes (KMS key policy, IAM trust policy, SG rule). Remote state in S3 + DynamoDB lock is a versioned, auditable change log. The AWS provider is the most complete and the most current.
- Cons: HCL is not a real programming language; complex conditional logic gets awkward. The `count` / `for_each` semantics surprise people. State management is a real operational responsibility (don't break the state bucket).

Chosen.

## Rationale

The deciding factor was the **HIPAA review path**. The security reviewer for a clinical PHI product is going to read the IaC repo with a checklist that looks like:

- "Is anything in a public subnet that holds PHI?"
- "What IAM principals can call `kms:Decrypt` on the PHI key?"
- "What ingress rules does the RDS security group have?"
- "Is the audit log retention enforceable and tamper-evident?"

Every one of those questions is answered fastest by `grep`ping HCL. Reading CDK constructs requires understanding the construct authors' design choices; reading synthesized CloudFormation requires wading through hundreds of generated lines for a one-line change. HCL is the format that matches the review workflow.

The secondary factors all reinforce: `terraform plan` outputs paste cleanly into PR descriptions; `tfsec` and `checkov` give static analysis without writing custom rules; the Terraform state file in S3 is itself an auditable record of every change, with versioning enabled.

The "TypeScript everywhere" argument for CDK or Pulumi is real but small. Infra changes are uncommon compared to app changes, and the developers making infra changes are the same developers reading IAM docs anyway — they're already context-switching.

## Consequences

- The repo gains an `infrastructure/aws/terraform/` tree (created in the bring-up follow-up issue, not this PR) with a root module per environment and shared child modules per resource group.
- The state backend (S3 bucket + DynamoDB table) is bootstrapped in a tiny seed Terraform run, applied once by a human assuming admin via Identity Center. All subsequent applies go through the GitHub OIDC `githubActionsDeployRole` from [secrets-and-iam.md](../secrets-and-iam.md).
- Every PR that touches `infrastructure/aws/terraform/` gets a `terraform plan` posted as a PR comment by CI before merge.
- `tfsec` and `tflint` run as part of the PR-time validate workflow.
- Drift detection runs nightly: a scheduled `terraform plan` against `main` that opens an issue if state and reality diverge.
