/**
 * SEC-6 — Edge-safe dashboard route → role mapping (PRD §5.6).
 * Consumed by middleware.ts only; server actions re-check capabilities.
 */

export type MiddlewareRole = "owner" | "practitioner" | "viewer" | "coach";

export const MIDDLEWARE_ROLES: readonly MiddlewareRole[] = [
  "owner",
  "practitioner",
  "viewer",
  "coach",
] as const;

const DEFAULT_DASHBOARD_ROLES: readonly MiddlewareRole[] = MIDDLEWARE_ROLES;

/** Most-specific prefix wins; evaluated top-to-bottom. */
const RESTRICTED_PREFIXES: ReadonlyArray<{
  prefix: string;
  roles: readonly MiddlewareRole[];
}> = [
  { prefix: "/dashboard/audit-log", roles: ["owner"] },
  { prefix: "/dashboard/settings/practitioners", roles: ["owner"] },
];

export function isMiddlewareRole(value: string): value is MiddlewareRole {
  return (MIDDLEWARE_ROLES as readonly string[]).includes(value);
}

export function allowedRolesForPath(pathname: string): readonly MiddlewareRole[] {
  for (const rule of RESTRICTED_PREFIXES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.roles;
    }
  }
  if (pathname.startsWith("/dashboard")) {
    return DEFAULT_DASHBOARD_ROLES;
  }
  return DEFAULT_DASHBOARD_ROLES;
}

export function isPathAllowedForRole(
  pathname: string,
  role: MiddlewareRole,
): boolean {
  return allowedRolesForPath(pathname).includes(role);
}
