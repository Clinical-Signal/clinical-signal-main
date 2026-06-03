import { IntakeTokenError } from "./intake-token";

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "127.0.0.1";
}

export function tokenErrorResponse(error: unknown): Response {
  if (!(error instanceof IntakeTokenError)) {
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  switch (error.code) {
    case "invalid_token":
      return Response.json({ error: "INVALID_TOKEN" }, { status: 404 });
    case "expired":
    case "revoked":
    case "completed":
      return Response.json({ error: error.code.toUpperCase() }, { status: 401 });
    case "rate_limited":
    case "locked_out":
      return Response.json({ error: error.code.toUpperCase() }, { status: 429 });
    default:
      return Response.json({ error: "TOKEN_ERROR" }, { status: 400 });
  }
}
