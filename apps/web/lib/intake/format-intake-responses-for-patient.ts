import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";
import { INTAKE_CHAT_KICKOFF_MESSAGE } from "@/lib/intake/intake-chat-constants";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import { INTAKE_EMAIL_THEME as t } from "@/lib/intake/email/intake-email-theme";

function patientChatLines(messages: IntakeChatMessageRow[]): IntakeChatMessageRow[] {
  return messages.filter(
    (m) =>
      m.role === "user" &&
      m.content.trim() &&
      m.content.trim() !== INTAKE_CHAT_KICKOFF_MESSAGE,
  );
}

function line(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  return `${label}: ${trimmed}`;
}

export function formatIntakeResponsesPlainText(
  intakeData: IntakeData,
  chatMessages: IntakeChatMessageRow[],
): string {
  const lines: string[] = ["Your intake responses", ""];

  const { about_you, why_here, symptoms } = intakeData;
  const stepOne = [
    line("Name", about_you.full_name),
    line("Date of birth", about_you.date_of_birth),
    line("What brings you in", why_here.what_brings_you),
    line("Top goals", why_here.top_three_goals),
    line("Top health concerns", symptoms.top_concerns),
  ].filter(Boolean);

  if (stepOne.length > 0) {
    lines.push("Step 1 — Baseline intake", ...stepOne, "");
  }

  const patientChat = patientChatLines(chatMessages);
  if (patientChat.length > 0) {
    lines.push("Step 2 — Follow-up responses");
    for (const message of patientChat) {
      lines.push(`- ${message.content.trim()}`);
    }
    lines.push("");
  }

  lines.push("Thank you for completing your intake. Your practitioner will review these responses.");
  return lines.join("\n");
}

export function formatIntakeResponsesHtml(
  intakeData: IntakeData,
  chatMessages: IntakeChatMessageRow[],
): string {
  const { about_you, why_here, symptoms } = intakeData;
  const fields = [
    { label: "Name", value: about_you.full_name },
    { label: "Date of birth", value: about_you.date_of_birth },
    { label: "What brings you in", value: why_here.what_brings_you },
    { label: "Top goals", value: why_here.top_three_goals },
    { label: "Top health concerns", value: symptoms.top_concerns },
  ].filter((f) => f.value?.trim());

  const stepOneHtml =
    fields.length > 0
      ? `<h2 style="margin:0 0 12px;font-size:18px;color:${t.ink};">Step 1 — Baseline intake</h2>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
           ${fields
             .map(
               (f) => `<tr>
                 <td style="padding:8px 0;border-bottom:1px solid ${t.line};vertical-align:top;width:38%;font-size:13px;font-weight:600;color:${t.inkSubtle};">${f.label}</td>
                 <td style="padding:8px 0;border-bottom:1px solid ${t.line};font-size:14px;color:${t.ink};white-space:pre-wrap;">${escapeHtml(f.value!.trim())}</td>
               </tr>`,
             )
             .join("")}
         </table>`
      : "";

  const patientChat = patientChatLines(chatMessages);
  const stepTwoHtml =
    patientChat.length > 0
      ? `<h2 style="margin:0 0 12px;font-size:18px;color:${t.ink};">Step 2 — Follow-up responses</h2>
         <ul style="margin:0 0 24px;padding-left:20px;color:${t.inkMuted};">
           ${patientChat.map((m) => `<li style="margin:0 0 8px;">${escapeHtml(m.content.trim())}</li>`).join("")}
         </ul>`
      : "";

  return `
    <p style="margin:0 0 16px;color:${t.ink};">Thank you for completing your intake.</p>
    <p style="margin:0 0 24px;">Below is a copy of the responses you provided. Your practitioner will review them before your next steps.</p>
    ${stepOneHtml}
    ${stepTwoHtml}
    <p style="margin:0;font-size:14px;color:${t.inkSubtle};">If anything looks incorrect, contact your practitioner.</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
