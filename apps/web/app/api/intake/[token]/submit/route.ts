import { NextResponse } from "next/server";

import {
  completeIntakeSubmission,
  isIntakeSubmissionError,
} from "@/lib/intake/complete-intake-submission";
import { tokenErrorResponse } from "@/lib/tokens/intake-token-api";

export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token;
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  try {
    const result = await completeIntakeSubmission(request, rawToken);
    return NextResponse.json({
      submittedAt: result.submittedAt,
      patientId: result.patientId,
      tokenStatus: "completed",
    });
  } catch (error) {
    if (isIntakeSubmissionError(error)) {
      return tokenErrorResponse(error);
    }

    if (error instanceof Error && error.message === "Patient not found") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    console.error(
      "[intake/submit] failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
