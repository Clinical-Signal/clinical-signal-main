import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { listRecords, patientBelongsToTenant } from "@/lib/records";
import { apiError, ERROR_CODES } from "@/lib/api-error";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);
    const rows = await listRecords(user.tenantId, ctx.params.id);
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
