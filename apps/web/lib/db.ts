// Thin re-export over @cs/db. The actual pool/withTenantContext/withSystem
// implementations live in packages/db so they can be consumed by future
// services (admin tooling, background workers) without depending on the
// Next.js app.
//
// Migration note: this file used to own the lazy Pool and a tenantId-string
// `withTenant` helper. Both moved to @cs/db. The string-form wrapper below
// is kept for backwards compatibility while call sites migrate to
// `withTenantContext(ctx, ...)`. New code MUST use the context form — the
// CI grep gate (apps/web/scripts/check-system-access.mjs) will start
// failing on raw `withTenant(` introductions in a follow-up PR.

import {
  pool,
  withTenantContext,
  withSystem,
  phiKey,
  isRemoteHost,
  type PoolClient,
  type WithSystemOptions,
} from "@cs/db";
import type { TenantContext } from "@cs/core";

export { pool, withTenantContext, withSystem, phiKey, isRemoteHost };
export type { PoolClient, WithSystemOptions };

export async function query<
  T extends Record<string, unknown> = Record<string, unknown>,
>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * @deprecated Use `withTenantContext(ctx, fn)` from `@cs/db` instead.
 *
 * Kept as a back-compat shim so the lib/* modules can migrate to
 * TenantContext incrementally. Internally this synthesizes a minimal
 * context — it loses the lifecycle gate, audit fields, and role info
 * that the real context carries. Call sites that still use this form
 * are flagged in the PR3 description and will be removed in a follow-up.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  // Fabricate a stripped-down context. This compiles to the same runtime
  // SQL (BEGIN; set_config; fn; COMMIT) — the only thing missing vs. the
  // full context form is the type-level proof that the caller actually
  // authenticated. Migrating call sites flips that on.
  const ctx: TenantContext = {
    tenantId,
    practitionerId: "",
    sessionId: "",
    role: "practitioner",
    lifecycleStatus: "active",
  };
  return withTenantContext(ctx, fn);
}
