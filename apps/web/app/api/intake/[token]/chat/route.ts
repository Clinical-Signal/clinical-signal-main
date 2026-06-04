import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import { getOpenRouterChatModel } from "@/lib/llm/openrouter";
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
        model: getOpenRouterChatModel(),
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
      });
    } catch (error) {
      console.error("[CHAT_API_ERROR]", error);
      const message =
        error instanceof Error ? error.message : "Chat request failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof IntakeTokenError) {
      return tokenErrorResponse(error);
    }
    console.error(LOG, error instanceof Error ? error.message : error);
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
