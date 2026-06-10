import { NextResponse } from "next/server";

import {
  completeIntakeSubmission,
  isIntakeIncompleteError,
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
    if (isIntakeIncompleteError(error)) {
      // Strict completion failed: tell the client exactly which fields are
      // missing/invalid. Zod issues carry field paths/codes, not PHI values.
      return NextResponse.json(
        { error: "INTAKE_INCOMPLETE", issues: error.issues },
        { status: 400 },
      );
    }

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
