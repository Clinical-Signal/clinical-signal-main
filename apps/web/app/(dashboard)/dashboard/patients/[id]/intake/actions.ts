"use server";

import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { patientBelongsToTenant } from "@/lib/records";
import {
  type IntakeSectionKey,
  saveIntakeSection,
  submitIntake,
} from "@/lib/intake";
import {
  recordIntakeSectionCompleted,
  recordIntakeSubmitted,
} from "@/lib/timeline";

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
    // Write to PatientTimeline (non-blocking — don't fail the save if this errors)
    recordIntakeSectionCompleted(user.tenantId, patientId, section, user.practitionerId).catch(
      (err) => console.error("[timeline] Failed to record intake section:", err),
    );
    return { ok: true, savedAt: res.savedAt, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SubmitIntakeResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function submitIntakeAction(
  patientId: string,
): Promise<SubmitIntakeResult> {
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
    // Write to PatientTimeline (non-blocking)
    recordIntakeSubmitted(user.tenantId, patientId, user.practitionerId).catch(
      (err) => console.error("[timeline] Failed to record intake submission:", err),
    );
    return { ok: true, redirectTo: `/dashboard/patients/${patientId}/intake/review` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
