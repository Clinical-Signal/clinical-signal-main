/**
 * Engine JWT — short-lived bearer token the web tier signs and the
 * analysis engine verifies.
 *
 * Why this exists:
 *   Before PR5 the engine accepted `tenant_id` in every request body
 *   and trusted the network boundary. Anyone who could reach the
 *   engine port could make a request for any tenant; RLS was the only
 *   safety net. PR5 closes that loophole — the engine refuses any
 *   request without a valid HMAC-SHA256 signature carrying the
 *   tenant context, signed with `ENGINE_JWT_SECRET` (a shared secret
 *   between web and engine, rotated quarterly per the runbook).
 *
 * Wire format: standard HS256 JWT. We hand-roll it with Node's
 * `crypto` module instead of pulling in `jsonwebtoken` because the
 * surface we need is small (sign + verify, one alg) and the package
 * boundary in @cs/core should stay dep-light. The Python side uses
 * the `pyjwt` library which interops with this format.
 *
 * Claims:
 *   tid       UUID string. ctx.tenantId.
 *   pid       UUID string or null. ctx.practitionerId.
 *   role      "owner" | "practitioner" | "viewer" | "system".
 *   jid       request-scoped job correlation id.
 *   lifecycle "pending_baa" | "active" | "suspended" | "terminated".
 *   iat / exp standard timestamps in seconds. Default TTL 5 minutes —
 *             well past the slowest engine round-trip (analyze can
 *             take 60s) but tight enough that a leaked token expires
 *             before a human notices.
 *
 * Security notes:
 *   - The secret is read from `ENGINE_JWT_SECRET` at sign/verify
 *     time. No fallback. Missing env throws.
 *   - Signatures are compared with `timingSafeEqual` to defeat
 *     timing-side-channel attacks. (`crypto.timingSafeEqual` requires
 *     equal-length buffers; we shape them before comparing.)
 *   - We deliberately do NOT include `iss`/`aud`/`sub` — this is a
 *     point-to-point token between two services we own; adding more
 *     claims is just more surface to forge.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { TenantContext } from "./context";

export interface EngineJwtClaims {
  readonly tid: string;
  readonly pid: string | null;
  readonly role: string;
  readonly jid: string;
  readonly lifecycle: string;
  readonly iat: number;
  readonly exp: number;
}

export const DEFAULT_ENGINE_JWT_TTL_SECONDS = 5 * 60;

/** Inputs to signEngineJwt. The secret defaults to env, but is
 * overridable for tests. ttlSeconds defaults to 5 minutes. */
export interface SignEngineJwtOptions {
  readonly secret?: string;
  readonly ttlSeconds?: number;
  /** Override clock for tests; defaults to wall time in seconds. */
  readonly nowSeconds?: number;
}

/** Inputs to verifyEngineJwt. */
export interface VerifyEngineJwtOptions {
  readonly secret?: string;
  /** Override clock for tests; defaults to wall time in seconds. */
  readonly nowSeconds?: number;
  /** Soft skew (seconds) accepted on exp / iat. Default 30s — covers
   * normal NTP drift between web and engine hosts without widening
   * the replay window meaningfully. */
  readonly clockSkewSeconds?: number;
}

export class EngineJwtError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineJwtError";
    this.code = code;
  }
}

function readSecret(override: string | undefined): string {
  const secret = override ?? process.env.ENGINE_JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new EngineJwtError(
      "missing_secret",
      "ENGINE_JWT_SECRET is not set; engine JWT signing/verification disabled",
    );
  }
  return secret;
}

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64");
}

function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/** Sign a TenantContext into a 5-minute HS256 JWT.
 *
 * `jobId` becomes the `jid` claim — a request-scoped correlation id
 * (e.g., `extract:<record_uuid>`). It's stamped into engine logs so
 * a leaked or replayed token can be traced back to the originating
 * web request.
 */
export function signEngineJwt(
  ctx: TenantContext,
  jobId: string,
  options: SignEngineJwtOptions = {},
): string {
  const secret = readSecret(options.secret);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? DEFAULT_ENGINE_JWT_TTL_SECONDS;
  const header = { alg: "HS256", typ: "JWT" };
  const claims: EngineJwtClaims = {
    tid: ctx.tenantId,
    pid: ctx.practitionerId || null,
    role: ctx.role,
    jid: jobId,
    lifecycle: ctx.lifecycleStatus,
    iat: now,
    exp: now + ttl,
  };
  const headerB64 = base64urlEncode(Buffer.from(JSON.stringify(header), "utf8"));
  const claimsB64 = base64urlEncode(Buffer.from(JSON.stringify(claims), "utf8"));
  const signingInput = `${headerB64}.${claimsB64}`;
  const sigB64 = base64urlEncode(hmac(secret, signingInput));
  return `${signingInput}.${sigB64}`;
}

/** Verify a JWT string; return parsed claims on success.
 *
 * Throws EngineJwtError with codes:
 *   "malformed"           — not a 3-segment JWT.
 *   "unsupported_alg"     — header alg is not HS256.
 *   "bad_signature"       — HMAC mismatch.
 *   "expired"             — now >= exp + skew.
 *   "not_yet_valid"       — now < iat - skew (clock skew or replay).
 *   "missing_claim"       — required claim absent.
 *
 * The web tier rarely needs verify (it's a signer-only role); this
 * exists primarily for symmetry, unit tests, and any future server-to-
 * server tooling that consumes the same JWTs.
 */
export function verifyEngineJwt(
  token: string,
  options: VerifyEngineJwtOptions = {},
): EngineJwtClaims {
  const secret = readSecret(options.secret);
  const skew = options.clockSkewSeconds ?? 30;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new EngineJwtError("malformed", "JWT must have 3 dot-separated segments");
  }
  const [headerB64, claimsB64, sigB64] = parts as [string, string, string];

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString("utf8"));
  } catch {
    throw new EngineJwtError("malformed", "JWT header is not valid JSON");
  }
  if (header.alg !== "HS256") {
    throw new EngineJwtError(
      "unsupported_alg",
      `JWT alg must be HS256, got ${String(header.alg)}`,
    );
  }

  const expectedSig = hmac(secret, `${headerB64}.${claimsB64}`);
  const presentedSig = base64urlDecode(sigB64);
  if (
    expectedSig.length !== presentedSig.length ||
    !timingSafeEqual(expectedSig, presentedSig)
  ) {
    throw new EngineJwtError("bad_signature", "JWT signature does not match");
  }

  let claims: EngineJwtClaims;
  try {
    claims = JSON.parse(base64urlDecode(claimsB64).toString("utf8"));
  } catch {
    throw new EngineJwtError("malformed", "JWT claims segment is not valid JSON");
  }

  for (const key of ["tid", "role", "jid", "lifecycle", "iat", "exp"] as const) {
    if (claims[key] === undefined || claims[key] === null) {
      throw new EngineJwtError("missing_claim", `JWT missing required claim '${key}'`);
    }
  }

  if (now >= claims.exp + skew) {
    throw new EngineJwtError("expired", "JWT is past exp");
  }
  if (now < claims.iat - skew) {
    throw new EngineJwtError("not_yet_valid", "JWT iat is in the future");
  }
  return claims;
}
