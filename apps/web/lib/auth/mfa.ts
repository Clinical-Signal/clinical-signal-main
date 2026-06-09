import { authenticator } from "otplib";
import QRCode from "qrcode";
import { withSystem } from "@cs/db";

const MFA_ISSUER = "Clinical Signal";

export function mfaCryptoKey(): string {
  const key =
    process.env.PGCRYPTO_KEY_REF_DEV ?? process.env.PHI_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "PGCRYPTO_KEY_REF_DEV or PHI_ENCRYPTION_KEY must be set for MFA secret encryption",
    );
  }
  return key;
}

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpauthUri(
  secret: string,
  email: string,
  issuer: string = MFA_ISSUER,
): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(code: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: code.trim(), secret });
  } catch {
    return false;
  }
}

export async function buildQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

export type MfaEnrollmentState = {
  enrolled: boolean;
  hasPendingSecret: boolean;
};

export async function getMfaEnrollmentState(
  practitionerId: string,
): Promise<MfaEnrollmentState> {
  return withSystem({ reason: "mfa_enrollment_state_lookup" }, async (c) => {
    const { rows } = await c.query<{
      mfa_enrolled_at: Date | null;
      mfa_secret_encrypted: Buffer | null;
    }>(
      `SELECT mfa_enrolled_at, mfa_secret_encrypted
         FROM practitioners
        WHERE id = $1`,
      [practitionerId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Practitioner not found");
    }
    return {
      enrolled: row.mfa_enrolled_at !== null,
      hasPendingSecret: row.mfa_secret_encrypted !== null && row.mfa_enrolled_at === null,
    };
  });
}

export async function loadMfaSecretPlaintext(
  practitionerId: string,
): Promise<string | null> {
  const key = mfaCryptoKey();
  return withSystem({ reason: "mfa_secret_decrypt" }, async (c) => {
    const { rows } = await c.query<{ secret: string | null }>(
      `SELECT CASE
         WHEN mfa_secret_encrypted IS NULL THEN NULL
         ELSE pgp_sym_decrypt(mfa_secret_encrypted, $2)::text
       END AS secret
         FROM practitioners
        WHERE id = $1`,
      [practitionerId, key],
    );
    return rows[0]?.secret ?? null;
  });
}

export async function storePendingMfaSecret(
  practitionerId: string,
  secret: string,
): Promise<void> {
  const key = mfaCryptoKey();
  await withSystem({ reason: "mfa_secret_pending_store" }, async (c) => {
    await c.query(
      `UPDATE practitioners
          SET mfa_secret_encrypted = pgp_sym_encrypt($2, $3),
              mfa_enrolled_at = NULL
        WHERE id = $1`,
      [practitionerId, secret, key],
    );
  });
}

export async function confirmMfaEnrollment(practitionerId: string): Promise<void> {
  await withSystem({ reason: "mfa_enrollment_confirm" }, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE practitioners
          SET mfa_enrolled_at = now()
        WHERE id = $1
          AND mfa_secret_encrypted IS NOT NULL`,
      [practitionerId],
    );
    if (rowCount === 0) {
      throw new Error("MFA enrollment cannot be confirmed without a stored secret");
    }
  });
}

export async function getOrCreateEnrollmentMaterial(args: {
  practitionerId: string;
  email: string;
}): Promise<{ secret: string; otpauthUri: string; qrDataUrl: string }> {
  const state = await getMfaEnrollmentState(args.practitionerId);
  if (state.enrolled) {
    throw new Error("MFA is already enrolled");
  }

  let secret = state.hasPendingSecret
    ? await loadMfaSecretPlaintext(args.practitionerId)
    : null;

  if (!secret) {
    secret = generateSecret();
    await storePendingMfaSecret(args.practitionerId, secret);
  }

  const otpauthUri = buildOtpauthUri(secret, args.email);
  const qrDataUrl = await buildQrDataUrl(otpauthUri);
  return { secret, otpauthUri, qrDataUrl };
}
