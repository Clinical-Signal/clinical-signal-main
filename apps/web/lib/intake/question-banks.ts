/**
 * Static fallback question banks (Phase 4 / Task 2).
 * Sections 8–13 map to legacy dashboard conditional deep dives; see slice files
 * `question-banks-legacy-8-11.ts` and `question-banks-legacy-12-13.ts`.
 */
import {
  MODULE_KEYS,
  type ModuleKey,
  type Question,
} from "./schemas/question-plan.schema";

import { freeText, yesNo, slider } from "./question-bank-controls";
import {
  GUT_DEEP_DIVE_BANK,
  IMMUNE_DEEP_DIVE_BANK,
  SLEEP_DEEP_DIVE_BANK,
  STRESS_DEEP_DIVE_BANK,
} from "./question-banks-legacy-8-11";
import {
  METABOLISM_DEEP_DIVE_BANK,
  SKIN_DEEP_DIVE_BANK,
} from "./question-banks-legacy-12-13";

export {
  GUT_DEEP_DIVE_BANK,
  IMMUNE_DEEP_DIVE_BANK,
  SLEEP_DEEP_DIVE_BANK,
  STRESS_DEEP_DIVE_BANK,
  SKIN_DEEP_DIVE_BANK,
  METABOLISM_DEEP_DIVE_BANK,
};

/** Legacy conditional deep dives only (dashboard sections 8–13). */
export const LEGACY_CONDITIONAL_QUESTION_BANKS = {
  gut_deep_dive: GUT_DEEP_DIVE_BANK,
  immune_deep_dive: IMMUNE_DEEP_DIVE_BANK,
  sleep_deep_dive: SLEEP_DEEP_DIVE_BANK,
  stress_deep_dive: STRESS_DEEP_DIVE_BANK,
  skin_deep_dive: SKIN_DEEP_DIVE_BANK,
  metabolism_deep_dive: METABOLISM_DEEP_DIVE_BANK,
} as const;

type QuestionBank = readonly Question[];

const BANKS = {
  gut_deep_dive: GUT_DEEP_DIVE_BANK,
  hormone_deep_dive: [
    yesNo("cycle_changes", "Have you noticed changes in your menstrual cycle?"),
    yesNo("hot_flashes", "Do you experience hot flashes or night sweats?"),
    yesNo("libido_changes", "Have you noticed changes in libido or mood?"),
    slider(
      "energy_slump",
      "Rate afternoon energy slumps (0 = none, 10 = severe)",
      0,
      10,
      1,
    ),
  ],
  immune_deep_dive: IMMUNE_DEEP_DIVE_BANK,
  medication_followups: [
    yesNo("med_dose_known", "Do you know the dose for each medication you listed?"),
    yesNo("med_timing", "Do you take medications at consistent times each day?"),
    freeText(
      "med_side_effects",
      "List any side effects you attribute to current medications.",
      true,
      500,
    ),
    freeText(
      "supplement_details",
      "List supplements with brand, dose, and how long you have taken them.",
      true,
      800,
    ),
  ],
  sleep_deep_dive: SLEEP_DEEP_DIVE_BANK,
  stress_deep_dive: STRESS_DEEP_DIVE_BANK,
  skin_deep_dive: SKIN_DEEP_DIVE_BANK,
  metabolism_deep_dive: METABOLISM_DEEP_DIVE_BANK,
  wellness_practice: [
    yesNo("sauna_regular", "Do you use sauna or heat exposure regularly?"),
    yesNo("cold_exposure_regular", "Do you use deliberate cold exposure regularly?"),
    yesNo("meditation_regular", "Do you meditate or use breathwork regularly?"),
    freeText(
      "wellness_notes",
      "Describe frequency and any effects you notice from these practices.",
      true,
      400,
    ),
  ],
  previous_labs_followups: [
    yesNo("labs_within_year", "Have you had labs drawn in the past 12 months?"),
    yesNo("labs_shared", "Can you share or upload those lab results?"),
    freeText(
      "labs_of_interest",
      "Which labs or markers are you most curious about?",
      false,
      300,
    ),
    yesNo("labs_followup_needed", "Would you like help interpreting prior labs?"),
  ],
} satisfies Record<ModuleKey, QuestionBank>;

/** Static fallback questions per module when LLM output is unavailable. */
export const QUESTION_BANKS: Record<ModuleKey, QuestionBank> = BANKS;

/** Returns fallback questions for a module (never empty for known keys). */
export function getFallbackQuestions(moduleKey: ModuleKey): QuestionBank {
  return QUESTION_BANKS[moduleKey];
}

/** Ensures compile-time coverage of every schema module key. */
export const QUESTION_BANK_MODULE_KEYS: readonly ModuleKey[] = MODULE_KEYS;
