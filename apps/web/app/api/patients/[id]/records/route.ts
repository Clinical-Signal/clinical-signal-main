import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listRecords, patientBelongsToTenant } from "@/lib/records";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = await listRecords(user.tenantId, ctx.params.id);
  return NextResponse.json(rows);
}
