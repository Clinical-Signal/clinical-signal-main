import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import { logSafeError } from "@/lib/log-safe";
import { getBedrockChatModel } from "@/lib/llm/bedrock";
import { listMainIntakeChatMessages } from "@/lib/intake/intake-chat-store";
import { runIntakeChatTurn } from "@/lib/intake/run-intake-chat-turn";
import { getPatientIntakeState } from "@/lib/intake/patient-intake-store";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const LOG = "[api/intake/chat]";

const BodySchema = z.object({
  message: z.string().max(4000),
});

export async function POST(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token?.trim();
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });

    const state = await getPatientIntakeState(verified.tenantId, verified.patientId);
    if (!state) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    try {
      const chatMessages = await listMainIntakeChatMessages(
        verified.tenantId,
        verified.tokenId,
      );

      const result = await runIntakeChatTurn({
        tenantId: verified.tenantId,
        intakeTokenId: verified.tokenId,
        intakeData: state.intakeData,
        userMessage: body.message,
        model: getBedrockChatModel(),
        existingMessages: chatMessages,
      });

      await writeAudit({
        tenantId: verified.tenantId,
        actorId: null,
        action: "intake_chat_turn_completed",
        entity: "token",
        entityId: verified.tokenId,
        payload: {
          interviewComplete: result.interviewComplete,
          canFinish: result.canFinish,
          isComplete: result.isComplete,
          totalMessages: result.totalMessages,
          userTurns: result.userTurns,
          assistantTurns: result.assistantTurns,
        },
      });

      return NextResponse.json({
        reply: result.reply,
        interviewComplete: result.interviewComplete,
        canFinish: result.canFinish,
        isComplete: result.isComplete,
        totalMessages: result.totalMessages,
        userTurns: result.userTurns,
        assistantTurns: result.assistantTurns,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
      });
    } catch (error) {
      logSafeError("[CHAT_API_ERROR]", error);
      return NextResponse.json({ error: "CHAT_REQUEST_FAILED" }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof IntakeTokenError) {
      return tokenErrorResponse(error);
    }
    logSafeError(LOG, error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
