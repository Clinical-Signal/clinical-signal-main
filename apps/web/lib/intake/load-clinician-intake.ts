import { writeAudit } from "@/lib/audit/write-audit";
import { requireAuth, type Session } from "@/lib/auth/require-auth";
import { patientBelongsToTenant } from "@/lib/auth/patient-belongs-to-tenant";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";
import {
  getPatientIntakeState,
  type PatientIntakeState,
} from "@/lib/intake/patient-intake-store";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";
import { extractSynthesisResolved } from "@/lib/intake/step-two-storage";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";
import type { VerifyIntakeTokenResult } from "@/lib/tokens/intake-token";

export type ClinicianIntakeReview = {
  patientId: string;
  tenantId: string;
  intakeStatus: IntakeStatus;
  intakeData: IntakeData;
  synthesisResolved: SynthesisResolved | null;
  tokenId: string;
};

export class ClinicianIntakeAccessError extends Error {
  constructor(message = "clinician_intake_access_denied") {
    super(message);
    this.name = "ClinicianIntakeAccessError";
  }
}

/** Verifies clinician session + intake token and loads patient intake (no audit). */
export async function resolveClinicianIntakeByToken(
  rawToken: string,
  clientIp: string,
  session?: Session,
): Promise<ClinicianIntakeReview> {
  const auth = session ?? (await requireAuth());
  const verified = await getIntakeTokenService().verify({
    rawToken,
    clientIp,
  });

  await assertClinicianMayAccessPatient(auth.tenantId, verified);

  const state = await getPatientIntakeState(verified.tenantId, verified.patientId);
  if (!state) {
    throw new ClinicianIntakeAccessError("patient_not_found");
  }

  return toClinicianReview(state, verified);
}

export async function loadClinicianIntakeByToken(
  rawToken: string,
  clientIp: string,
): Promise<ClinicianIntakeReview> {
  const session = await requireAuth();
  const review = await resolveClinicianIntakeByToken(rawToken, clientIp, session);

  await writeAudit({
    tenantId: review.tenantId,
    actorId: session.userId,
    action: "intake_clinician_review_viewed",
    entity: "patient",
    entityId: review.patientId,
    payload: {
      tokenId: review.tokenId,
      intakeStatus: review.intakeStatus,
      analysisDegraded: review.intakeData._analysis_degraded,
    },
  });

  return review;
}

async function assertClinicianMayAccessPatient(
  sessionTenantId: string,
  verified: VerifyIntakeTokenResult,
): Promise<void> {
  if (verified.tenantId !== sessionTenantId) {
    throw new ClinicianIntakeAccessError("tenant_mismatch");
  }

  const belongs = await patientBelongsToTenant(verified.patientId, sessionTenantId);
  if (!belongs) {
    throw new ClinicianIntakeAccessError("patient_not_in_tenant");
  }
}

function toClinicianReview(
  state: PatientIntakeState,
  verified: VerifyIntakeTokenResult,
): ClinicianIntakeReview {
  return {
    patientId: state.patientId,
    tenantId: state.tenantId,
    intakeStatus: state.intakeStatus,
    intakeData: state.intakeData,
    synthesisResolved: extractSynthesisResolved(state.intakeData.step_two),
    tokenId: verified.tokenId,
  };
}
