import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { fetchProtocolPdf, protocolBelongsToPatient } from "@/lib/protocols";

export async function GET(
  req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  const user = await apiAuth();
  if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

  const protocolOk = await protocolBelongsToPatient(
    user.tenantId, ctx.params.protocolId, ctx.params.id,
  );
  if (!protocolOk) return apiError(ERROR_CODES.NOT_FOUND, 404);

  const url = new URL(req.url);
  const audience = url.searchParams.get("audience") === "client" ? "client" : "clinical";

  try {
    const { bytes, filename } = await fetchProtocolPdf({
      tenantId: user.tenantId,
      protocolId: ctx.params.protocolId,
      audience,
    });
    await writeAudit({
      action: "protocol_exported",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "protocol",
      resourceId: ctx.params.protocolId,
      metadata: { audience, bytes: bytes.length },
    });
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiError(ERROR_CODES.EXPORT_FAILED, 500, err);
  }
}
