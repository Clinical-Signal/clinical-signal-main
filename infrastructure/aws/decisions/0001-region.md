# ADR 0001 — AWS region

- **Status:** Accepted
- **Date:** 2026-05-20
- **Decision-makers:** Repo owners
- **Related:** [PLAN.md](../PLAN.md), [#223](https://github.com/Clinical-Signal/clinical-signal-main/issues/223)

## Context

Clinical Signal must run in a single AWS region for MVP. The region choice is sticky — moving production PHI between regions later is expensive (cross-region replication, key re-issuance, ACM re-validation, S3 transfer) and is the kind of project that gets perpetually deferred. Lock the choice now.

Three HIPAA-eligible US regions are realistic candidates: `us-east-1`, `us-east-2`, `us-west-2`. All three have every service in the [PLAN.md mapping](../PLAN.md#mapping-today--aws-target) GA.

## Decision

**`us-west-2` (Oregon).**

## Alternatives considered

### `us-east-1` (N. Virginia)

- Pros: cheapest pricing of the three on most services; broadest service feature parity; longest-lived region with the most operational maturity.
- Cons: largest blast radius — when `us-east-1` has an outage, half the internet is affected (IAM control plane historically lived there, recent improvements notwithstanding). For a clinical product where "the practitioner can't access patient records mid-call" is the worst-case failure, sharing a blast radius with the entire public internet is not an asset.

Rejected.

### `us-east-2` (Ohio)

- Pros: less correlated with `us-east-1` outages; pricing essentially identical to `us-east-1`; a perfectly reasonable conservative choice.
- Cons: tends to lag `us-west-2` on Bedrock model availability — new Anthropic Claude models historically land in `us-west-2` first, then propagate. For a product whose core feature is "Claude reads the chart and writes the protocol," being on the lagging region is a real product disadvantage.

Rejected.

### `us-west-2` (Oregon)

- Pros: best-in-class Bedrock model rollout cadence; lower latency to the west-coast practitioner network the early customers come from; full HIPAA eligibility on every service in the mapping table.
- Cons: marginally higher cost than `us-east-1` on a few line items (NAT, data transfer); slightly higher latency to east-coast users (acceptable given product latency is dominated by Bedrock inference time, not network).

Chosen.

## Rationale

The two things that mattered most:

1. **Bedrock model availability** is on the critical product path. The clinical analysis is what makes this app worth paying for. If a Claude Sonnet 4.x or 5.x release lands in `us-west-2` first and we are on `us-east-2`, we either ship a worse product to our users for the rollout window or we maintain a region-aware fallback — both bad. `us-west-2` puts us on the rollout frontier.

2. **Blast-radius isolation from `us-east-1`** matters more than absolute uptime numbers suggest. A clinical practitioner losing access during a patient call has an outsized perceived-quality cost; even a 20-minute outage during business hours is a story that gets told. Being one region removed from the largest correlated failure surface is worth the small cost premium.

The remaining cost delta vs `us-east-1` is in the noise relative to the MVP cost ceiling (~$350/mo target in [PLAN.md](../PLAN.md#still-open-decisions-not-blocking-called-out-for-review-feedback)). Latency cost to east-coast users is dominated by the model inference latency itself.

## Consequences

- All Terraform `provider "aws"` blocks default to `us-west-2`.
- ACM certificates for the ALB live in `us-west-2`. If we add CloudFront later, a second cert in `us-east-1` (CloudFront-only requirement) is needed.
- Bedrock model access requests are filed against `us-west-2`.
- Compliance / BAA documentation references `us-west-2` as the data-residency region.
- Any future multi-region work uses `us-east-2` as the secondary (different geographic AZ cluster, different US coast).
