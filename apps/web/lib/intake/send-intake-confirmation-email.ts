import { createSmtpTransport } from "@/lib/email/smtp-transport";
import { env } from "@/lib/env";
import { logSafeError } from "@/lib/log-safe";

import { createEmptyIntakeData } from "@/lib/intake/schemas/intake-data.schema";

import { buildIntakeConfirmationEmailContent } from "./build-intake-confirmation-email";
import { listMainIntakeChatMessages } from "./intake-chat-store";
import { getPatientIntakeState } from "./patient-intake-store";
import { resolvePatientIntakeEmail } from "./resolve-patient-intake-email";

/** Sends patient a copy of their submitted intake responses (non-blocking caller). */
export async function sendIntakeConfirmationEmail(input: {
  tenantId: string;
  patientId: string;
  intakeTokenId: string;
}): Promise<void> {
  const state = await getPatientIntakeState(input.tenantId, input.patientId);
  const patientEmail = resolvePatientIntakeEmail(state?.intakeData);
  if (!patientEmail) {
    logSafeError("[send-intake-confirmation] skipped_no_email", undefined);
    return;
  }

  const chatMessages = await listMainIntakeChatMessages(
    input.tenantId,
    input.intakeTokenId,
  );

  const { subject, text, html } = buildIntakeConfirmationEmailContent({
    intakeData: state?.intakeData ?? createEmptyIntakeData(),
    chatMessages,
  });

  const transport = createSmtpTransport();
  await transport.sendMail({
    from: env.EMAIL_FROM_ADDRESS,
    to: patientEmail,
    subject,
    text,
    html,
  });
}
