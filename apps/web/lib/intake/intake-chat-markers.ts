import { INTAKE_CHAT_COMPLETE_MARKER } from "./intake-chat-constants";

export function stripCompleteMarker(text: string): {
  displayText: string;
  interviewComplete: boolean;
} {
  const interviewComplete = text.includes(INTAKE_CHAT_COMPLETE_MARKER);
  const displayText = text.replace(INTAKE_CHAT_COMPLETE_MARKER, "").trim();
  return { displayText, interviewComplete };
}
