import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import {
  branchRowsToUi,
  type BranchChatResponse,
} from "@/lib/intake/intake-chat-edit-response";
import { getIntakeChatMessageById } from "@/lib/intake/intake-chat-store";
import { runIntakeChatBranchTurn } from "@/lib/intake/run-intake-chat-branch-turn";
import { logSafeError } from "@/lib/log-safe";
import { getBedrockChatModel } from "@/lib/llm/bedrock";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

const BodySchema = z.object({
  parentMessageId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  originalContent: z.string().min(1).max(4000),
  editedContent: z.string().min(1).max(4000),
  gatekeeperReason: z.string().min(1).max(280),
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

    const anchor = await getIntakeChatMessageById({
      tenantId: verified.tenantId,
      intakeTokenId: verified.tokenId,
      messageId: body.parentMessageId,
    });

    if (!anchor || anchor.role !== "user" || anchor.parentMessageId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const result = await runIntakeChatBranchTurn({
      tenantId: verified.tenantId,
      intakeTokenId: verified.tokenId,
      parentMessageId: body.parentMessageId,
      originalContent: body.originalContent,
      editedContent: body.editedContent,
      gatekeeperReason: body.gatekeeperReason,
      userMessage: body.message,
      model: getBedrockChatModel(),
    });

    await writeAudit({
      tenantId: verified.tenantId,
      actorId: null,
      action: "intake_chat_branch_turn_completed",
      entity: "token",
      entityId: verified.tokenId,
      payload: {
        parentMessageId: body.parentMessageId,
        branchComplete: result.branchComplete,
      },
    });

    const response: BranchChatResponse = {
      reply: result.reply,
      branchComplete: result.branchComplete,
      branch: branchRowsToUi(
        body.parentMessageId,
        result.branchMessages,
        result.branchComplete,
      ),
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof IntakeTokenError) {
      return tokenErrorResponse(error);
    }
    logSafeError("[CHAT_BRANCH_ERROR]", error);
    return NextResponse.json({ error: "BRANCH_CHAT_FAILED" }, { status: 500 });
  }
}
