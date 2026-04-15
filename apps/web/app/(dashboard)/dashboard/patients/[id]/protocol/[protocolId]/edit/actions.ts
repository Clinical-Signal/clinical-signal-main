"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  type ProtocolStatus,
  runGenerateProtocol,
  saveNewProtocolVersion,
  updateProtocolStatus,
} from "@/lib/protocols";
import { withTenant } from "@/lib/db";

export type SaveResult =
  | { ok: true; protocolId: string; version: number }
  | { ok: false; error: string };

export async function saveProtocolEdits(
  patientId: string,
  fromProtocolId: string,
  title: string,
  clinicalContent: Record<string, unknown>,
  clientContent: Record<string, unknown>,
): Promise<SaveResult> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };
  try {
    const res = await saveNewProtocolVersion({
      tenantId: user.tenantId,
      fromProtocolId,
      title,
      clinicalContent,
      clientContent,
      status: "draft",
    });
    await writeAudit({
      action: "protocol_edited",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "protocol",
      resourceId: res.protocolId,
      metadata: { from_protocol_id: fromProtocolId, version: res.version },
    });
    return { ok: true, protocolId: res.protocolId, version: res.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function changeProtocolStatus(
  patientId: string,
  protocolId: string,
  status: ProtocolStatus,
): Promise<{ ok: false; error: string } | { ok: true }> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };
  try {
    await updateProtocolStatus(user.tenantId, protocolId, status);
    await writeAudit({
      action: "protocol_status_changed",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "protocol",
      resourceId: protocolId,
      metadata: { status },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function regenerateProtocol(
  patientId: string,
  fromProtocolId: string,
): Promise<{ ok: false; error: string } | never> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };
  try {
    const analysisId = await withTenant(user.tenantId, async (c) => {
      const { rows } = await c.query<{ analysis_id: string | null }>(
        "SELECT analysis_id FROM protocols WHERE id = $1",
        [fromProtocolId],
      );
      return rows[0]?.analysis_id ?? null;
    });
    if (!analysisId) {
      return {
        ok: false,
        error: "This protocol has no linked analysis. Run analysis first.",
      };
    }
    const { protocolId } = await runGenerateProtocol({
      tenantId: user.tenantId,
      analysisId,
    });
    await writeAudit({
      action: "protocol_generated",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "protocol",
      resourceId: protocolId,
      metadata: { regenerated_from: fromProtocolId, analysis_id: analysisId },
    });
    redirect(`/dashboard/patients/${patientId}/protocol/${protocolId}/edit`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
