// Server-side session management.
//
// Design note: the build spec names "NextAuth.js (Auth.js v5)" for auth, but
// Auth.js v5's Credentials provider forces JWT sessions — you cannot combine
// Credentials with the database session strategy. The issue's substantive
// requirement is server-side revocability and a 15-minute idle timeout, so we
// implement sessions directly against the `sessions` table. A cryptographically
// random token lives in an httpOnly cookie; its SHA-256 is stored server-side.
// Logout deletes the row; DB expires_at slides on activity. MFA scaffolding
// lands in a follow-up issue per the issue description.
//
// Cookie vs. session lifetimes are intentionally decoupled: the cookie has a
// longer absolute lifetime (24h) so that Server Components can slide the DB
// row's expires_at without touching the cookie (Next 14 disallows cookie writes
// during Server Component rendering). The DB expires_at is the source of truth
// for idle timeout; the cookie is just a bearer of the opaque token.

import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { pool } from "./db";

import { SESSION_COOKIE_NAME as COOKIE_NAME } from "./session-constants";
const TOKEN_BYTES = 32;
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60; // 24h absolute cookie lifetime

function idleMinutes(): number {
  const n = Number(process.env.SESSION_IDLE_MINUTES ?? "15");
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newExpiry(): Date {
  return new Date(Date.now() + idleMinutes() * 60_000);
}

export interface SessionUser {
  sessionId: string;
  practitionerId: string;
  tenantId: string;
  email: string;
  name: string;
  role: "owner" | "practitioner" | "viewer";
}

export async function createSession(practitionerId: string): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(raw);
  const h = headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent") ?? null;

  await pool.query(
    `INSERT INTO sessions (token_hash, practitioner_id, tenant_id, expires_at, ip_address, user_agent)
     SELECT $1, p.id, p.tenant_id, $2, $3, $4
       FROM practitioners p WHERE p.id = $5`,
    [tokenHash, newExpiry(), ip, ua, practitionerId],
  );

  cookies().set(COOKIE_NAME, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return raw;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const tokenHash = hashToken(raw);

  const { rows } = await pool.query<{
    session_id: string;
    practitioner_id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: "owner" | "practitioner" | "viewer";
    expires_at: Date;
  }>(
    `SELECT s.id AS session_id, s.practitioner_id, s.tenant_id,
            p.email, p.name, p.role, s.expires_at
       FROM sessions s
       JOIN practitioners p ON p.id = s.practitioner_id
      WHERE s.token_hash = $1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [row.session_id]);
    return null;
  }

  // Slide the DB idle window on activity. Cookie is untouched — Next disallows
  // cookie mutation during Server Component rendering, and the cookie's 24h
  // max-age is an absolute cap, not the idle timer.
  await pool.query(
    "UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1",
    [row.session_id, newExpiry()],
  );

  return {
    sessionId: row.session_id,
    practitionerId: row.practitioner_id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

export async function destroyCurrentSession(): Promise<string | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  clearSessionCookie();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const { rows } = await pool.query<{ practitioner_id: string }>(
    "DELETE FROM sessions WHERE token_hash = $1 RETURNING practitioner_id",
    [tokenHash],
  );
  return rows[0]?.practitioner_id ?? null;
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export { SESSION_COOKIE_NAME } from "./session-constants";
