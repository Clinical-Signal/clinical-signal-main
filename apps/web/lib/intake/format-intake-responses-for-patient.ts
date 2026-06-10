import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";
import { INTAKE_EMAIL_THEME as t } from "@/lib/intake/email/intake-email-theme";
import {
  formatStepOneForDisplay,
  groupStepOneDisplayEntries,
  NOT_PROVIDED,
} from "@/lib/intake/format-step-one-for-display";
import { formatQuestionAnswer, UNANSWERED_LABEL } from "@/lib/intake/format-question-answer";
import { pairIntakeChatMessages } from "@/lib/intake/pair-intake-chat-messages";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import {
  buildFlatSteps,
  extractStepTwoAnswers,
  extractStepTwoPlan,
} from "@/lib/intake/step-two-storage";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stepOnePlainText(intakeData: IntakeData): string[] {
  const lines: string[] = ["Step 1 — Initial form", ""];
  const sections = groupStepOneDisplayEntries(formatStepOneForDisplay(intakeData));

  for (const section of sections) {
    lines.push(section.sectionTitle);
    for (const field of section.fields) {
      lines.push(`Question: ${field.label}`);
      lines.push(`Answer: ${field.value}`);
      lines.push("");
    }
  }

  return lines;
}

function stepTwoStructuredPlainText(intakeData: IntakeData): string[] {
  const plan = extractStepTwoPlan(intakeData.step_two);
  const answers = extractStepTwoAnswers(intakeData.step_two);
  if (!plan) {
    return [];
  }

  const lines: string[] = ["Step 2 — Structured follow-up", ""];
  for (const step of buildFlatSteps(plan)) {
    const answer =
      formatQuestionAnswer(step.question, answers[step.question.id]) ?? UNANSWERED_LABEL;
    lines.push(`Question: ${step.question.prompt}`);
    lines.push(`Answer: ${answer}`);
    lines.push("");
  }

  return lines;
}

function stepTwoChatPlainText(chatMessages: IntakeChatMessageRow[]): string[] {
  const pairs = pairIntakeChatMessages(chatMessages);
  if (pairs.length === 0) {
    return [];
  }

  const lines: string[] = ["Step 2 — Clinical chat", ""];
  for (const pair of pairs) {
    lines.push(`Question: ${pair.question}`);
    lines.push(`Answer: ${pair.answer.trim() || NOT_PROVIDED}`);
    lines.push("");
  }

  return lines;
}

export function formatIntakeResponsesPlainText(
  intakeData: IntakeData,
  chatMessages: IntakeChatMessageRow[],
): string {
  const lines = [
    "Your intake responses",
    "",
    ...stepOnePlainText(intakeData),
    ...stepTwoStructuredPlainText(intakeData),
    ...stepTwoChatPlainText(chatMessages),
    "Thank you for completing your intake. Your practitioner will review these responses.",
  ];

  return lines.join("\n");
}

function stepOneHtml(intakeData: IntakeData): string {
  const sections = groupStepOneDisplayEntries(formatStepOneForDisplay(intakeData));
  if (sections.length === 0) {
    return "";
  }

  const body = sections
    .map(
      (section) => `<h3 style="margin:16px 0 8px;font-size:16px;color:${t.ink};">${escapeHtml(section.sectionTitle)}</h3>
        ${section.fields
          .map(
            (field) => `<p style="margin:0 0 12px;font-size:14px;color:${t.ink};">
              <strong>Question:</strong> ${escapeHtml(field.label)}<br />
              <em>Answer:</em> ${escapeHtml(field.value)}
            </p>`,
          )
          .join("")}`,
    )
    .join("");

  return `<h2 style="margin:0 0 12px;font-size:18px;color:${t.ink};">Step 1 — Initial form</h2>${body}`;
}

function stepTwoStructuredHtml(intakeData: IntakeData): string {
  const plan = extractStepTwoPlan(intakeData.step_two);
  const answers = extractStepTwoAnswers(intakeData.step_two);
  if (!plan) {
    return "";
  }

  const rows = buildFlatSteps(plan)
    .map((step) => {
      const answer =
        formatQuestionAnswer(step.question, answers[step.question.id]) ?? UNANSWERED_LABEL;
      return `<p style="margin:0 0 12px;font-size:14px;color:${t.ink};">
        <strong>Question:</strong> ${escapeHtml(step.question.prompt)}<br />
        <em>Answer:</em> ${escapeHtml(answer)}
      </p>`;
    })
    .join("");

  return `<h2 style="margin:24px 0 12px;font-size:18px;color:${t.ink};">Step 2 — Structured follow-up</h2>${rows}`;
}

function stepTwoChatHtml(chatMessages: IntakeChatMessageRow[]): string {
  const pairs = pairIntakeChatMessages(chatMessages);
  if (pairs.length === 0) {
    return "";
  }

  const rows = pairs
    .map(
      (pair) => `<p style="margin:0 0 12px;font-size:14px;color:${t.ink};">
        <strong>Question:</strong> ${escapeHtml(pair.question)}<br />
        <em>Answer:</em> ${escapeHtml(pair.answer.trim() || NOT_PROVIDED)}
      </p>`,
    )
    .join("");

  return `<h2 style="margin:24px 0 12px;font-size:18px;color:${t.ink};">Step 2 — Clinical chat</h2>${rows}`;
}

export function formatIntakeResponsesHtml(
  intakeData: IntakeData,
  chatMessages: IntakeChatMessageRow[],
): string {
  const stepOne = stepOneHtml(intakeData);
  const stepTwoStructured = stepTwoStructuredHtml(intakeData);
  const stepTwoChat = stepTwoChatHtml(chatMessages);

  return `
    <p style="margin:0 0 16px;color:${t.ink};">Thank you for completing your intake.</p>
    <p style="margin:0 0 24px;">Below is a copy of the responses you provided. Your practitioner will review them before your next steps.</p>
    ${stepOne}
    ${stepTwoStructured}
    ${stepTwoChat}
    <p style="margin:24px 0 0;font-size:14px;color:${t.inkSubtle};">If anything looks incorrect, contact your practitioner.</p>`;
}
