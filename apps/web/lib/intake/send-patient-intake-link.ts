import { writeAudit } from "@/lib/audit/write-audit";
import { buildPatientIntakeUrl } from "@/lib/intake/build-intake-url";
import { dispatchIntakeEmail } from "@/lib/intake/dispatch-intake-email";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { resolvePatientIntakeEmail } from "@/lib/intake/resolve-patient-intake-email";
import { logSafeError } from "@/lib/log-safe";
import { IntakeTokenError, type MintIntakeTokenResult } from "@/lib/tokens/intake-token";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export class PatientIntakeEmailRequiredError extends Error {
  constructor() {
    super("Patient email is required to send an intake link.");
    this.name = "PatientIntakeEmailRequiredError";
  }
}

export class PatientIntakeEmailDispatchError extends Error {
  constructor() {
    super("Failed to dispatch intake email.");
    this.name = "PatientIntakeEmailDispatchError";
  }
}

/** Mints/reissues a token and emails the patient their magic intake link. */
export async function sendPatientIntakeLink(args: {
  tenantId: string;
  practitionerId: string;
  patientId: string;
  /** When set (e.g. patient create form), sends to this address instead of re-reading DB. */
  patientEmail?: string;
}): Promise<MintIntakeTokenResult> {
  const minted = await getIntakeTokenService().reissue({
    patientId: args.patientId,
    tenantId: args.tenantId,
    createdBy: args.practitionerId,
  });

  const explicitEmail = args.patientEmail?.trim().toLowerCase();
  let patientEmail = explicitEmail || null;
  if (!patientEmail) {
    const state = await getPatientIntakeState(args.tenantId, args.patientId);
    patientEmail = resolvePatientIntakeEmail(state?.intakeData);
  }
  if (!patientEmail) {
    throw new PatientIntakeEmailRequiredError();
  }

  const intakeUrl = buildPatientIntakeUrl(minted.token);

  try {
    await dispatchIntakeEmail({ patientEmail, intakeUrl });
  } catch (emailError) {
    logSafeError("[send-patient-intake-link] email_dispatch_failed", emailError);
    throw new PatientIntakeEmailDispatchError();
  }

  await writeAudit({
    tenantId: args.tenantId,
    actorId: args.practitionerId,
    action: "intake_token_minted",
    entity: "token",
    entityId: minted.tokenId,
    payload: {
      patientId: args.patientId,
      dispatch: "email",
    },
  });

  await writeAudit({
    tenantId: args.tenantId,
    actorId: args.practitionerId,
    action: "intake_magic_link_sent",
    entity: "patient",
    entityId: args.patientId,
    payload: {
      tokenId: minted.tokenId,
    },
  });

  return minted;
}

export function isIntakeTokenConflict(error: unknown): boolean {
  return error instanceof IntakeTokenError && error.code === "active_token_exists";
}
