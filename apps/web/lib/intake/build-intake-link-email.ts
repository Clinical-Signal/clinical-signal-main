import {
  intakeEmailButton,
  wrapIntakeEmailHtml,
} from "@/lib/intake/email/intake-email-layout";
import { INTAKE_EMAIL_THEME as t } from "@/lib/intake/email/intake-email-theme";

export function buildIntakeLinkEmailContent(intakeUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Complete your Clinical Signal intake";
  const text = [
    "Hello,",
    "",
    "Your practitioner invited you to complete a secure health intake form through Clinical Signal.",
    "",
    `Open your intake form: ${intakeUrl}`,
    "",
    "This link is personal to you. If you did not expect this email, contact your practitioner.",
    "",
    "Secure, encrypted, and HIPAA-compliant patient intake.",
  ].join("\n");

  const bodyHtml = `
    <p style="margin:0 0 16px;color:${t.ink};">Hello,</p>
    <p style="margin:0 0 24px;">
      Your practitioner invited you to complete a secure health intake form. Please use the button below to open your personal intake link.
    </p>
    ${intakeEmailButton(intakeUrl, "Open your intake form")}
    <p style="margin:0 0 8px;font-size:14px;color:${t.inkSubtle};">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:14px;word-break:break-all;">
      <a href="${intakeUrl}" style="color:${t.accent};text-decoration:underline;">${intakeUrl}</a>
    </p>
    <p style="margin:0;font-size:14px;color:${t.inkSubtle};">
      This link is personal to you. If you did not expect this email, contact your practitioner.
    </p>`;

  const html = wrapIntakeEmailHtml({
    subject,
    preheader: "Your secure intake link is ready.",
    bodyHtml,
  });

  return { subject, text, html };
}
