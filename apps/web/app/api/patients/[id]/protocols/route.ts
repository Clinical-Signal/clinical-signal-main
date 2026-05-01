import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { patientBelongsToTenant } from "@/lib/records";
import { listProtocols } from "@/lib/protocols";

export async function GET(
  req: Request,
  ctx: { params: { id: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

    const protocols = await listProtocols(user.tenantId, ctx.params.id);
    return NextResponse.json(protocols.slice(0, limit));
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
