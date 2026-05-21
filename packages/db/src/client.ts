// Lazy Postgres pool used by both withTenantContext and withSystem.
//
// Two reasons this isn't a top-level `new Pool({ ... })`:
//  1. Next.js evaluates the module at build time (Server Component
//     analysis, route metadata extraction). DATABASE_URL is not set in
//     `next build`. A top-level Pool would crash the build.
//  2. We want one pool per Node.js process, regardless of how many lib
//     modules import from packages/db. globalThis caches it so HMR in dev
//     doesn't leak connections on every file change.
//
// All pool access goes through getPool(). The exported `pool` Proxy
// preserves the historical `pool.query(...)` and `pool.connect()`
// surface that callers depend on, while still being lazy.

import { Pool, type PoolConfig } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __cs_pgPool: Pool | undefined;
}

// Hostnames treated as dev-local (no SSL required). Includes Docker
// service names so docker-compose's `postgres:5432` resolves correctly
// instead of being classified as remote and demanding SSL against a dev
// Postgres that doesn't speak SSL — see issue #193 for the regression
// that motivated this.
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "db",
]);

// True iff the connection string targets a non-local Postgres.
//
// Uses URL parsing (not substring matching) so query strings and ports
// can't accidentally match a hostname check. Malformed connection
// strings fall through to `true` — production deploys with a bad
// DATABASE_URL fail closed (SSL required) instead of open.
export function isRemoteHost(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return !LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return true;
  }
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const isRemote = isRemoteHost(connectionString);
  const needsSsl =
    isRemote ||
    connectionString.includes("sslmode=require") ||
    process.env.NODE_ENV === "production";

  // SSL config: reject unauthorized certs by default (MITM protection).
  // If the managed DB uses a custom CA, set DATABASE_CA_CERT env var
  // with the PEM-encoded certificate. Railway/Aptible provide this in
  // their dashboard.
  let ssl: { rejectUnauthorized: boolean; ca?: string } | undefined;
  if (needsSsl) {
    const ca = process.env.DATABASE_CA_CERT;
    ssl = {
      rejectUnauthorized: ca ? true : !isRemote ? false : true,
      ...(ca ? { ca } : {}),
    };
  }

  return {
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    ssl,
  };
}

export function getPool(): Pool {
  if (globalThis.__cs_pgPool) return globalThis.__cs_pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const p = new Pool(buildPoolConfig(connectionString));
  globalThis.__cs_pgPool = p;
  return p;
}

// Proxy so `pool` can be imported at module-load time (where
// DATABASE_URL is absent during `next build`). Methods are bound to the
// real pool so `this` is correct when pg internals call
// `this._clients` etc.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (real as any)[prop];
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
});

export function phiKey(): string {
  const k = process.env.PHI_ENCRYPTION_KEY;
  if (!k) throw new Error("PHI_ENCRYPTION_KEY is not set");
  return k;
}
