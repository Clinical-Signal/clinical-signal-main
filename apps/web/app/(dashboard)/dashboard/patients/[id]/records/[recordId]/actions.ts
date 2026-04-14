"use server";

import { requireAuth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { saveLabCorrections, type LabValue } from "@/lib/records";

const VALID_FLAGS = new Set<LabValue["flag"]>(["normal", "high", "low", "unknown"]);

export async function saveLabsAction(recordId: string, labs: LabValue[]) {
  const user = await requireAuth();

  // Light validation. The UI already constrains inputs; this is defense in depth.
  const cleaned: LabValue[] = labs
    .filter((l) => l && typeof l.test_name === "string" && l.test_name.trim())
    .slice(0, 500)
    .map((l) => ({
      test_name: String(l.test_name).slice(0, 200),
      value: String(l.value ?? "").slice(0, 100),
      unit: l.unit ? String(l.unit).slice(0, 40) : null,
      reference_range: l.reference_range ? String(l.reference_range).slice(0, 80) : null,
      flag: VALID_FLAGS.has(l.flag) ? l.flag : "unknown",
      collected_at: l.collected_at ?? null,
    }));

  try {
    await saveLabCorrections(user.tenantId, recordId, cleaned);
    await writeAudit({
      action: "signup", // placeholder bucket
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      resourceType: "record",
      resourceId: recordId,
      metadata: { event: "lab_corrections_saved", row_count: cleaned.length },
    });
    return { ok: true as const };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Save failed." };
  }
}
