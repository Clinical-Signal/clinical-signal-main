import {
  INTAKE_CHAT_KICKOFF_MESSAGE,
  INTAKE_CHAT_MAX_ASSISTANT_TURNS,
  INTAKE_CHAT_MAX_TOTAL_MESSAGES,
  INTAKE_CHAT_MAX_USER_TURNS,
} from "./intake-chat-constants";
import { responseSignalsInterviewComplete } from "./intake-chat-closing";
import { stripCompleteMarker } from "./intake-chat-markers";
import type { IntakeChatMessageRow } from "./intake-chat-store";

type ChatRoleRow = Pick<IntakeChatMessageRow, "role" | "content">;

export type IntakeChatBudgetState = {
  totalMessages: number;
  userTurns: number;
  assistantTurns: number;
  nextAssistantTurn: number;
  atUserCeiling: boolean;
  atAssistantCeiling: boolean;
  atTotalCeiling: boolean;
};

export function computeIntakeChatBudget(
  messages: IntakeChatMessageRow[],
): IntakeChatBudgetState {
  const userTurns = messages.filter(
    (message) =>
      message.role === "user" && message.content !== INTAKE_CHAT_KICKOFF_MESSAGE,
  ).length;
  const assistantTurns = messages.filter(
    (message) => message.role === "assistant",
  ).length;
  const totalMessages = messages.length;

  return {
    totalMessages,
    userTurns,
    assistantTurns,
    nextAssistantTurn: assistantTurns + 1,
    atUserCeiling: userTurns >= INTAKE_CHAT_MAX_USER_TURNS,
    atAssistantCeiling: assistantTurns >= INTAKE_CHAT_MAX_ASSISTANT_TURNS,
    atTotalCeiling: totalMessages >= INTAKE_CHAT_MAX_TOTAL_MESSAGES,
  };
}

export function budgetForcesTermination(budget: IntakeChatBudgetState): boolean {
  return (
    budget.atUserCeiling || budget.atAssistantCeiling || budget.atTotalCeiling
  );
}

export function resolveIntakeChatIsComplete(input: {
  budget: IntakeChatBudgetState;
  assistantReply?: string;
  interviewCompleteMarker?: boolean;
}): boolean {
  if (budgetForcesTermination(input.budget)) {
    return true;
  }
  if (input.interviewCompleteMarker) {
    return true;
  }
  if (input.assistantReply && responseSignalsInterviewComplete(input.assistantReply)) {
    return true;
  }
  return false;
}

/** Client/server helper for persisted transcript rows. */
export function isIntakeChatCompleteFromMessages(messages: ChatRoleRow[]): boolean {
  const budget = computeIntakeChatBudget(
    messages.map((message, index) => ({
      id: String(index),
      role: message.role,
      content: message.content,
      parentMessageId: null,
      createdAt: new Date(0),
    })),
  );
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const markerComplete = lastAssistant
    ? stripCompleteMarker(lastAssistant.content).interviewComplete
    : false;

  return resolveIntakeChatIsComplete({
    budget,
    assistantReply: lastAssistant?.content,
    interviewCompleteMarker: markerComplete,
  });
}
