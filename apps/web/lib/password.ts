import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const BCRYPT_ROUNDS = 12;
const MIN_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type PasswordCheckResult = { ok: true } | { ok: false; reason: string };

export async function validatePasswordPolicy(pw: string): Promise<PasswordCheckResult> {
  if (pw.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  const breached = await isBreachedPassword(pw);
  if (breached === true) {
    return {
      ok: false,
      reason:
        "This password appears in a known breach corpus. Choose a different password.",
    };
  }
  if (breached === "error" && process.env.HIBP_FAIL_OPEN !== "true") {
    return {
      ok: false,
      reason: "Unable to verify password safety right now. Please try again shortly.",
    };
  }
  return { ok: true };
}

// HaveIBeenPwned k-anonymity: send only the first 5 chars of the SHA-1 prefix.
async function isBreachedPassword(pw: string): Promise<boolean | "error"> {
  try {
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "error";
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix] = line.trim().split(":");
      if (hashSuffix === suffix) return true;
    }
    return false;
  } catch {
    return "error";
  }
}
