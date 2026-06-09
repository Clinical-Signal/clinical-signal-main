import { createSmtpTransport } from "@/lib/email/smtp-transport";
import { env } from "@/lib/env";

import { buildIntakeLinkEmailContent } from "./build-intake-link-email";

export type DispatchIntakeEmailInput = {
  patientEmail: string;
  intakeUrl: string;
};

/** Sends the intake magic link to the patient's email via production SMTP. */
export async function dispatchIntakeEmail(input: DispatchIntakeEmailInput): Promise<void> {
  const transport = createSmtpTransport();
  const { subject, text, html } = buildIntakeLinkEmailContent(input.intakeUrl);

  await transport.sendMail({
    from: env.EMAIL_FROM_ADDRESS,
    to: input.patientEmail,
    subject,
    text,
    html,
  });
}
