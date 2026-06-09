/**
 * Deterministic trigger map — pure signal→module map (PRD §5.2, matrix §1.3 D-DT-1–D-DT-4).
 */

export type DeterministicModuleKey =
  | "gut_deep_dive"
  | "hormone_deep_dive"
  | "immune_deep_dive"
  | "medication_followups"
  | "wellness_practice"
  | "previous_labs_followups";

export type StepOneTriggerInput = {
  digestive_symptoms: boolean;
  hormonal_symptoms: boolean;
  autoimmune: boolean;
  medications: string[] | null;
  sauna: boolean;
  cold_exposure: boolean;
  meditation: boolean;
  prior_labs: boolean;
};

function hasMedicationTrigger(medications: string[] | null): boolean {
  if (medications === null) {
    return false;
  }

  return medications.some((entry) => entry.trim().length > 0);
}

function hasWellnessPracticeTrigger(input: StepOneTriggerInput): boolean {
  return input.sauna || input.cold_exposure || input.meditation;
}

/** D-DT-1: canonical order — dig, hor, aut, med, wellness, lab. */
export function getDeterministicTriggers(
  input: StepOneTriggerInput,
): DeterministicModuleKey[] {
  const triggers: DeterministicModuleKey[] = [];

  if (input.digestive_symptoms) {
    triggers.push("gut_deep_dive");
  }

  if (input.hormonal_symptoms) {
    triggers.push("hormone_deep_dive");
  }

  if (input.autoimmune) {
    triggers.push("immune_deep_dive");
  }

  if (hasMedicationTrigger(input.medications)) {
    triggers.push("medication_followups");
  }

  if (hasWellnessPracticeTrigger(input)) {
    triggers.push("wellness_practice");
  }

  if (input.prior_labs) {
    triggers.push("previous_labs_followups");
  }

  return triggers;
}
