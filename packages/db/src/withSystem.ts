// Explicit no-RLS escape hatch for cross-tenant infrastructure tables.
//
// USE ONLY for these tables, which are tenant-spanning by design:
//   - sessions               (auth — must look up by token before tenant is known)
//   - practitioners          (login: email -> tenant lookup)
//   - password_reset_tokens  (token -> practitioner lookup before auth)
//   - audit_log              (writeAudit may run pre-tenant for failed logins)
//   - tenants                (provisioning rows that don't exist yet)
//   - schema_migrations      (deploy-time only)
//
// Every other PHI-bearing table MUST go through withTenantContext. A CI
// grep gate (apps/web/scripts/check-system-access.mjs) fails if
// withSystem is imported from a file that's not on the allow-list.
//
// Why a separate function and not "just use pool.query"?
//   - It tags every cross-tenant access at the call site so reviewers can
//     spot it (and the grep gate can audit it).
//   - It opens a dedicated client and *does not* set a tenant GUC — a
//     pooled client that previously held one would otherwise leak it
//     into the next system query if RLS were ever enabled on the
//     queried table.
//   - The `reason` parameter forces the caller to write down *why* this
//     access is system-scoped. The string flows into request logs.

import type { PoolClient } from "pg";
import { pool } from "./client";

export interface WithSystemOptions {
  // Human-readable justification logged with every system query.
  // Examples: "auth_login_email_lookup", "audit_pretenant_failed_login".
  // Required so reviewers and post-incident audits can answer
  // "why didn't this go through RLS?" without re-reading the code.
  readonly reason: string;
}

export async function withSystem<T>(
  options: WithSystemOptions,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!options.reason || options.reason.length === 0) {
    throw new Error("withSystem requires a non-empty reason");
  }
  const client = await pool.connect();
  let errored = false;
  try {
    // Defensively reset any tenant GUC on the borrowed client. set_config
    // with is_local=false would persist for the connection's lifetime,
    // but pg pools recycle clients — a previous borrower might have set
    // the GUC, errored, and skipped the destroy path. Belt + suspenders.
    await client.query(
      "SELECT set_config('app.current_tenant_id', '', false)",
    );
    return await fn(client);
  } catch (err) {
    errored = true;
    throw err;
  } finally {
    client.release(errored || undefined);
  }
}
