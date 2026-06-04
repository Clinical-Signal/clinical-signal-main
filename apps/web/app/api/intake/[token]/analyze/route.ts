import { NextResponse } from "next/server";

import {
  coerceQuestionPlanResolved,
  extractDeterministicKeysFromIntake,
} from "@/lib/intake/analyze-pipeline-helpers";
import { buildDegradedQuestionPlan } from "@/lib/intake/build-question-plan";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { runIntakeAnalyzePipeline } from "@/lib/intake/run-intake-analyze-pipeline";
import { INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION } from "@/lib/llm/analyze-intake";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const LOG = "[api/intake/analyze]";

function logFailure(stage: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(LOG, stage, error.message);
    if (error.stack) {
      console.error(LOG, `${stage}_stack`, error.stack);
    }
    return;
  }
  console.error(LOG, stage, error);
}

/**
 * API-3 — POST /api/intake/[token]/analyze
 * Always returns a valid QuestionPlanResolved on 200 (success or degraded).
 */
export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token?.trim();
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  let verified: {
    tenantId: string;
    patientId: string;
    tokenId: string;
  };

  try {
    console.error(LOG, "token_verify_start");
    verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });
    console.error(LOG, "token_verify_complete", { tokenId: verified.tokenId });
  } catch (error) {
    logFailure("token_verify_failed", error);
    return tokenErrorResponse(error);
  }

  try {
    console.error(LOG, "pipeline_start", { tokenId: verified.tokenId });

    const { resolved, persistenceSaved } = await runIntakeAnalyzePipeline({
      tenantId: verified.tenantId,
      patientId: verified.patientId,
      tokenId: verified.tokenId,
    });

    if (!persistenceSaved) {
      console.error(LOG, "persistence_unsaved", { tokenId: verified.tokenId });
    }

    let deterministicKeys: ReturnType<typeof extractDeterministicKeysFromIntake> =
      [];
    try {
      const state = await getPatientIntakeState(
        verified.tenantId,
        verified.patientId,
      );
      if (state) {
        deterministicKeys = extractDeterministicKeysFromIntake(state.intakeData);
      }
    } catch (error) {
      logFailure("trigger_rehydrate_failed", error);
    }

    const payload = coerceQuestionPlanResolved(resolved, deterministicKeys);

    console.error(LOG, "pipeline_complete", {
      tokenId: verified.tokenId,
      persistenceSaved,
      analysisDegraded: payload.analysis_degraded,
      moduleCount: payload.question_plan.length,
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "Patient not found") {
      console.error(LOG, "patient_not_found");
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    logFailure("pipeline_fatal", error);

    const emergency = buildDegradedQuestionPlan(
      [],
      INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
    );

    console.error(LOG, "emergency_degraded_response", {
      tokenId: verified.tokenId,
      moduleCount: emergency.question_plan.length,
    });

    return NextResponse.json(emergency);
  }
}
