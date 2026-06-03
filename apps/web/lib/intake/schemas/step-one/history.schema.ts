import { z } from "zod";

export const DiagnosisStatusSchema = z.enum(["active", "managed", "resolved", ""]);

export const DiagnosisSchema = z.object({
  condition: z.string().max(200).default(""),
  year: z.string().max(8).default(""),
  status: DiagnosisStatusSchema.default(""),
  treatment: z.string().max(500).default(""),
});

export const HistorySchema = z.object({
  diagnoses: z.array(DiagnosisSchema).default([]),
  surgeries: z.string().max(2000).default(""),
  family_history: z.string().max(2000).default(""),
});

export type History = z.infer<typeof HistorySchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

export function emptyDiagnosis(): Diagnosis {
  return { condition: "", year: "", status: "", treatment: "" };
}

export function createEmptyHistory(): History {
  return { diagnoses: [], surgeries: "", family_history: "" };
}
