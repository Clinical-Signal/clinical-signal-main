import { writeAudit } from "@/lib/audit/write-audit";
import { logSafeError } from "@/lib/log-safe";

import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";
import { extractClientIp } from "@/lib/tokens/intake-token-api";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { getPatientIntakeState, savePatientIntakeData } from "@/lib/intake/patient-intake-store";
import { setPatientIntakeStatus } from "@/lib/intake/set-patient-intake-status";
import { sendIntakeConfirmationEmail } from "@/lib/intake/send-intake-confirmation-email";

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
  const existing = await getPatientIntakeState(verified.tenantId, verified.patientId);
  if (existing) {
    await savePatientIntakeData(verified.tenantId, verified.patientId, {
      ...existing.intakeData,
      submitted_at: submittedAt,
    });
  }

  void sendIntakeConfirmationEmail({
    tenantId: verified.tenantId,
    patientId: verified.patientId,
    intakeTokenId: verified.tokenId,
  }).catch((error) => {
    logSafeError("[intake-submit] confirmation_email_failed", error);
  });

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
