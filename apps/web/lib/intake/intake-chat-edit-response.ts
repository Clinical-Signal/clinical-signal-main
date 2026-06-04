import { stripBranchCompleteMarker } from "./intake-chat-branch-markers";
import type { IntakeChatMessageRow } from "./intake-chat-store";
import type { UiChatBranch, UiChatMessage } from "./partition-intake-chat-messages";

export type EditChatMessageResponse = {
  isSignificantChange: boolean;
  reason: string;
  messageId: string;
  content: string;
  originalContent?: string;
  acknowledgment?: string;
  parentMessageId?: string;
  branch?: UiChatBranch;
  firstReply?: string;
};

export type BranchChatResponse = {
  reply: string;
  branchComplete: boolean;
  branch: UiChatBranch;
};

function rowToUi(row: IntakeChatMessageRow): UiChatMessage | null {
  if (row.role !== "user" && row.role !== "assistant") {
    return null;
  }
  if (row.role === "assistant") {
    const { displayText } = stripBranchCompleteMarker(row.content);
    return { id: row.id, role: "assistant", content: displayText };
  }
  return { id: row.id, role: "user", content: row.content };
}

export function branchRowsToUi(
  parentMessageId: string,
  rows: IntakeChatMessageRow[],
  isComplete: boolean,
): UiChatBranch {
  const messages: UiChatMessage[] = [];
  for (const row of rows) {
    const message = rowToUi(row);
    if (message) {
      messages.push(message);
    }
  }
  return { parentMessageId, messages, isComplete };
}
