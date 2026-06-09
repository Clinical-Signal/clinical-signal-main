import type { LanguageModel } from "ai";
import { generateText } from "ai";

import { getBedrockChatModel } from "@/lib/llm/bedrock";

import { buildBranchChatSystemPrompt } from "./build-branch-chat-system-prompt";
import { stripBranchCompleteMarker } from "./intake-chat-branch-markers";
import {
  INTAKE_CHAT_BRANCH_COMPLETE_MARKER,
  INTAKE_CHAT_BRANCH_MAX_USER_TURNS,
} from "./intake-chat-constants";
import {
  insertIntakeChatMessage,
  listBranchIntakeChatMessages,
  type IntakeChatMessageRow,
} from "./intake-chat-store";

function countBranchUserTurns(messages: IntakeChatMessageRow[]): number {
  return messages.filter((message) => message.role === "user").length;
}

function toModelMessages(rows: IntakeChatMessageRow[]) {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
}

export type RunIntakeChatBranchTurnInput = {
  tenantId: string;
  intakeTokenId: string;
  parentMessageId: string;
  originalContent: string;
  editedContent: string;
  gatekeeperReason: string;
  userMessage?: string;
  model?: LanguageModel;
};

export type RunIntakeChatBranchTurnResult = {
  reply: string;
  branchComplete: boolean;
  branchMessages: IntakeChatMessageRow[];
};

async function persistBranchClosing(input: {
  tenantId: string;
  intakeTokenId: string;
  parentMessageId: string;
  text: string;
}): Promise<RunIntakeChatBranchTurnResult> {
  const closing = `${input.text}\n\n${INTAKE_CHAT_BRANCH_COMPLETE_MARKER}`;
  await insertIntakeChatMessage({
    tenantId: input.tenantId,
    intakeTokenId: input.intakeTokenId,
    parentMessageId: input.parentMessageId,
    role: "assistant",
    content: closing,
  });
  const branchMessages = await listBranchIntakeChatMessages(
    input.tenantId,
    input.intakeTokenId,
    input.parentMessageId,
  );
  const { displayText } = stripBranchCompleteMarker(closing);
  return {
    reply: displayText,
    branchComplete: true,
    branchMessages,
  };
}

export async function runIntakeChatBranchTurn(
  input: RunIntakeChatBranchTurnInput,
): Promise<RunIntakeChatBranchTurnResult> {
  let branchMessages = await listBranchIntakeChatMessages(
    input.tenantId,
    input.intakeTokenId,
    input.parentMessageId,
  );

  if (input.userMessage?.trim()) {
    const userTurns = countBranchUserTurns(branchMessages);
    if (userTurns >= INTAKE_CHAT_BRANCH_MAX_USER_TURNS) {
      return persistBranchClosing({
        tenantId: input.tenantId,
        intakeTokenId: input.intakeTokenId,
        parentMessageId: input.parentMessageId,
        text: "Thank you — that clarifies the update for your practitioner.",
      });
    }

    await insertIntakeChatMessage({
      tenantId: input.tenantId,
      intakeTokenId: input.intakeTokenId,
      parentMessageId: input.parentMessageId,
      role: "user",
      content: input.userMessage.trim(),
    });

    branchMessages = await listBranchIntakeChatMessages(
      input.tenantId,
      input.intakeTokenId,
      input.parentMessageId,
    );
  }

  const userTurns = countBranchUserTurns(branchMessages);
  if (userTurns >= INTAKE_CHAT_BRANCH_MAX_USER_TURNS) {
    return persistBranchClosing({
      tenantId: input.tenantId,
      intakeTokenId: input.intakeTokenId,
      parentMessageId: input.parentMessageId,
      text: "Thank you — that clarifies the update for your practitioner.",
    });
  }

  const modelMessages = toModelMessages(branchMessages);
  if (modelMessages.length === 0) {
    modelMessages.push({
      role: "user",
      content:
        "Please ask your first targeted follow-up about the patient's correction described in the session state.",
    });
  }

  const { text } = await generateText({
    model: input.model ?? getBedrockChatModel(),
    system: buildBranchChatSystemPrompt({
      originalContent: input.originalContent,
      editedContent: input.editedContent,
      gatekeeperReason: input.gatekeeperReason,
      branchUserTurns: userTurns,
    }),
    messages: modelMessages,
  });

  const { displayText, branchComplete } = stripBranchCompleteMarker(text);

  await insertIntakeChatMessage({
    tenantId: input.tenantId,
    intakeTokenId: input.intakeTokenId,
    parentMessageId: input.parentMessageId,
    role: "assistant",
    content: text,
  });

  const refreshed = await listBranchIntakeChatMessages(
    input.tenantId,
    input.intakeTokenId,
    input.parentMessageId,
  );

  return {
    reply: displayText,
    branchComplete,
    branchMessages: refreshed,
  };
}
