"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  type IntakeSectionKey,
  saveIntakeSection,
  submitIntake,
} from "@/lib/intake";

export type SaveSectionResult =
  | { ok: true; savedAt: string; status: string }
  | { ok: false; error: string };

export async function saveSectionAction(
  patientId: string,
  section: IntakeSectionKey,
  value: unknown,
): Promise<SaveSectionResult> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };
  try {
    const res = await saveIntakeSection(user.tenantId, patientId, section, value);
    await writeAudit({
      action: "intake_saved",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "patient",
      resourceId: patientId,
      metadata: { section },
    });
    return { ok: true, savedAt: res.savedAt, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function submitIntakeAction(
  patientId: string,
): Promise<{ ok: false; error: string } | never> {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { ok: false, error: "Patient not found." };
  try {
    await submitIntake(user.tenantId, patientId);
    await writeAudit({
      action: "intake_submitted",
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "patient",
      resourceId: patientId,
    });
    redirect(`/dashboard/patients/${patientId}/intake/review`);
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // Next redirect
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
