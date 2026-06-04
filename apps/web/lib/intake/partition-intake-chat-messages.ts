import { stripBranchCompleteMarker } from "./intake-chat-branch-markers";
import { stripCompleteMarker } from "./intake-chat-markers";
import type { IntakeChatMessageRow } from "./intake-chat-store";

export type UiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type UiChatBranch = {
  parentMessageId: string;
  messages: UiChatMessage[];
  isComplete: boolean;
};

function toUiMessage(row: IntakeChatMessageRow): UiChatMessage | null {
  if (row.role !== "user" && row.role !== "assistant") {
    return null;
  }
  if (row.role === "assistant") {
    const main = stripCompleteMarker(row.content);
    const branch = stripBranchCompleteMarker(main.displayText);
    return {
      id: row.id,
      role: "assistant",
      content: branch.displayText,
    };
  }
  return { id: row.id, role: "user", content: row.content };
}

export function partitionIntakeChatRows(rows: IntakeChatMessageRow[]): {
  mainMessages: UiChatMessage[];
  branches: Record<string, UiChatBranch>;
} {
  const mainRows = rows.filter((row) => !row.parentMessageId);
  const branchRows = rows.filter((row) => row.parentMessageId);

  const mainMessages: UiChatMessage[] = [];
  for (const row of mainRows) {
    const message = toUiMessage(row);
    if (message) {
      mainMessages.push(message);
    }
  }

  const branches: Record<string, UiChatBranch> = {};
  for (const row of branchRows) {
    const parentId = row.parentMessageId!;
    if (!branches[parentId]) {
      branches[parentId] = {
        parentMessageId: parentId,
        messages: [],
        isComplete: false,
      };
    }
    const message = toUiMessage(row);
    if (!message) {
      continue;
    }
    branches[parentId].messages.push(message);
    if (
      row.role === "assistant" &&
      row.content.includes("[INTAKE_BRANCH_COMPLETE]")
    ) {
      branches[parentId].isComplete = true;
    }
  }

  return { mainMessages, branches };
}
