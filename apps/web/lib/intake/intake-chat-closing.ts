import {
  INTAKE_CHAT_COMPLETE_MARKER,
  INTAKE_CHAT_FINISH_PROMPT_FINGERPRINT,
} from "./intake-chat-constants";

export function extractPatientFirstName(fullName: string | undefined): string {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0] ?? "there";
}

export function buildIntakeChatClosingMessage(firstName: string): string {
  return `Thank you, ${firstName}. I have gathered all the necessary details for your practitioner. Please tap the Finish button below to complete your intake.\n\n${INTAKE_CHAT_COMPLETE_MARKER}`;
}

export function responseSignalsInterviewComplete(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    text.includes(INTAKE_CHAT_COMPLETE_MARKER) ||
    normalized.includes(INTAKE_CHAT_FINISH_PROMPT_FINGERPRINT)
  );
}
