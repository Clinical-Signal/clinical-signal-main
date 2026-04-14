"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { runAnalyze, runGenerateProtocol } from "@/lib/protocols";

export async function generateProtocolAction(
  patientId: string,
): Promise<{ ok: false; error: string } | never> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };

  try {
    const { analysisId } = await runAnalyze({
      tenantId: user.tenantId,
      patientId,
      practitionerId: user.practitionerId,
    });
    await writeAudit({
      action: "analysis_generated",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: { patient_id: patientId, analysis_id: analysisId },
    });

    const { protocolId } = await runGenerateProtocol({
      tenantId: user.tenantId,
      analysisId,
    });
    await writeAudit({
      action: "protocol_generated",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: { patient_id: patientId, analysis_id: analysisId, protocol_id: protocolId },
    });

    redirect(`/dashboard/patients/${patientId}/protocol/${protocolId}`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // Next redirect
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
