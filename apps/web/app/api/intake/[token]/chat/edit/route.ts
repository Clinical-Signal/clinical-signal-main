import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAudit } from "@/lib/audit/write-audit";
import { evaluateChatEditSignificance } from "@/lib/intake/evaluate-chat-edit-significance";
import { INTAKE_CHAT_MINOR_EDIT_ACKNOWLEDGMENT } from "@/lib/intake/intake-chat-constants";
import {
  getIntakeChatMessageById,
  updateIntakeChatMessageContent,
} from "@/lib/intake/intake-chat-store";
import {
  branchRowsToUi,
  type EditChatMessageResponse,
} from "@/lib/intake/intake-chat-edit-response";
import { EditChatBodySchema } from "@/lib/intake/parse-edit-chat-body";
import { runIntakeChatBranchTurn } from "@/lib/intake/run-intake-chat-branch-turn";
import { logSafeError } from "@/lib/log-safe";
import { getBedrockChatModel } from "@/lib/llm/bedrock";
import { IntakeTokenError } from "@/lib/tokens/intake-token";
import { extractClientIp, tokenErrorResponse } from "@/lib/tokens/intake-token-api";
import { getIntakeTokenService } from "@/lib/tokens/intake-token-service";

export async function PUT(
  request: Request,
  ctx: { params: { token: string } },
): Promise<Response> {
  const rawToken = ctx.params.token?.trim();
  if (!rawToken) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
  }

  let body: z.infer<typeof EditChatBodySchema>;
  try {
    const raw = await request.json();
    body = EditChatBodySchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[ZOD_ERROR]", error.issues);
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const verified = await getIntakeTokenService().verify({
      rawToken,
      clientIp: extractClientIp(request),
    });

    const existing = await getIntakeChatMessageById({
      tenantId: verified.tenantId,
      intakeTokenId: verified.tokenId,
      messageId: body.messageId,
    });

    if (!existing || existing.role !== "user") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (existing.parentMessageId) {
      return NextResponse.json({ error: "BRANCH_NOT_EDITABLE" }, { status: 400 });
    }

    const originalContent = existing.content;
    const editedContent = body.content.trim();

    const model = getBedrockChatModel();

    const gate = await evaluateChatEditSignificance({
      original: originalContent,
      edited: editedContent,
      model,
    });

    await updateIntakeChatMessageContent({
      tenantId: verified.tenantId,
      intakeTokenId: verified.tokenId,
      messageId: body.messageId,
      content: editedContent,
    });

    await writeAudit({
      tenantId: verified.tenantId,
      actorId: null,
      action: "intake_chat_message_edited",
      entity: "token",
      entityId: verified.tokenId,
      payload: {
        messageId: body.messageId,
        isSignificantChange: gate.isSignificantChange,
      },
    });

    if (!gate.isSignificantChange) {
      const response: EditChatMessageResponse = {
        isSignificantChange: false,
        reason: gate.reason,
        messageId: body.messageId,
        content: editedContent,
        acknowledgment: INTAKE_CHAT_MINOR_EDIT_ACKNOWLEDGMENT,
      };
      return NextResponse.json(response);
    }

    const branch = await runIntakeChatBranchTurn({
      tenantId: verified.tenantId,
      intakeTokenId: verified.tokenId,
      parentMessageId: body.messageId,
      originalContent,
      editedContent,
      gatekeeperReason: gate.reason,
      model,
    });

    const response: EditChatMessageResponse = {
      isSignificantChange: true,
      reason: gate.reason,
      messageId: body.messageId,
      content: editedContent,
      originalContent,
      parentMessageId: body.messageId,
      branch: branchRowsToUi(body.messageId, branch.branchMessages, branch.branchComplete),
      firstReply: branch.reply,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof IntakeTokenError) {
      return tokenErrorResponse(error);
    }
    logSafeError("[CHAT_EDIT_ERROR]", error);
    return NextResponse.json({ error: "EDIT_FAILED" }, { status: 500 });
  }
}
