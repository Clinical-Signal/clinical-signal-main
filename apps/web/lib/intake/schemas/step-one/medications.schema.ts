import { z } from "zod";

export const MedicationRowSchema = z.object({
  name: z.string().max(200).default(""),
  dosage: z.string().max(120).default(""),
  frequency: z.string().max(120).default(""),
  duration: z.string().max(120).default(""),
  prescriber: z.string().max(120).default(""),
});

export const MedicationsSchema = z.object({
  prescriptions: z.array(MedicationRowSchema).default([]),
  supplements: z.array(MedicationRowSchema).default([]),
  recently_stopped: z.string().max(2000).default(""),
});

export type Medications = z.infer<typeof MedicationsSchema>;
export type MedicationRow = z.infer<typeof MedicationRowSchema>;

export function emptyMedicationRow(): MedicationRow {
  return { name: "", dosage: "", frequency: "", duration: "", prescriber: "" };
}

export function createEmptyMedications(): Medications {
  return { prescriptions: [], supplements: [], recently_stopped: "" };
}
