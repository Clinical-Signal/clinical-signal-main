import { type ZodIssue } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import { logSafeError } from "@/lib/log-safe";

import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";
import { extractClientIp } from "@/lib/tokens/intake-token-api";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import {
  getPatientIntakeState,
  setIntakeSubmittedAt,
} from "@/lib/intake/patient-intake-store";
import { setPatientIntakeStatus } from "@/lib/intake/set-patient-intake-status";
import { sendIntakeConfirmationEmail } from "@/lib/intake/send-intake-confirmation-email";
import { emitIntakeCompleted } from "@/lib/intake/intake-events";
import { StepOneCompleteSchema } from "@/lib/intake/schemas/step-one.schema";

/**
 * Thrown when a patient tries to submit an intake whose stored Step-1 data does
 * not satisfy the strict completion schema (e.g. missing full name, DOB, or
 * chief complaint). Carries the ZodError issues so the route can return them.
 */
export class IntakeIncompleteError extends Error {
  readonly issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super("Intake submission is incomplete");
    this.name = "IntakeIncompleteError";
    this.issues = issues;
  }
}

export function isIntakeIncompleteError(
  error: unknown,
): error is IntakeIncompleteError {
  return error instanceof IntakeIncompleteError;
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

  // Defense-in-depth: validate the stored record against the strict completion
  // schema BEFORE mutating any state (status, token) or stamping submitted_at.
  // This is a READ-ONLY check — we never write `completeness.data` back; the
  // record is persisted only via the targeted setIntakeSubmittedAt() jsonb_set
  // below, preserving the partial-update pattern.
  const existing = await getPatientIntakeState(verified.tenantId, verified.patientId);
  if (!existing) {
    throw new Error("Patient not found");
  }

  const completeness = StepOneCompleteSchema.safeParse(existing.intakeData);
  if (!completeness.success) {
    throw new IntakeIncompleteError(completeness.error.issues);
  }

  await setPatientIntakeStatus(verified.tenantId, verified.patientId, "step2_complete");
  await getIntakeTokenService().complete(verified.tokenId);

  const submittedAt = new Date().toISOString();
  // Targeted update: stamp submitted_at only. This previously reloaded the
  // record through normalizeIntakeData() and rewrote the entire JSONB blob,
  // which persisted an empty fallback over valid Step-1 data whenever the
  // normalize parse failed. The partial update leaves intake_data intact.
  await setIntakeSubmittedAt(verified.tenantId, verified.patientId, submittedAt);

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

  // Push a live signal so subscribed dashboards refresh without a manual reload.
  // Best-effort: an emit failure must never fail the patient's submission.
  try {
    emitIntakeCompleted(verified.tenantId, {
      patientId: verified.patientId,
      submittedAt,
    });
  } catch (error) {
    logSafeError("[intake-submit] live_event_emit_failed", error);
  }

  return {
    submittedAt,
    patientId: verified.patientId,
    tokenId: verified.tokenId,
  };
}

export function isIntakeSubmissionError(error: unknown): error is IntakeTokenError {
  return error instanceof IntakeTokenError;
}
