import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { listRecords, patientBelongsToTenant } from "@/lib/records";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const user = await apiAuth();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = await listRecords(user.tenantId, ctx.params.id);
  return NextResponse.json(rows);
}
