# ADR 0003 — Multi-AZ posture for MVP

- **Status:** Accepted
- **Date:** 2026-05-20
- **Decision-makers:** Repo owners
- **Related:** [PLAN.md](../PLAN.md), [data.md](../data.md), [network.md](../network.md), [#223](https://github.com/Clinical-Signal/clinical-signal-main/issues/223)

## Context

The MVP can run in a single AWS Availability Zone or be spread across two AZs from day one. The cost delta is real (RDS Multi-AZ roughly doubles the DB cost; a second NAT Gateway adds ~$35/mo; ALB cross-zone has minor data-transfer cost). The uptime delta is also real — single-AZ failures happen on a multi-year cadence but they happen, and recovery from a single-AZ outage without a Multi-AZ standby means restoring from a backup, which is hours not minutes.

HIPAA does not strictly require Multi-AZ — it requires reasonable safeguards against data loss, which automated backups + PITR also satisfy. Uptime expectations from end users are what actually drive this decision.

## Decision

**Multi-AZ from day one.** RDS in Multi-AZ mode, ECS services with `desiredCount=2` spread across `us-west-2a` and `us-west-2b`, ALB attached to both AZs, NAT Gateway in each AZ.

## Alternatives considered

### Single-AZ MVP

- Pros: cheapest option. RDS single-AZ saves ~$70/mo on `db.t4g.medium`. Single NAT Gateway saves ~$35/mo. Simpler initial Terraform.
- Cons: any future migration to Multi-AZ requires scheduled downtime to convert the RDS instance — a downtime window we'd need to coordinate with practitioners who use the tool during patient calls. Single-AZ outages, while rare, take the entire product down with no graceful degradation. The recovery path (restore-from-backup) is hours of downtime and active operator work.

Rejected.

### Hybrid (Multi-AZ for ECS + ALB, single-AZ for RDS)

- Pros: captures the cheap half of the HA win (stateless tier survives an AZ outage). Halves the cost delta vs full Multi-AZ.
- Cons: leaves the most-important single point of failure in place — the database. If `us-west-2a` goes down and RDS is single-AZ in that AZ, the rest of the HA design contributes nothing; the product is still down. This is the wrong corner to save money in.

Rejected.

### Full Multi-AZ from day one

- Pros: every tier survives an AZ failure with no data loss and minimal (RDS standby promotion: ~60-120s) interruption. No future "migrate to Multi-AZ" project on the roadmap. Operationally simpler — there is only one shape of deployment.
- Cons: ~$70-100/mo cost premium for the MVP. NAT-per-AZ requires twice the NAT cost.

Chosen.

## Rationale

The cost number is small in absolute terms (~$100/mo at the high end) relative to the MVP cost ceiling (~$350/mo target). It is rounding error compared to a single practitioner losing access during a patient consultation — that is the kind of incident that costs a customer relationship, and customer relationships at this stage of the product are worth orders of magnitude more than the infrastructure savings.

The operational argument is just as important: the single-AZ-to-Multi-AZ migration is a project. It involves a maintenance window, customer communication, a tested fallback plan, and a non-zero risk of data issues. It is the kind of project that gets deferred indefinitely once there is a real product running. Doing it on day one, when there is no production data and no customers to coordinate with, is essentially free.

Multi-AZ also unlocks operational practices that are valuable in their own right:
- Zero-downtime RDS minor-version upgrades (the standby is upgraded first, then promoted).
- Failover testing as part of DR readiness — we can force a failover in a controlled window and verify the application reconnects cleanly.
- AZ-level deployment safety — a bad deploy that crashes tasks in one AZ doesn't take the product down.

The HIPAA argument is neutral, not decisive. The regulation does not require Multi-AZ. Our promise to practitioners that their data is safe and available does.

## Consequences

- The Terraform RDS module sets `multi_az = true`.
- ECS services for `cs-web` and `cs-engine` set `desiredCount = 2` minimum and the service scheduler is configured to spread tasks across AZs (`placementStrategy` of type `spread` on `attribute:ecs.availability-zone`).
- The VPC design in [network.md](../network.md) provisions subnets in both `us-west-2a` and `us-west-2b` from the start, with reserved CIDR space for a third AZ if we ever want it.
- NAT Gateways: one per AZ (no shared NAT). The cross-AZ data transfer cost saved by not sharing NAT outweighs the marginal NAT-per-hour cost at our scale.
- Cost monitoring needs to factor in the Multi-AZ premium when evaluating the [PLAN.md cost ceiling](../PLAN.md#still-open-decisions-not-blocking-called-out-for-review-feedback) of ~$350/mo.
- A failover-test runbook is a follow-up item (not blocking) once RDS Multi-AZ is provisioned.
