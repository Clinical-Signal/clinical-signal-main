import { redirect } from "next/navigation";
import { pool } from "./db";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "./password";
import { writeAudit } from "./audit";
import {
  createSession,
  destroyCurrentSession,
  getSessionUser,
  type SessionUser,
} from "./session";

export type { SessionUser };

export async function auth(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await auth();
  if (!user) redirect("/login");
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

export type AuthResult = { ok: true } | { ok: false; error: string };

interface PractitionerRow {
  id: string;
  tenant_id: string;
  password_hash: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await pool.query<PractitionerRow>(
    "SELECT id, tenant_id, password_hash FROM practitioners WHERE email_lower = $1",
    [normalized],
  );
  const row = rows[0];

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

  await createSession(row.id);
  await pool.query("UPDATE practitioners SET last_login_at = now() WHERE id = $1", [row.id]);
  await writeAudit({
    action: "login_success",
    tenantId: row.tenant_id,
    practitionerId: row.id,
  });
  return { ok: true };
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
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5, 'owner')
         RETURNING id`,
        [tenantId, email, input.email.trim(), hash, name],
      );
      const practitionerId = rows[0]!.id;
      await createSession(practitionerId);
      await writeAudit({
        action: "signup",
        tenantId,
        practitionerId,
        metadata: { event: "attached_to_default_tenant" },
      });
      return { ok: true };
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
  const practiceName = input.practiceName?.trim() || `${name}'s practice`;

  const client = await pool.connect();
  let tenantId: string;
  let practitionerId: string;
  try {
    await client.query("BEGIN");

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, legal_name, lifecycle_status)
       VALUES ($1, $1, 'pending_baa')
       RETURNING id`,
      [practiceName],
    );
    tenantId = tenantResult.rows[0]!.id;

    const practitionerResult = await client.query<{ id: string }>(
      `INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5, 'owner')
       RETURNING id`,
      [tenantId, email, input.email.trim(), hash, name],
    );
    practitionerId = practitionerResult.rows[0]!.id;

    await client.query(
      `UPDATE tenants SET signing_authority_practitioner_id = $1 WHERE id = $2`,
      [practitionerId, tenantId],
    );

    await client.query("COMMIT");
  } catch (err: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* nothing useful to do if the rollback itself fails */
    }
    if (isDuplicateEmailError(err)) {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw err;
  } finally {
    client.release();
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
  return { ok: true };
}

function isDuplicateEmailError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}
