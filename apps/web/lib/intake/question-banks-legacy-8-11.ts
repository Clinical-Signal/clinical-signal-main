import type { Question } from "./schemas/question-plan.schema";

import { bristol, chips, freeText, numeric, slider, yesNo } from "./question-bank-controls";

/** Legacy dashboard §8 — gut health deep dive. */
export const GUT_DEEP_DIVE_BANK: readonly Question[] = [
  freeText("bowel_frequency", "Typical bowel habits (frequency)", true, 2000),
  bristol("bowel_consistency", "Bowel consistency"),
  freeText(
    "bloating_details",
    "Bloating: when does it happen? After specific foods?",
    true,
    2000,
  ),
  freeText("heartburn_reflux", "Heartburn or reflux?", true, 2000),
  freeText("gas_burping", "Gas or burping?", true, 2000),
  freeText(
    "previous_gi_testing",
    "Previous GI testing? (GI Map, SIBO breath test, endoscopy, colonoscopy)",
    true,
    2000,
  ),
  freeText(
    "antibiotic_history",
    "History of antibiotic use (frequency, most recent)",
    true,
    2000,
  ),
  freeText("antacid_ppi_history", "History of antacid/PPI use", true, 2000),
  freeText(
    "elimination_trials",
    "Food elimination trials? What happened?",
    true,
    2000,
  ),
];

/** Legacy dashboard §9 — immune deep dive. */
export const IMMUNE_DEEP_DIVE_BANK: readonly Question[] = [
  freeText("autoimmune_conditions", "Which autoimmune condition(s)?", false, 500),
  freeText("diagnosed_when", "When diagnosed?", false, 200),
  freeText(
    "current_treatment",
    "Current treatment (medications, biologics)?",
    true,
    2000,
  ),
  freeText("flare_triggers", "Known triggers for flares?", true, 2000),
  numeric(
    "illness_frequency_per_year",
    "Frequency of common illness (colds, flu per year)",
    0,
    50,
  ),
  freeText("mold_exposure", "Mold exposure history?", true, 2000),
  freeText("tick_borne_illness", "Tick-borne illness history?", true, 2000),
];

/** Legacy dashboard §10 — sleep deep dive. */
export const SLEEP_DEEP_DIVE_BANK: readonly Question[] = [
  chips("wake_during_night", "How often do you wake during the night?", [
    { value: "never", label: "Never" },
    { value: "once", label: "Once" },
    { value: "2_3_times", label: "2–3 times" },
    { value: "frequently_4_plus", label: "Frequently (4+)" },
  ]),
  freeText(
    "wake_time_pattern",
    "What time do you typically wake? (if 2–3× or frequently)",
    false,
    200,
  ),
  freeText("bedtime_routine", "Describe your bedtime routine", true, 2000),
  chips("screen_time_before_bed", "Do you use screens within 1 hour of bed?", [
    { value: "never_rarely", label: "Never/rarely" },
    { value: "sometimes", label: "Sometimes" },
    { value: "almost_always", label: "Almost always" },
  ]),
  freeText("sleep_environment", "Describe your sleep environment", true, 2000),
  freeText(
    "snoring_apnea",
    "Any snoring, gasping, or suspected sleep apnea?",
    true,
    2000,
  ),
  freeText(
    "restless_legs",
    "Restless legs or leg cramps at night?",
    true,
    2000,
  ),
  freeText("sleep_aids", "Do you use any sleep aids?", true, 2000),
  freeText(
    "energy_pattern_during_day",
    "How does your energy change throughout the day?",
    true,
    2000,
  ),
  chips("caffeine_after_noon", "Do you consume caffeine after noon?", [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ]),
  freeText("nap_frequency", "How often do you nap?", false, 500),
];

/** Legacy dashboard §11 — stress & nervous system deep dive. */
export const STRESS_DEEP_DIVE_BANK: readonly Question[] = [
  freeText("stress_type", "What type of stress are you experiencing?", true, 2000),
  freeText(
    "stress_duration",
    "How long have you been under significant stress?",
    true,
    2000,
  ),
  freeText(
    "physical_stress_symptoms",
    "Do you experience physical symptoms of stress?",
    true,
    2000,
  ),
  chips("anxiety_frequency", "How often do you experience anxiety?", [
    { value: "rarely", label: "Rarely" },
    { value: "few_times_week", label: "Few times a week" },
    { value: "daily", label: "Daily" },
    { value: "nearly_constant", label: "Nearly constant" },
  ]),
  freeText(
    "anxiety_triggers",
    'What tends to trigger your anxiety? (if not "rarely")',
    true,
    2000,
  ),
  chips("panic_attacks", "Have you experienced panic attacks?", [
    { value: "never", label: "Never" },
    { value: "in_the_past", label: "In the past" },
    { value: "currently", label: "Currently" },
  ]),
  freeText(
    "trauma_history",
    "Any history of significant emotional trauma?",
    true,
    2000,
  ),
  freeText(
    "coping_mechanisms",
    "What do you currently do to manage stress?",
    true,
    2000,
  ),
  freeText(
    "support_system",
    "Do you feel you have a solid support system?",
    true,
    2000,
  ),
  freeText(
    "therapy_counseling",
    "Are you currently in therapy or counseling?",
    true,
    2000,
  ),
  freeText(
    "nervous_system_signs",
    "Do you notice signs of nervous system dysregulation?",
    true,
    2000,
  ),
  freeText(
    "emotional_eating",
    "Do you eat differently when stressed or emotional?",
    true,
    2000,
  ),
  slider(
    "overwhelm_level",
    "On a scale of 1–10, how overwhelmed do you feel most days?",
    1,
    10,
    1,
  ),
];
