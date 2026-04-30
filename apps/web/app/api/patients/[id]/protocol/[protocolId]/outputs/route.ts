import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocolOutputs } from "@/lib/protocol-outputs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string; protocolId: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }

    const outputs = await getProtocolOutputs(user.tenantId, ctx.params.protocolId);

    return NextResponse.json({ outputs });
  } catch (err) {
    console.error("[protocol outputs]", err);
    return NextResponse.json(
      { error: "Server error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 },
    );
  }
}
