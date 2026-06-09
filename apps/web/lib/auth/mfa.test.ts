import { authenticator } from "otplib";
import { describe, expect, it, vi } from "vitest";

vi.mock("@cs/db", () => ({
  withSystem: vi.fn(),
}));

import {
  buildOtpauthUri,
  generateSecret,
  verifyTotp,
} from "./mfa";

describe("mfa TOTP helpers (SEC-2)", () => {
  it("generateSecret returns a non-empty base32 secret", () => {
    const secret = generateSecret();
    expect(secret.length).toBeGreaterThan(10);
  });

  it("buildOtpauthUri includes issuer and account", () => {
    const secret = generateSecret();
    const uri = buildOtpauthUri(secret, "clinician@example.com");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Clinical%20Signal");
    expect(uri).toContain(encodeURIComponent("clinician@example.com"));
  });

  it("verifyTotp accepts a valid code for the secret", () => {
    const secret = generateSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
    expect(verifyTotp("000000", secret)).toBe(false);
  });
});
