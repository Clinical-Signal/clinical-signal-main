/**
 * FR-18 / GATE-3 — server-side readiness gate before protocol generation.
 */
import { writeAudit } from "@/lib/audit";
import type { ProtocolReadinessAuditPayload } from "@/lib/db/schema/audit-log";
import { collectChecks } from "@/lib/readiness-collect";
import { evaluateReadiness, type ReadinessResult } from "@/lib/readiness";

export class ProtocolReadinessBlockedError extends Error {
  readonly result: ReadinessResult;

  constructor(result: ReadinessResult) {
    super(`Readiness gate failed: ${result.blocking_gaps.join(", ")}`);
    this.name = "ProtocolReadinessBlockedError";
    this.result = result;
  }
}

function toAuditPayload(result: ReadinessResult): ProtocolReadinessAuditPayload {
  return {
    readiness: result.readiness,
    confidence_ceiling:
      result.confidence_ceiling === "medium"
        ? "moderate"
        : result.confidence_ceiling,
    can_generate: result.can_generate,
    blocking_gaps: result.blocking_gaps,
    non_blocking_gaps: result.non_blocking_gaps,
  };
}

export async function assertProtocolReadinessForGeneration(args: {
  tenantId: string;
  practitionerId: string;
  patientId: string;
}): Promise<ReadinessResult> {
  const checks = await collectChecks(args.patientId);
  const result = evaluateReadiness(checks, []);

  await writeAudit({
    action: "protocol_readiness_evaluated",
    tenantId: args.tenantId,
    practitionerId: args.practitionerId,
    resourceType: "patient",
    resourceId: args.patientId,
    metadata: toAuditPayload(result),
  });

  if (!result.can_generate) {
    await writeAudit({
      action: "protocol_generation_blocked",
      tenantId: args.tenantId,
      practitionerId: args.practitionerId,
      resourceType: "patient",
      resourceId: args.patientId,
      metadata: toAuditPayload(result),
    });
    throw new ProtocolReadinessBlockedError(result);
  }

  return result;
}
