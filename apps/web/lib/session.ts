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
//
// Tenant context: getSessionUser returns a SessionUser that *is* a
// TenantContext (plus email + name for UI). All reads against the
// auth-spanning tables (sessions, practitioners, tenants) go through
// `withSystem` because they cross the tenant boundary by design — we
// don't know the tenant id until after we've looked the token up.

import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { withSystem } from "@cs/db";
import type { TenantContext, TenantLifecycleStatus, PractitionerRole } from "@cs/core";

import {
  MFA_VERIFIED_COOKIE_NAME,
  ROLE_COOKIE_NAME,
  SESSION_COOKIE_NAME as COOKIE_NAME,
} from "./session-constants";
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

export interface SessionUser extends TenantContext {
  email: string;
  name: string;
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

  const role = await withSystem({ reason: "session_create" }, async (c) => {
    const { rows: practitionerRows } = await c.query<{ role: PractitionerRole }>(
      "SELECT role FROM practitioners WHERE id = $1",
      [practitionerId],
    );
    const practitionerRole = practitionerRows[0]?.role;
    if (!practitionerRole) return null;

    await c.query(
      `INSERT INTO sessions (token_hash, practitioner_id, tenant_id, expires_at, ip_address, user_agent)
       SELECT $1, p.id, p.tenant_id, $2, $3, $4
         FROM practitioners p WHERE p.id = $5`,
      [tokenHash, newExpiry(), ip, ua, practitionerId],
    );
    return practitionerRole;
  });

  clearMfaVerifiedCookie();
  if (role) setRoleCookie(role);

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

  // Single round-trip JOIN across sessions / practitioners / tenants so
  // we get lifecycle_status alongside identity. Crossing tenants by
  // design (token-based lookup), hence withSystem.
  const row = await withSystem(
    { reason: "session_lookup" },
    async (c) => {
      const { rows } = await c.query<{
        session_id: string;
        practitioner_id: string;
        tenant_id: string;
        email: string;
        name: string;
        role: PractitionerRole;
        lifecycle_status: TenantLifecycleStatus;
        expires_at: Date;
      }>(
        `SELECT s.id AS session_id, s.practitioner_id, s.tenant_id,
                p.email, p.name, p.role,
                t.lifecycle_status,
                s.expires_at
           FROM sessions s
           JOIN practitioners p ON p.id = s.practitioner_id
           JOIN tenants t       ON t.id = s.tenant_id
          WHERE s.token_hash = $1`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },
  );
  if (!row) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    await withSystem({ reason: "session_expire_purge" }, async (c) => {
      await c.query("DELETE FROM sessions WHERE id = $1", [row.session_id]);
    });
    return null;
  }

  // Slide the DB idle window on activity. Cookie is untouched — Next disallows
  // cookie mutation during Server Component rendering, and the cookie's 24h
  // max-age is an absolute cap, not the idle timer.
  await withSystem({ reason: "session_slide_expiry" }, async (c) => {
    await c.query(
      "UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1",
      [row.session_id, newExpiry()],
    );
  });

  setRoleCookie(row.role);

  return {
    sessionId: row.session_id,
    practitionerId: row.practitioner_id,
    tenantId: row.tenant_id,
    role: row.role,
    lifecycleStatus: row.lifecycle_status,
    email: row.email,
    name: row.name,
  };
}

export async function isSessionMfaVerified(sessionId: string): Promise<boolean> {
  return withSystem({ reason: "session_mfa_status_lookup" }, async (c) => {
    const { rows } = await c.query<{ mfa_verified_at: Date | null }>(
      `SELECT mfa_verified_at FROM sessions WHERE id = $1`,
      [sessionId],
    );
    return rows[0]?.mfa_verified_at !== null;
  });
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  await withSystem({ reason: "session_mfa_verified_stamp" }, async (c) => {
    await c.query(
      `UPDATE sessions SET mfa_verified_at = now() WHERE id = $1`,
      [sessionId],
    );
  });
  setMfaVerifiedCookie();
}

export function setRoleCookie(role: PractitionerRole): void {
  cookies().set(ROLE_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearRoleCookie(): void {
  cookies().set(ROLE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function setMfaVerifiedCookie(): void {
  cookies().set(MFA_VERIFIED_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearMfaVerifiedCookie(): void {
  cookies().set(MFA_VERIFIED_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function destroyCurrentSession(): Promise<string | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  clearSessionCookie();
  clearMfaVerifiedCookie();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  return withSystem({ reason: "session_destroy" }, async (c) => {
    const { rows } = await c.query<{ practitioner_id: string }>(
      "DELETE FROM sessions WHERE token_hash = $1 RETURNING practitioner_id",
      [tokenHash],
    );
    return rows[0]?.practitioner_id ?? null;
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  clearRoleCookie();
}

export {
  MFA_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./session-constants";
