import { TenantInactiveError } from "../errors";
import type { TenantContext } from "./context";

// Gate that any "act on PHI" code path should run before mutating data.
// Passes through to the same context (so it composes with `await
// withTenantContext(requireActiveTenant(ctx), ...)`) instead of being a
// void check that the call site might forget to wire up.
//
// Read-only paths (rendering a list, fetching a record) intentionally
// skip this gate — practitioners on a suspended tenant can still inspect
// their own data; they just can't write.
export function requireActiveTenant(ctx: TenantContext): TenantContext {
  if (ctx.lifecycleStatus !== "active") {
    throw new TenantInactiveError(ctx.tenantId, ctx.lifecycleStatus);
  }
  return ctx;
}
