import {
  MSQ_CATEGORIES,
  MSQ_SYMPTOMS,
  type MsqCategory,
  type MsqScore,
} from "@/lib/intake-schema";

export type MsqFlaggedSymptom = {
  category: MsqCategory;
  symptom: string;
  score: MsqScore;
};

/** MSQ entries with score > 0, highest scores first. */
export function listMsqFlaggedSymptoms(
  allScores: Partial<Record<MsqCategory, Record<string, MsqScore>>> | undefined,
): MsqFlaggedSymptom[] {
  if (!allScores) {
    return [];
  }

  const flagged: MsqFlaggedSymptom[] = [];

  for (const category of MSQ_CATEGORIES) {
    const categoryScores = allScores[category];
    if (!categoryScores) {
      continue;
    }

    const symptomNames = MSQ_SYMPTOMS[category];
    for (const symptom of symptomNames) {
      const score = categoryScores[symptom];
      if (score !== undefined && score > 0) {
        flagged.push({ category, symptom, score });
      }
    }
  }

  flagged.sort((a, b) => b.score - a.score || a.symptom.localeCompare(b.symptom));
  return flagged;
}
