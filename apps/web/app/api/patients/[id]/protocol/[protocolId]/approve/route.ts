import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol, getOriginalProtocol, approveProtocol } from "@/lib/protocols";
import { generateDerivativeOutputs } from "@/lib/protocol-outputs";
import { recordProtocolApproved } from "@/lib/timeline";
import { computeProtocolDiff, storeProtocolEdits } from "@/lib/protocol-edits";
import { runPatternRecognition } from "@/lib/pattern-recognition";
import { logError } from "@/lib/logger";

export async function POST(
  _req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) {
      return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    }

    const denied = await enforceCapability(user, "finalize_protocol");
    if (denied) return denied;

    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) {
      return apiError(ERROR_CODES.NOT_FOUND, 404);
    }

    // Verify the protocol exists and belongs to this patient
    const protocol = await getProtocol(user.tenantId, ctx.params.protocolId);
    if (!protocol || protocol.patientId !== ctx.params.id) {
      return apiError(ERROR_CODES.NOT_FOUND, 404);
    }

    if (protocol.status === "approved") {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }
    if (protocol.status === "superseded") {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }

    await approveProtocol(user.tenantId, ctx.params.protocolId);

    await writeAudit({
      action: "protocol_status_changed",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: {
        patient_id: ctx.params.id,
        protocol_id: ctx.params.protocolId,
        new_status: "approved",
        version: protocol.version,
      },
    });

    // Record approval in PatientTimeline
    recordProtocolApproved(
      user.tenantId, ctx.params.id, ctx.params.protocolId, user.practitionerId,
    ).catch((err) => logError("timeline", "Failed to record approval:", err));

    // Track edits: compare approved version against the original AI output.
    // If the practitioner edited the protocol, capture structured diffs for
    // pattern learning. Runs in background — does not block approval.
    if (protocol.version > 1) {
      (async () => {
        try {
          const original = await getOriginalProtocol(user.tenantId, ctx.params.id);
          if (original) {
            const edits = computeProtocolDiff(
              { clinical: original.clinicalContent, client: original.clientContent },
              { clinical: protocol.clinicalContent, client: protocol.clientContent },
            );
            if (edits.length > 0) {
              await storeProtocolEdits({
                tenantId: user.tenantId,
                protocolId: ctx.params.protocolId,
                patientId: ctx.params.id,
                practitionerId: user.practitionerId,
                edits,
                originalClinical: original.clinicalContent,
                originalClient: original.clientContent,
              });

              // After storing edits, run pattern recognition to detect
              // recurring edit patterns and surface them as suggested
              // preferences. Runs in background — does not block approval.
              runPatternRecognition(user.tenantId, user.practitionerId)
                .catch((err) => logError("pattern-recognition", "Failed:", err));
            }
          }
        } catch (err) {
          logError("protocol-edits", "Failed to track edits:", err);
        }
      })();
    }

    // Trigger derivative output generation (client doc, call deck, email draft).
    // This runs in the background — the approval response returns immediately.
    // Each output is independent; failures are logged but don't block each other.
    generateDerivativeOutputs({
      tenantId: user.tenantId,
      protocolId: ctx.params.protocolId,
      patientId: ctx.params.id,
      practitionerId: user.practitionerId,
      clinicalContent: protocol.clinicalContent,
      clientContent: protocol.clientContent,
    }).catch((err) => logError("protocol-outputs", "Background generation failed:", err));

    return NextResponse.json({ ok: true, status: "approved" });
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
