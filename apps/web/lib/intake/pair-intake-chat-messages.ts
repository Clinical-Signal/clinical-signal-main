import { INTAKE_CHAT_KICKOFF_MESSAGE } from "@/lib/intake/intake-chat-constants";
import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";
import { stripCompleteMarker } from "@/lib/intake/intake-chat-markers";

export type IntakeChatQaPair = {
  question: string;
  answer: string;
};

function visibleChatMessages(messages: IntakeChatMessageRow[]): IntakeChatMessageRow[] {
  return messages.filter(
    (message) =>
      !(message.role === "user" && message.content.trim() === INTAKE_CHAT_KICKOFF_MESSAGE),
  );
}

/** Pairs each assistant turn with the following patient reply for Q&A display. */
export function pairIntakeChatMessages(messages: IntakeChatMessageRow[]): IntakeChatQaPair[] {
  const pairs: IntakeChatQaPair[] = [];
  let pendingQuestion: string | null = null;

  for (const message of visibleChatMessages(messages)) {
    if (message.role === "assistant") {
      const { displayText } = stripCompleteMarker(message.content);
      const trimmed = displayText.trim();
      if (trimmed) {
        pendingQuestion = trimmed;
      }
      continue;
    }

    if (message.role !== "user") {
      continue;
    }

    const answer = message.content.trim();
    if (!answer || !pendingQuestion) {
      continue;
    }

    pairs.push({ question: pendingQuestion, answer });
    pendingQuestion = null;
  }

  return pairs;
}
