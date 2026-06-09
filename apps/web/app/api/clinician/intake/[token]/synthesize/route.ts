import { NextResponse } from "next/server";

import { writeAudit } from "@/lib/audit/write-audit";
import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import {
  ClinicianIntakeAccessError,
  resolveClinicianIntakeByToken,
} from "@/lib/intake/load-clinician-intake";
import { savePatientSynthesisResolved } from "@/lib/intake/save-patient-synthesis";
import { synthesizeNote } from "@/lib/llm/synthesize-note";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";

const LOG = "[clinician/intake/synthesize]";

export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token;
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  try {
    const user = await apiAuth();
    if (!user) {
      return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const denied = await enforceCapability(user, "revise_intake");
    if (denied) return denied;

    const review = await resolveClinicianIntakeByToken(
      rawToken,
      extractClientIp(request),
    );

    let result;
    try {
      result = await synthesizeNote(review.intakeData);
    } catch (llmError) {
      console.error(LOG, "synthesis_runtime_error", {
        patientId: review.patientId,
        tokenId: review.tokenId,
      });
      console.error(LOG, llmError);
      return NextResponse.json(
        {
          error: "SYNTHESIS_FAILED",
          degraded: true,
          message:
            "Clinical synthesis failed due to a service error or timeout. Try again shortly.",
        },
        { status: 500 },
      );
    }

    if (!result) {
      console.error(LOG, "synthesis_degraded", {
        patientId: review.patientId,
        tokenId: review.tokenId,
      });
      return NextResponse.json(
        {
          error: "SYNTHESIS_FAILED",
          degraded: true,
          message:
            "Clinical synthesis could not be completed. The model response was invalid or unavailable.",
        },
        { status: 500 },
      );
    }

    const generatedAt = new Date().toISOString();

    try {
      await savePatientSynthesisResolved(review.tenantId, review.patientId, {
        clinical_summary: result.output.clinical_summary,
        suggested_next_steps: result.output.suggested_next_steps,
        model_id: result.modelId,
        prompt_version: result.promptVersion,
        generated_at: generatedAt,
      });
    } catch (saveError) {
      console.error(LOG, "persistence_failed", {
        patientId: review.patientId,
        tokenId: review.tokenId,
      });
      console.error(LOG, saveError);
      return NextResponse.json(
        {
          error: "SYNTHESIS_SAVE_FAILED",
          message:
            "Clinical synthesis was generated but could not be saved. Try again.",
        },
        { status: 500 },
      );
    }

    await writeAudit({
      tenantId: review.tenantId,
      actorId: user.practitionerId,
      action: "intake_synthesis_generated",
      entity: "patient",
      entityId: review.patientId,
      payload: {
        tokenId: review.tokenId,
        modelId: result.modelId,
        promptVersion: result.promptVersion,
        stepCount: result.output.suggested_next_steps.length,
        persisted: true,
      },
    });

    return NextResponse.json({
      synthesis: result.output,
      modelId: result.modelId,
      promptVersion: result.promptVersion,
      generatedAt,
    });
  } catch (error) {
    if (error instanceof ClinicianIntakeAccessError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    console.error(LOG, "unhandled_error", error);
    return tokenErrorResponse(error);
  }
}
