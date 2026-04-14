import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/session-constants";

// Edge-runtime middleware: can't hit Postgres. Does a cheap cookie-presence
// gate only — the authoritative session check (expiry, revocation) happens in
// the (dashboard) layout server component via requireAuth().
export function middleware(req: NextRequest) {
  const hasCookie = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
