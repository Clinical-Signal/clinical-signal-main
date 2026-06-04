import type { LanguageModel } from "ai";
import { generateText } from "ai";

import { getOpenRouterChatModel } from "@/lib/llm/openrouter";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";

import { buildStepTwoChatSystemPrompt } from "./build-step-two-chat-system-prompt";
import {
  budgetForcesTermination,
  computeIntakeChatBudget,
  resolveIntakeChatIsComplete,
} from "./intake-chat-budget";
import {
  buildIntakeChatClosingMessage,
  extractPatientFirstName,
  responseSignalsInterviewComplete,
} from "./intake-chat-closing";
import {
  INTAKE_CHAT_MAX_ASSISTANT_TURNS,
  INTAKE_CHAT_KICKOFF_MESSAGE,
} from "./intake-chat-constants";
import { stripCompleteMarker } from "./intake-chat-markers";
import {
  insertIntakeChatMessage,
  listIntakeChatMessages,
  type IntakeChatMessageRow,
} from "./intake-chat-store";

function isKickoffMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length === 0 || trimmed === INTAKE_CHAT_KICKOFF_MESSAGE;
}

function buildStepOneContextBlock(intakeData: IntakeData): string {
  const payload = {
    about_you: intakeData.about_you,
    why_here: intakeData.why_here,
    symptoms: intakeData.symptoms,
    history: intakeData.history,
    lifestyle: intakeData.lifestyle,
    hormones: intakeData.hormones,
    medications: intakeData.medications,
    previous_labs: intakeData.previous_labs,
    wearables: intakeData.wearables,
    anything_else: intakeData.anything_else,
  };
  return `Patient Step 1 baseline (JSON):\n${JSON.stringify(payload)}`;
}

function toModelMessages(rows: IntakeChatMessageRow[]) {
  return rows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));
}

export type RunIntakeChatTurnInput = {
  tenantId: string;
  intakeTokenId: string;
  intakeData: IntakeData;
  userMessage: string;
  /** OpenRouter model via `@ai-sdk/openai` custom provider (`.chat()`). */
  model?: LanguageModel;
  /** When provided (e.g. from the chat route), avoids a duplicate list query. */
  existingMessages?: IntakeChatMessageRow[];
};

export type RunIntakeChatTurnResult = {
  reply: string;
  interviewComplete: boolean;
  canFinish: boolean;
  isComplete: boolean;
  totalMessages: number;
  userTurns: number;
  assistantTurns: number;
};

async function persistForcedClosingTurn(input: {
  tenantId: string;
  intakeTokenId: string;
  firstName: string;
  messages: IntakeChatMessageRow[];
}): Promise<RunIntakeChatTurnResult> {
  const closing = buildIntakeChatClosingMessage(input.firstName);
  const last = input.messages.at(-1);
  if (last?.role === "assistant" && responseSignalsInterviewComplete(last.content)) {
    const { displayText } = stripCompleteMarker(last.content);
    const budget = computeIntakeChatBudget(input.messages);
    return {
      reply: displayText,
      interviewComplete: true,
      canFinish: true,
      isComplete: true,
      totalMessages: budget.totalMessages,
      userTurns: budget.userTurns,
      assistantTurns: budget.assistantTurns,
    };
  }

  await insertIntakeChatMessage({
    tenantId: input.tenantId,
    intakeTokenId: input.intakeTokenId,
    role: "assistant",
    content: closing,
  });

  const refreshed = await listIntakeChatMessages(
    input.tenantId,
    input.intakeTokenId,
  );
  const budget = computeIntakeChatBudget(refreshed);
  const { displayText } = stripCompleteMarker(closing);

  return {
    reply: displayText,
    interviewComplete: true,
    canFinish: true,
    isComplete: true,
    totalMessages: budget.totalMessages,
    userTurns: budget.userTurns,
    assistantTurns: budget.assistantTurns,
  };
}

export async function runIntakeChatTurn(
  input: RunIntakeChatTurnInput,
): Promise<RunIntakeChatTurnResult> {
  const firstName = extractPatientFirstName(input.intakeData.about_you?.full_name);
  const kickoff = isKickoffMessage(input.userMessage);

  let messages =
    input.existingMessages ??
    (await listIntakeChatMessages(input.tenantId, input.intakeTokenId));

  let budget = computeIntakeChatBudget(messages);

  if (budgetForcesTermination(budget)) {
    return persistForcedClosingTurn({
      tenantId: input.tenantId,
      intakeTokenId: input.intakeTokenId,
      firstName,
      messages,
    });
  }

  if (!kickoff) {
    if (budget.atUserCeiling) {
      return persistForcedClosingTurn({
        tenantId: input.tenantId,
        intakeTokenId: input.intakeTokenId,
        firstName,
        messages,
      });
    }

    await insertIntakeChatMessage({
      tenantId: input.tenantId,
      intakeTokenId: input.intakeTokenId,
      role: "user",
      content: input.userMessage.trim(),
    });

    messages = await listIntakeChatMessages(input.tenantId, input.intakeTokenId);
    budget = computeIntakeChatBudget(messages);

    if (budgetForcesTermination(budget)) {
      return persistForcedClosingTurn({
        tenantId: input.tenantId,
        intakeTokenId: input.intakeTokenId,
        firstName,
        messages,
      });
    }
  }

  if (budget.nextAssistantTurn > INTAKE_CHAT_MAX_ASSISTANT_TURNS) {
    return persistForcedClosingTurn({
      tenantId: input.tenantId,
      intakeTokenId: input.intakeTokenId,
      firstName,
      messages,
    });
  }

  const modelMessages = toModelMessages(messages);
  if (modelMessages.length === 0) {
    modelMessages.push({
      role: "user",
      content: buildStepOneContextBlock(input.intakeData),
    });
  }

  const { text } = await generateText({
    model: input.model ?? getOpenRouterChatModel(),
    system: buildStepTwoChatSystemPrompt({
      assistantTurn: budget.nextAssistantTurn,
      patientFirstName: firstName,
    }),
    messages: modelMessages,
  });

  const { displayText, interviewComplete: markerComplete } = stripCompleteMarker(text);
  const phraseComplete = responseSignalsInterviewComplete(text);

  await insertIntakeChatMessage({
    tenantId: input.tenantId,
    intakeTokenId: input.intakeTokenId,
    role: "assistant",
    content: text,
  });

  const refreshed = await listIntakeChatMessages(input.tenantId, input.intakeTokenId);
  const finalBudget = computeIntakeChatBudget(refreshed);
  const isComplete = resolveIntakeChatIsComplete({
    budget: finalBudget,
    assistantReply: text,
    interviewCompleteMarker: markerComplete || phraseComplete,
  });

  return {
    reply: displayText,
    interviewComplete: isComplete,
    canFinish: isComplete,
    isComplete,
    totalMessages: finalBudget.totalMessages,
    userTurns: finalBudget.userTurns,
    assistantTurns: finalBudget.assistantTurns,
  };
}
