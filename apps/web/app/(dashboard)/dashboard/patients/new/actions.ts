"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createPatient } from "@/lib/patients";
import { writeAudit } from "@/lib/audit";

export async function createPatientAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const user = await requireAuth();
  const name = String(formData.get("name") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!name.trim()) return { error: "Name is required." };

  try {
    const id = await createPatient({
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      name,
      dob: dob || null,
      notes: notes || null,
    });
    await writeAudit({
      action: "signup", // placeholder bucket until a patient-specific action type lands
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "patient",
      resourceId: id,
      metadata: { event: "patient_created" },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create patient." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
