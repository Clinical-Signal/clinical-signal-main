import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const BCRYPT_ROUNDS = 12;
const MIN_LENGTH = 8;

/** OWASP 2024 recommended argon2id parameters (m=19456 KiB, t=2, p=1). */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2id$");
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (isArgon2Hash(hash)) {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
  return bcrypt.compare(plain, hash);
}

export type PasswordCheckResult = { ok: true } | { ok: false; reason: string };

export async function validatePasswordPolicy(pw: string): Promise<PasswordCheckResult> {
  if (pw.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters.` };
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
