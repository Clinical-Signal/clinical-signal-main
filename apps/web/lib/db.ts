import { Pool, type PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Lazy pool — defers construction until the first query so the module can
// be imported at Next.js build time without DATABASE_URL being set. Every
// runtime call goes through getPool(), which throws on the first real
// query if the env var is missing (not on import).
function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const p = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  global.__pgPool = p;
  return p;
}

// Proxy so `pool` can be imported at build time (where DATABASE_URL is
// absent). Methods are bound to the real pool so `this` is correct when
// pg internals call `this._clients` etc.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (real as any)[prop];
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params as unknown[]);
}

// Runs `fn` with a dedicated client that has `app.current_tenant_id` set for
// RLS. Use this for any query that touches a PHI-bearing table. Always
// releases the client — on error the client is discarded so stale GUCs never
// leak to the next checkout.
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let errored = false;
  let inTx = false;
  try {
    // RLS policies read the tenant id from a per-transaction GUC. set_config
    // with is_local=true only survives inside a transaction; we ran in
    // autocommit before, so the SET reverted before the next query and RLS
    // saw an empty string (which '' :: uuid then rejected). Wrap fn in an
    // explicit BEGIN/COMMIT so the tenant binding actually persists.
    await client.query("BEGIN");
    inTx = true;
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    inTx = false;
    return result;
  } catch (err) {
    errored = true;
    if (inTx) {
      try { await client.query("ROLLBACK"); } catch { /* swallow */ }
    }
    throw err;
  } finally {
    // `release(true)` tells pg to destroy rather than return-to-pool the
    // client on error, guaranteeing no tenant GUC residue on a future
    // checkout. Successful txns committed cleanly, so reuse is safe.
    client.release(errored || undefined);
  }
}

export function phiKey(): string {
  const k = process.env.PHI_ENCRYPTION_KEY;
  if (!k) throw new Error("PHI_ENCRYPTION_KEY is not set");
  return k;
}
