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

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#0f172a;padding:24px 32px;">
                <p style="margin:0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">Clinical Signal</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">Hello,</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#334155;">
                  Your practitioner invited you to complete a secure health intake form. Please use the button below to open your personal intake link.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="border-radius:8px;background-color:#2563eb;">
                      <a href="${intakeUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#2563eb;">
                        Open your intake form
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#64748b;">
                  If the button does not work, copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;word-break:break-all;">
                  <a href="${intakeUrl}" style="color:#2563eb;text-decoration:underline;">${intakeUrl}</a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
                  This link is personal to you. If you did not expect this email, contact your practitioner.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">
                  Secure, encrypted, and HIPAA-compliant patient intake.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
