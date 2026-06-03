import { writeAudit } from "@/lib/audit/write-audit";
import { withTenantContext } from "@cs/db";
import type { TenantContext } from "@cs/core";

import type { IntakeStatus } from "@/lib/db/schema/patients-intake";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";
import { extractClientIp } from "@/lib/tokens/intake-token-api";
import { IntakeTokenError } from "@/lib/tokens/intake-token";

function tenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    practitionerId: "00000000-0000-0000-0000-000000000000",
    sessionId: "intake-submit",
    role: "practitioner",
    lifecycleStatus: "active",
  };
}

export async function setPatientIntakeStatus(
  tenantId: string,
  patientId: string,
  intakeStatus: IntakeStatus,
): Promise<void> {
  await withTenantContext(tenantContext(tenantId), async (client) => {
    const { rowCount } = await client.query(
      `UPDATE patients SET intake_status = $3 WHERE id = $1 AND tenant_id = $2`,
      [patientId, tenantId, intakeStatus],
    );
    if (rowCount === 0) {
      throw new Error("Patient not found");
    }
  });
}

/** Final patient submission: marks intake complete and invalidates the magic link. */
export async function completeIntakeSubmission(
  request: Request,
  rawToken: string,
): Promise<{ submittedAt: string; patientId: string; tokenId: string }> {
  const verified = await getIntakeTokenService().verify({
    rawToken,
    clientIp: extractClientIp(request),
  });

  await setPatientIntakeStatus(verified.tenantId, verified.patientId, "step2_complete");
  await getIntakeTokenService().complete(verified.tokenId);

  const submittedAt = new Date().toISOString();

  await writeAudit({
    tenantId: verified.tenantId,
    actorId: null,
    action: "intake_submitted",
    entity: "patient",
    entityId: verified.patientId,
    payload: {
      tokenId: verified.tokenId,
    },
  });

  await writeAudit({
    tenantId: verified.tenantId,
    actorId: null,
    action: "intake_token_completed",
    entity: "token",
    entityId: verified.tokenId,
    payload: {
      patientId: verified.patientId,
    },
  });

  return {
    submittedAt,
    patientId: verified.patientId,
    tokenId: verified.tokenId,
  };
}

export function isIntakeSubmissionError(error: unknown): error is IntakeTokenError {
  return error instanceof IntakeTokenError;
}
