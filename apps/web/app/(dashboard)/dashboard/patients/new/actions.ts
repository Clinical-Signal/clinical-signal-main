"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createPatient } from "@/lib/patients";
import { writeAudit } from "@/lib/audit";
import { sendPatientIntakeLink } from "@/lib/intake/send-patient-intake-link";
import { logSafeError } from "@/lib/log-safe";

export async function createPatientAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const user = await requireAuth();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const dob = String(formData.get("dob") ?? "");
  const notes = String(formData.get("notes") ?? "");

  if (!name.trim()) return { error: "Name is required." };
  if (!email.trim()) return { error: "Email is required." };

  let id: string;
  try {
    id = await createPatient({
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      name,
      email,
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

  void sendPatientIntakeLink({
    tenantId: user.tenantId,
    practitionerId: user.practitionerId,
    patientId: id,
    patientEmail: email,
  }).catch((err) => {
    logSafeError("[create-patient] intake_email_failed", err);
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/patients/${id}`);
  redirect(`/dashboard/patients/${id}`);
}
