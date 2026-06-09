// Authentication entry points: login / logout / signup.
//
// Every query in this module touches `practitioners` or `tenants` *before*
// a tenant is known (login looks up email -> tenant; signup *creates* the
// tenant), so all DB access goes through `withSystem` with a tagged reason
// rather than withTenantContext. The CI grep gate allows withSystem here
// for exactly this reason.

import { redirect } from "next/navigation";
import { withSystem } from "@cs/db";
import {
  hashPassword,
  isArgon2Hash,
  validatePasswordPolicy,
  verifyPassword,
} from "./password";
import { resolvePostLoginMfaPath } from "./auth/mfa-routes";
import {
  createSession,
  destroyCurrentSession,
  getSessionUser,
  isSessionMfaVerified,
  type SessionUser,
} from "./session";
import { writeAudit } from "./audit";

export type { SessionUser };

export async function auth(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await auth();
  if (!user) redirect("/login");

  const enrolled = await withSystem(
    { reason: "mfa_require_auth_enrollment_lookup" },
    async (c) => {
      const { rows } = await c.query<{ mfa_enrolled_at: Date | null }>(
        `SELECT mfa_enrolled_at FROM practitioners WHERE id = $1`,
        [user.practitionerId],
      );
      return rows[0]?.mfa_enrolled_at !== null;
    },
  );

  if (!enrolled) {
    redirect("/mfa/enroll");
  }

  const verified = await isSessionMfaVerified(user.sessionId);
  if (!verified) {
    await writeAudit({
      action: "mfa_required_redirect",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
    });
    redirect("/mfa/verify");
  }

  return user;
}

/**
 * API-safe auth: returns null instead of redirecting to /login.
 * Use this in API route handlers (route.ts) to avoid returning HTML
 * when the session is expired — the caller should return a 401 JSON response.
 */
export async function apiAuth(): Promise<SessionUser | null> {
  return auth();
}

export type AuthResult =
  | { ok: true; redirectTo: "/mfa/enroll" | "/mfa/verify" }
  | { ok: false; error: string };

/** Server-side mirror of the signup form's maxLength={120}. */
const PRACTICE_NAME_MAX = 120;

interface PractitionerRow {
  id: string;
  tenant_id: string;
  password_hash: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const row = await withSystem({ reason: "auth_login_email_lookup" }, async (c) => {
    const { rows } = await c.query<PractitionerRow>(
      "SELECT id, tenant_id, password_hash FROM practitioners WHERE email_lower = $1",
      [normalized],
    );
    return rows[0] ?? null;
  });

  // Constant-ish time: always run verify to reduce user-enumeration timing signal.
  const hash = row?.password_hash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalida";
  const valid = await verifyPassword(password, hash);

  if (!row || !valid) {
    await writeAudit({
      action: "login_failure",
      tenantId: row?.tenant_id ?? null,
      practitionerId: row?.id ?? null,
      metadata: { email_attempted: normalized },
    });
    return { ok: false, error: "Invalid email or password." };
  }

  if (!isArgon2Hash(row.password_hash)) {
    const upgradedHash = await hashPassword(password);
    await withSystem({ reason: "auth_password_hash_upgrade" }, async (c) => {
      await c.query("UPDATE practitioners SET password_hash = $1 WHERE id = $2", [
        upgradedHash,
        row.id,
      ]);
    });
  }

  await createSession(row.id);
  await withSystem({ reason: "auth_login_last_login_stamp" }, async (c) => {
    await c.query("UPDATE practitioners SET last_login_at = now() WHERE id = $1", [row.id]);
  });
  await writeAudit({
    action: "login_success",
    tenantId: row.tenant_id,
    practitionerId: row.id,
  });
  const redirectTo = await resolvePostLoginMfaPath(row.id);
  return { ok: true, redirectTo };
}

export async function logout(): Promise<void> {
  const practitionerId = await destroyCurrentSession();
  if (practitionerId) {
    await writeAudit({ action: "logout", practitionerId });
  }
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  /**
   * Optional business / practice name. Defaults server-side to
   * `${name}'s practice` when not supplied — the signup form may
   * skip the field and the fallback keeps the row coherent.
   */
  practiceName?: string;
}

