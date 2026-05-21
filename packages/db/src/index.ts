export { pool, getPool, phiKey, isRemoteHost } from "./client";
export { withTenantContext } from "./withTenantContext";
export { withSystem, type WithSystemOptions } from "./withSystem";

// Re-export the pg PoolClient type so apps/web/* never has to import
// from "pg" directly. The CI grep gate fails on raw `from "pg"` imports
// outside scripts/.
export type { PoolClient } from "pg";
