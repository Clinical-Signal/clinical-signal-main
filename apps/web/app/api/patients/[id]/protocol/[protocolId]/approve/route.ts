import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol, approveProtocol } from "@/lib/protocols";
import { generateDerivativeOutputs } from "@/lib/protocol-outputs";
import { recordProtocolApproved } from "@/lib/timeline";

export async function POST(
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

    // Verify the protocol exists and belongs to this patient
    const protocol = await getProtocol(user.tenantId, ctx.params.protocolId);
    if (!protocol || protocol.patientId !== ctx.params.id) {
      return NextResponse.json({ error: "Protocol not found." }, { status: 404 });
    }

    if (protocol.status === "approved") {
      return NextResponse.json({ error: "Protocol is already approved." }, { status: 400 });
    }
    if (protocol.status === "superseded") {
      return NextResponse.json({ error: "Cannot approve a superseded protocol." }, { status: 400 });
    }

    await approveProtocol(user.tenantId, ctx.params.protocolId);

    await writeAudit({
      action: "protocol_status_changed",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      metadata: {
        patient_id: ctx.params.id,
        protocol_id: ctx.params.protocolId,
        new_status: "approved",
        version: protocol.version,
      },
    });

    // Record approval in PatientTimeline
    recordProtocolApproved(
      user.tenantId, ctx.params.id, ctx.params.protocolId, user.practitionerId,
    ).catch((err) => console.error("[timeline] Failed to record approval:", err));

    // Trigger derivative output generation (client doc, call deck, email draft).
    // This runs in the background — the approval response returns immediately.
    // Each output is independent; failures are logged but don't block each other.
    generateDerivativeOutputs({
      tenantId: user.tenantId,
      protocolId: ctx.params.protocolId,
      patientId: ctx.params.id,
      practitionerId: user.practitionerId,
      clinicalContent: protocol.clinicalContent,
      clientContent: protocol.clientContent,
    }).catch((err) => console.error("[protocol-outputs] Background generation failed:", err));

    return NextResponse.json({ ok: true, status: "approved" });
  } catch (err) {
    console.error("[protocol approve]", err);
    return NextResponse.json(
      { error: "Server error: " + (err instanceof Error ? err.message : String(err)) },
      { status: 500 },
    );
  }
}
