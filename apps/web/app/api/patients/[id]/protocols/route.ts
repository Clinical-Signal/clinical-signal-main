import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { listProtocols } from "@/lib/protocols";

export async function GET(
  req: Request,
  ctx: { params: { id: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

    const protocols = await listProtocols(user.tenantId, ctx.params.id);
    return NextResponse.json(protocols.slice(0, limit));
  } catch (err) {
    console.error("[protocols GET]", err);
    return NextResponse.json(
      { error: "Server error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 },
    );
  }
}
