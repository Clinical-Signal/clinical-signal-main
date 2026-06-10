import { INTAKE_EMAIL_THEME as t } from "./intake-email-theme";

export type IntakeEmailLayoutInput = {
  subject: string;
  preheader?: string;
  bodyHtml: string;
  footerNote?: string;
};

/** Shared HTML shell for all patient intake emails (magic link + confirmation). */
export function wrapIntakeEmailHtml(input: IntakeEmailLayoutInput): string {
  const footer =
    input.footerNote ??
    "Secure, encrypted, and HIPAA-compliant patient intake.";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${t.canvas};font-family:Georgia,'Times New Roman',serif;color:${t.ink};">
    ${
      input.preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.preheader)}</div>`
        : ""
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${t.canvas};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:${t.surface};border:1px solid ${t.line};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background-color:${t.accent};padding:24px 32px;">
                <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Clinical Signal</p>
                <p style="margin:8px 0 0;font-size:22px;font-weight:600;line-height:1.3;color:#FFFFFF;">Functional health intake</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${t.inkMuted};">
                ${input.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid ${t.line};background-color:${t.canvas};">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${t.inkSubtle};text-align:center;">
                  ${escapeHtml(footer)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function intakeEmailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr>
      <td align="center" style="border-radius:8px;background-color:${t.accent};">
        <a href="${escapeAttr(href)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:8px;background-color:${t.accent};">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
