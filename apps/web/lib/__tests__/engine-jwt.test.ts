/**
 * Round-trip + tampering tests for the TS-side engine JWT helpers.
 *
 * The Python verifier in services/analysis-engine/app/_core/auth.py
 * has its own pytest suite (services/analysis-engine/tests/test_auth.py)
 * that constructs JWTs by hand. Together the two test files lock
 * down the wire format on both sides — if anyone changes the claim
 * names or the alg without updating the other side, one of the suites
 * will fail.
 */
import { describe, it, expect } from "vitest";
import {
  signEngineJwt,
  verifyEngineJwt,
  EngineJwtError,
  type TenantContext,
} from "@cs/core";

const SECRET = "test_engine_jwt_secret_at_least_32_chars_long_for_hs256";

const ctx: TenantContext = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  practitionerId: "22222222-2222-2222-2222-222222222222",
  sessionId: "33333333-3333-3333-3333-333333333333",
  role: "practitioner",
  lifecycleStatus: "active",
};

describe("signEngineJwt / verifyEngineJwt", () => {
  it("round-trips claims faithfully", () => {
    const token = signEngineJwt(ctx, "test_job", { secret: SECRET });
    const claims = verifyEngineJwt(token, { secret: SECRET });
    expect(claims.tid).toBe(ctx.tenantId);
    expect(claims.pid).toBe(ctx.practitionerId);
    expect(claims.role).toBe(ctx.role);
    expect(claims.jid).toBe("test_job");
    expect(claims.lifecycle).toBe(ctx.lifecycleStatus);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("emits 3-segment standard JWT format", () => {
    const token = signEngineJwt(ctx, "fmt_check", { secret: SECRET });
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes pid=null for system jobs", () => {
    const sysCtx: TenantContext = { ...ctx, practitionerId: "" };
    const token = signEngineJwt(sysCtx, "system_job", { secret: SECRET });
    const claims = verifyEngineJwt(token, { secret: SECRET });
    expect(claims.pid).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const token = signEngineJwt(ctx, "wrong_secret", { secret: SECRET });
    expect(() => verifyEngineJwt(token, { secret: "wrong" })).toThrow(EngineJwtError);
  });

  it("rejects tokens past exp", () => {
    // Sign a token that was already expired one minute ago.
    const now = Math.floor(Date.now() / 1000);
    const token = signEngineJwt(ctx, "expired", {
      secret: SECRET,
      ttlSeconds: 60,
      nowSeconds: now - 600,
    });
    expect(() => verifyEngineJwt(token, { secret: SECRET, nowSeconds: now })).toThrow(
      EngineJwtError,
    );
  });

  it("rejects tampered signature", () => {
    // Flip a character in the middle of the signature segment. Avoid
    // the last char — for base64url-encoded HMAC output (43 chars,
    // 32 bytes), the trailing char's low bits are padding and a
    // single-char swap there can round-trip to the same bytes.
    const token = signEngineJwt(ctx, "tamper_sig", { secret: SECRET });
    const segments = token.split(".");
    const sig = segments[2]!;
    const mid = Math.floor(sig.length / 2);
    const ch = sig[mid]!;
    const flipped = ch === "A" ? "B" : "A";
    const tampered = `${segments[0]}.${segments[1]}.${sig.slice(0, mid)}${flipped}${sig.slice(mid + 1)}`;
    expect(() => verifyEngineJwt(tampered, { secret: SECRET })).toThrow(EngineJwtError);
  });

  it("rejects malformed tokens with wrong segment count", () => {
    expect(() => verifyEngineJwt("not.a.valid.jwt", { secret: SECRET })).toThrow(
      EngineJwtError,
    );
  });

  it("throws when ENGINE_JWT_SECRET is missing", () => {
    const original = process.env.ENGINE_JWT_SECRET;
    delete process.env.ENGINE_JWT_SECRET;
    try {
      expect(() => signEngineJwt(ctx, "no_secret")).toThrow(/ENGINE_JWT_SECRET/);
    } finally {
      if (original !== undefined) process.env.ENGINE_JWT_SECRET = original;
    }
  });
});
