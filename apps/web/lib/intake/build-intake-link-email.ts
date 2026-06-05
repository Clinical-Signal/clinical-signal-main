export function buildIntakeLinkEmailContent(intakeUrl: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Complete your Clinical Signal intake";
  const text = [
    "Your practitioner invited you to complete a secure health intake form.",
    "",
    `Open your intake form: ${intakeUrl}`,
    "",
    "This link is personal to you. If you did not expect this email, contact your practitioner.",
  ].join("\n");

  const html = `
<p>Your practitioner invited you to complete a secure health intake form.</p>
<p><a href="${intakeUrl}">Open your intake form</a></p>
<p style="color:#666;font-size:14px;">This link is personal to you. If you did not expect this email, contact your practitioner.</p>
`.trim();

  return { subject, text, html };
}
