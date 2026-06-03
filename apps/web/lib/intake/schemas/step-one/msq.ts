import { z } from "zod";

import {
  MSQ_CATEGORIES,
  MSQ_SYMPTOMS,
  type MsqCategory,
} from "@/lib/intake-schema";

export { MSQ_CATEGORIES, MSQ_SYMPTOMS, type MsqCategory };

export const MsqScoreSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type MsqScore = z.infer<typeof MsqScoreSchema>;

const MsqCategoryScoresSchema = z.record(z.string(), MsqScoreSchema);

export const SymptomsSchema = z.object({
  symptoms: z.array(z.unknown()).default([]),
  top_concerns: z.string().max(2000).default(""),
  msq_scores: z
    .record(z.string(), MsqCategoryScoresSchema)
    .optional(),
});

export type Symptoms = z.infer<typeof SymptomsSchema>;

export function createEmptyMsqScores(): Record<MsqCategory, Record<string, MsqScore>> {
  const scores = {} as Record<MsqCategory, Record<string, MsqScore>>;
  for (const cat of MSQ_CATEGORIES) {
    scores[cat] = {};
    for (const symptom of MSQ_SYMPTOMS[cat]) {
      scores[cat][symptom] = 0;
    }
  }
  return scores;
}

export function createEmptySymptoms(): Symptoms {
  return {
    symptoms: [],
    top_concerns: "",
    msq_scores: createEmptyMsqScores(),
  };
}

export function msqDigestiveTriggered(scores: Symptoms["msq_scores"]): boolean {
  const digestive = scores?.digestive;
  if (!digestive) {
    return false;
  }
  return Object.values(digestive).some((score) => score > 0);
}

export function msqAutoimmuneTriggered(scores: Symptoms["msq_scores"]): boolean {
  const other = scores?.other;
  const frequent = other?.["Frequent illness"];
  return typeof frequent === "number" && frequent > 0;
}
