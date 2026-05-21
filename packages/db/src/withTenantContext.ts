// Tenant-scoped DB access for everything that touches PHI.
//
// What this guarantees:
//   1. The connection's `app.current_tenant_id` GUC is set to ctx.tenantId
//      so RLS policies (USING + WITH CHECK) authorize every row.
//   2. The whole `fn` runs inside a single transaction. set_config with
//      is_local=true scopes the GUC to the transaction; without the BEGIN,
//      autocommit reverts the SET before the next statement and RLS sees
//      the empty string (which '' :: uuid then rejects). Issue #193.
//   3. On any error the connection is *destroyed* via release(true), not
//      returned to the pool — eliminating the GUC-residue class of bugs
//      where a failed query leaves a stale tenant id on a pooled client
//      that the next checkout inherits.
//
// What this does NOT do:
//   - It does not call requireActiveTenant. Callers explicitly opt into
//     the lifecycle gate when they're about to mutate. Read paths can
//     run on a suspended tenant.
//   - It does not encrypt/decrypt PHI. Use phiKey() and pgp_sym_*
//     functions in your SQL.

import type { PoolClient } from "pg";
import type { TenantContext } from "@cs/core";
import { TenantContextMissingError } from "@cs/core";
import { pool } from "./client";

export async function withTenantContext<T>(
  ctx: TenantContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!ctx || typeof ctx.tenantId !== "string" || ctx.tenantId.length === 0) {
    throw new TenantContextMissingError("withTenantContext");
  }

  const client = await pool.connect();
  let errored = false;
  let inTx = false;
  try {
    await client.query("BEGIN");
    inTx = true;
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [ctx.tenantId],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    inTx = false;
    return result;
  } catch (err) {
    errored = true;
    if (inTx) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* swallow — original err is more useful */
      }
    }
    throw err;
  } finally {
    // release(true) destroys the client on error so no GUC residue
    // contaminates the next checkout. Successful txns committed cleanly,
    // so reuse is safe.
    client.release(errored || undefined);
  }
}
