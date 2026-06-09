import { NextResponse, type NextRequest } from "next/server";
import {
  allowedRolesForPath,
  isMiddlewareRole,
  isPathAllowedForRole,
  MIDDLEWARE_ROLES,
} from "./lib/middleware/rbac-routes";
import {
  MFA_VERIFIED_COOKIE_NAME,
  ROLE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./lib/session-constants";

// Edge-runtime middleware: can't hit Postgres. Session cookie proves
// password auth; MFA cookie mirrors sessions.mfa_verified_at (set server-side
// after TOTP challenge). Authoritative MFA checks also run in requireAuth().
// Role cookie mirrors practitioners.role at login for SEC-6 page gates.
export async function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const hasMfa = !!req.cookies.get(MFA_VERIFIED_COOKIE_NAME)?.value;
  if (!hasMfa) {
    const url = req.nextUrl.clone();
    url.pathname = "/mfa/verify";
    return NextResponse.redirect(url);
  }

  const pathname = req.nextUrl.pathname;
  const roleRaw = req.cookies.get(ROLE_COOKIE_NAME)?.value;

  const denyWithAudit = () => {
    const auditUrl = new URL("/api/audit/edge-denial", req.url);
    void fetch(auditUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => undefined);

    const forbidden = req.nextUrl.clone();
    forbidden.pathname = "/403";
    return NextResponse.redirect(forbidden);
  };

  if (!roleRaw || !isMiddlewareRole(roleRaw)) {
    const required = allowedRolesForPath(pathname);
    if (required.length < MIDDLEWARE_ROLES.length) {
      return denyWithAudit();
    }
    return NextResponse.next();
  }

  if (!isPathAllowedForRole(pathname, roleRaw)) {
    return denyWithAudit();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
