import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocolOutputs } from "@/lib/protocol-outputs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) {
      return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    }

    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) {
      return apiError(ERROR_CODES.NOT_FOUND, 404);
    }

    const outputs = await getProtocolOutputs(user.tenantId, ctx.params.protocolId);

    return NextResponse.json({ outputs });
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
