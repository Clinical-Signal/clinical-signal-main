import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { enforceCapability } from "@/lib/auth/require-role";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { patientBelongsToTenant } from "@/lib/records";
import { protocolBelongsToPatient } from "@/lib/protocols";
import {
  getDialogueForProtocol,
  answerDialogueQuestion,
  extractKnowledge,
} from "@/lib/clinical-dialogue";
import { logError } from "@/lib/logger";

/** Get clinical dialogue questions for a protocol. */
export async function GET(
  _req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

    const protocolOk = await protocolBelongsToPatient(
      user.tenantId, ctx.params.protocolId, ctx.params.id,
    );
    if (!protocolOk) return apiError(ERROR_CODES.NOT_FOUND, 404);

    const dialogue = await getDialogueForProtocol(user.tenantId, ctx.params.protocolId);
    return NextResponse.json({ questions: dialogue });
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}

/** Answer a clinical dialogue question. */
export async function POST(
  req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const denied = await enforceCapability(user, "edit_protocol");
    if (denied) return denied;

    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

    const body = (await req.json()) as {
      questionId: string;
      answer: string;
    };

    if (!body.questionId || !body.answer?.trim()) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }

    await answerDialogueQuestion(user.tenantId, body.questionId, body.answer);

    // After answering, trigger knowledge extraction in the background
    extractKnowledge(user.tenantId, user.practitionerId)
      .catch((err) => logError("clinical-dialogue", "Knowledge extraction failed:", err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
