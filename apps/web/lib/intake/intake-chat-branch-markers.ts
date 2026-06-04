import { INTAKE_CHAT_BRANCH_COMPLETE_MARKER } from "./intake-chat-constants";

export function stripBranchCompleteMarker(text: string): {
  displayText: string;
  branchComplete: boolean;
} {
  const branchComplete = text.includes(INTAKE_CHAT_BRANCH_COMPLETE_MARKER);
  const displayText = text.replace(INTAKE_CHAT_BRANCH_COMPLETE_MARKER, "").trim();
  return { displayText, branchComplete };
}
