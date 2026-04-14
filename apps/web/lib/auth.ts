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
}

export async function signup(input: SignupInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const policy = await validatePasswordPolicy(input.password);
  if (!policy.ok) return { ok: false, error: policy.reason };

  const tenantId = process.env.DEFAULT_TENANT_ID;
  if (!tenantId) return { ok: false, error: "Server misconfigured: DEFAULT_TENANT_ID unset." };

  const hash = await hashPassword(input.password);

  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO practitioners (tenant_id, email_lower, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5, 'owner')
       RETURNING id`,
      [tenantId, email, input.email.trim(), hash, name],
    );
    const practitionerId = rows[0]!.id;
    await createSession(practitionerId);
    await writeAudit({ action: "signup", tenantId, practitionerId });
    return { ok: true };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return { ok: false, error: "An account with that email already exists." };
    }
    throw err;
  }
}
