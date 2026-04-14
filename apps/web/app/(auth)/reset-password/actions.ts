"use server";

import { randomBytes, createHash } from "node:crypto";
import { pool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

// MVP stub: generates a reset token, stores its hash, and logs the reset link
// to the server console. Wiring to a real email provider lands with the
// transactional-email issue.
export async function requestResetAction(
  _prev: { message?: string } | undefined,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const { rows } = await pool.query<{ id: string; tenant_id: string }>(
    "SELECT id, tenant_id FROM practitioners WHERE email_lower = $1",
    [email],
  );
  const row = rows[0];
  // Always return the same message to avoid user enumeration.
  const genericMessage = "If that email has an account, a reset link has been sent.";
  if (!row) return { message: genericMessage };

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expires = new Date(Date.now() + 30 * 60_000);
  await pool.query(
    `INSERT INTO password_reset_tokens (token_hash, practitioner_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, row.id, expires],
  );
  await writeAudit({
    action: "password_reset_requested",
    tenantId: row.tenant_id,
    practitionerId: row.id,
  });

  // eslint-disable-next-line no-console
  console.log(`[password-reset] Link for ${email}: /reset-password/confirm?token=${raw}`);
  return { message: genericMessage };
}
