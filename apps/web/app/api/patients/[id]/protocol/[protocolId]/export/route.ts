import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { fetchProtocolPdf } from "@/lib/protocols";

export async function GET(
  req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
