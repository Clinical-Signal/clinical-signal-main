import { NextResponse, type NextRequest } from "next/server";
import {
  MFA_VERIFIED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./lib/session-constants";

// Edge-runtime middleware: can't hit Postgres. Session cookie proves
// password auth; MFA cookie mirrors sessions.mfa_verified_at (set server-side
// after TOTP challenge). Authoritative MFA checks also run in requireAuth().
export function middleware(req: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
