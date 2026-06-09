import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";
import { wrapIntakeEmailHtml } from "@/lib/intake/email/intake-email-layout";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";

import {
  formatIntakeResponsesHtml,
  formatIntakeResponsesPlainText,
} from "./format-intake-responses-for-patient";

export function buildIntakeConfirmationEmailContent(input: {
  intakeData: IntakeData;
  chatMessages: IntakeChatMessageRow[];
}): { subject: string; text: string; html: string } {
  const subject = "Your Clinical Signal intake responses";
  const text = formatIntakeResponsesPlainText(input.intakeData, input.chatMessages);
  const html = wrapIntakeEmailHtml({
    subject,
    preheader: "A copy of your submitted intake responses.",
    bodyHtml: formatIntakeResponsesHtml(input.intakeData, input.chatMessages),
  });

  return { subject, text, html };
}