/**
 * Sign up a new practitioner.
 *
 * Main path (production + default dev): provisions a fresh tenant
 * AND practitioner in one atomic transaction, then sets the tenant's
 * signing_authority_practitioner_id to the new practitioner. The new
 * tenant lands with `lifecycle_status='pending_baa'` — Issue #2 of
 * the onboarding plan flips that to `'active'` when the BAA is
 * accepted. Session + audit are post-COMMIT because createSession
 * and writeAudit each open their own client (they don't take ours).
 *
 * Dev escape hatch: when `ATTACH_TO_DEFAULT_TENANT=true` AND
 * `NODE_ENV=development` AND `DEFAULT_TENANT_ID` is set, the new
 * practitioner attaches to the existing default tenant without
 * provisioning a new one. Used only for seeded dev fixtures. In
 * production this branch never triggers; `DEFAULT_TENANT_ID` is no
 * longer required for real signup.
 */
export async function signup(input: SignupInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Mirrors the form's maxLength={120}. Server-side check because the
  // browser attribute is advisory — a hand-crafted POST can ignore it.
  // Runs before hashing or any DB call so over-length input fails fast.
  const trimmedPracticeName = input.practiceName?.trim();
  if (trimmedPracticeName && trimmedPracticeName.length > PRACTICE_NAME_MAX) {
    return {
      ok: false,
      error: `Practice name must be ${PRACTICE_NAME_MAX} characters or fewer.`,
    };
  }

  const policy = await validatePasswordPolicy(input.password);
  if (!policy.ok) return { ok: false, error: policy.reason };

  const hash = await hashPassword(input.password);

  const attachToDefault =
    process.env.ATTACH_TO_DEFAULT_TENANT === "true" &&
    process.env.NODE_ENV === "development" &&
    !!process.env.DEFAULT_TENANT_ID;

  // ------------------------------------------------------------------
  // Dev escape hatch — attach to DEFAULT_TENANT_ID without provisioning.
  // ------------------------------------------------------------------
  if (attachToDefault) {
    const tenantId = process.env.DEFAULT_TENANT_ID!;
    try {
      const practitionerId = await withSystem(
        { reason: "auth_signup_attach_default_tenant" },
        async (c) => {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
             VALUES ($1, $2, $3, $4, $5, 'owner')
             RETURNING id`,
            [tenantId, email, input.email.trim(), hash, name],
          );
          return rows[0]!.id;
        },
      );
      await createSession(practitionerId);
      await writeAudit({
        action: "signup",
        tenantId,
        practitionerId,
        metadata: { event: "attached_to_default_tenant" },
      });
      return { ok: true, redirectTo: "/mfa/enroll" };
    } catch (err: unknown) {
      if (isDuplicateEmailError(err)) {
        return { ok: false, error: "An account with that email already exists." };
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Main path — one tenant + one practitioner in a single transaction.
  // ------------------------------------------------------------------
  const practiceName = trimmedPracticeName || `${name}'s practice`;

  let tenantId: string;
  let practitionerId: string;
  try {
    const result = await withSystem(
      { reason: "auth_signup_provision_tenant_and_practitioner" },
      async (client) => {
        await client.query("BEGIN");
        try {
          const tenantResult = await client.query<{ id: string }>(
            `INSERT INTO tenants (name, legal_name, lifecycle_status)
             VALUES ($1, $1, 'pending_baa')
             RETURNING id`,
            [practiceName],
          );
          const newTenantId = tenantResult.rows[0]!.id;

          const practitionerResult = await client.query<{ id: string }>(
            `INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
             VALUES ($1, $2, $3, $4, $5, 'owner')
             RETURNING id`,
            [newTenantId, email, input.email.trim(), hash, name],
          );
          const newPractitionerId = practitionerResult.rows[0]!.id;

          await client.query(
            `UPDATE tenants SET signing_authority_practitioner_id = $1 WHERE id = $2`,
            [newPractitionerId, newTenantId],
          );

          await client.query("COMMIT");
          return { tenantId: newTenantId, practitionerId: newPractitionerId };
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* nothing useful to do if the rollback itself fails */
          }
          throw err;
        }
      },
    );
    tenantId = result.tenantId;
    practitionerId = result.practitionerId;
  } catch (err: unknown) {
    if (isDuplicateEmailError(err)) {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw err;
  }

  // Post-COMMIT: createSession writes the sessions row AND sets the
  // browser cookie (separate client + Next request scope). writeAudit
  // also uses its own client. Both run after the transaction commits.
  await createSession(practitionerId);
  await writeAudit({
    action: "signup",
    tenantId,
    practitionerId,
    metadata: { event: "practice_provisioned" },
  });
  return { ok: true, redirectTo: "/mfa/enroll" };
}

function isDuplicateEmailError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
