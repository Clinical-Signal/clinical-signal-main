import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { hashPassword, isArgon2Hash, verifyPassword } from "./password";

describe("password hashing (SEC-2)", () => {
  it("hashPassword produces an argon2id hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(isArgon2Hash(hash)).toBe(true);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifyPassword accepts argon2id hashes", async () => {
    const plain = "new-signup-password-99";
    const hash = await hashPassword(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("verifyPassword still accepts legacy bcrypt hashes", async () => {
    const plain = "legacy-seeded-password";
    const legacyHash = await bcrypt.hash(plain, 12);
    expect(isArgon2Hash(legacyHash)).toBe(false);
    expect(legacyHash.startsWith("$2")).toBe(true);
    expect(await verifyPassword(plain, legacyHash)).toBe(true);
    expect(await verifyPassword("wrong-password", legacyHash)).toBe(false);
  });

  it("verifyPassword rejects malformed argon2 hashes without throwing", async () => {
    expect(await verifyPassword("any-password", "$argon2id$invalid")).toBe(false);
  });
});
