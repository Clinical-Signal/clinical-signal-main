import { NextResponse } from "next/server";
import { z } from "zod";

import { runIntakeAnalyzePipeline } from "@/lib/intake/run-intake-analyze-pipeline";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const LOG = "[intake/analyze]";

export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token;
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  try {
    console.error(LOG, "token_verify_start");
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });
    console.error(LOG, "token_verify_complete", {
      tokenId: verified.tokenId,
      patientId: verified.patientId,
    });

    const { resolved, persistenceSaved } = await runIntakeAnalyzePipeline({
      tenantId: verified.tenantId,
      patientId: verified.patientId,
      tokenId: verified.tokenId,
    });

    if (!persistenceSaved) {
      console.error(LOG, "response_with_unsaved_plan", {
        patientId: verified.patientId,
      });
    }

    return NextResponse.json(resolved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(LOG, "validation_error", error);
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (error instanceof Error && error.message === "Patient not found") {
      console.error(LOG, "patient_not_found", error);
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    console.error(LOG, "fatal_pipeline_error", error);
    return tokenErrorResponse(error);
  }
}
