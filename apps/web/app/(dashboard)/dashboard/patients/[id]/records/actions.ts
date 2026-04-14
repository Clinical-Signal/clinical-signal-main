"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { acceptLabUpload, patientBelongsToTenant, MAX_UPLOAD_BYTES } from "@/lib/records";

export async function uploadLabAction(
  _prev: { error?: string; recordId?: string } | undefined,
  formData: FormData,
) {
  const user = await requireAuth();
  const patientId = String(formData.get("patientId") ?? "");
  if (!patientId) return { error: "Missing patient id." };
  const ok = await patientBelongsToTenant(user.tenantId, patientId);
  if (!ok) return { error: "Patient not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file uploaded." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "File exceeds 50 MB." };
  if (file.type !== "application/pdf") return { error: "Only PDF files are supported." };

  try {
    const { recordId } = await acceptLabUpload({
      tenantId: user.tenantId,
      patientId,
      file,
    });
    await writeAudit({
      action: "signup", // placeholder bucket; a record-specific action lands with the audit viewer
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "record",
      resourceId: recordId,
      metadata: { event: "lab_uploaded", patient_id: patientId, byte_size: file.size },
    });
    revalidatePath(`/dashboard/patients/${patientId}/records`);
    return { recordId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
}
