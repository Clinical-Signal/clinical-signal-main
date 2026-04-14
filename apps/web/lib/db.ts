import { Pool, type PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

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
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    return await fn(client);
  } catch (err) {
    errored = true;
    throw err;
  } finally {
    // `release(true)` tells pg to destroy rather than return-to-pool the
    // client, guaranteeing no tenant GUC residue on a future checkout.
    client.release(errored || undefined);
  }
}

export function phiKey(): string {
  const k = process.env.PHI_ENCRYPTION_KEY;
  if (!k) throw new Error("PHI_ENCRYPTION_KEY is not set");
  return k;
}
