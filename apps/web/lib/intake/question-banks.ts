import {
  MODULE_KEYS,
  type ModuleKey,
  type Question,
} from "./schemas/question-plan.schema";

type QuestionBank = readonly Question[];

function yesNo(
  id: string,
  prompt: string,
  priority: Question["priority"] = "must_have",
): Question {
  return {
    id,
    prompt,
    control: { kind: "yes_no" },
    priority,
    required: true,
  };
}

function chips(
  id: string,
  prompt: string,
  options: Array<{ value: string; label: string }>,
  multi = false,
): Question {
  return {
    id,
    prompt,
    control: { kind: "chips", multi, options },
    priority: "must_have",
    required: true,
  };
}

function slider(
  id: string,
  prompt: string,
  min: number,
  max: number,
  step: number,
  unit?: string,
): Question {
  const control: Question["control"] = {
    kind: "slider",
    min,
    max,
    step,
  };
  if (unit !== undefined) {
    return {
      id,
      prompt,
      control: { ...control, unit },
      priority: "must_have",
      required: true,
    };
  }
  return {
    id,
    prompt,
    control,
    priority: "must_have",
    required: true,
  };
}

function freeText(
  id: string,
  prompt: string,
  multiline: boolean,
  maxChars: number,
): Question {
  return {
    id,
    prompt,
    control: { kind: "free_text", multiline, max_chars: maxChars },
    priority: "must_have",
    required: false,
  };
}

function numeric(
  id: string,
  prompt: string,
  min: number,
  max: number,
): Question {
  return {
    id,
    prompt,
    control: { kind: "numeric", min, max },
    priority: "must_have",
    required: false,
  };
}

/** Legacy dashboard gut deep dive (section 8). */
const GUT_DEEP_DIVE_BANK: QuestionBank = [
  freeText(
    "bowel_frequency",
    "Typical bowel habits (frequency)",
    true,
    2000,
  ),
  freeText("bowel_consistency", "Bowel consistency", true, 2000),
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

/** Legacy dashboard immune deep dive (section 9). */
const IMMUNE_DEEP_DIVE_BANK: QuestionBank = [
  freeText(
    "autoimmune_conditions",
    "Which autoimmune condition(s)?",
    false,
    500,
  ),
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
    20,
  ),
  freeText("mold_exposure", "Mold exposure history?", true, 2000),
  freeText("tick_borne_illness", "Tick-borne illness history?", true, 2000),
];

/** Legacy dashboard sleep deep dive (section 10). */
const SLEEP_DEEP_DIVE_BANK: QuestionBank = [
  chips("wake_during_night", "How often do you wake during the night?", [
    { value: "never", label: "Never" },
    { value: "once", label: "Once" },
    { value: "2-3_times", label: "2–3 times" },
    { value: "frequently", label: "Frequently (4+)" },
  ]),
  freeText(
    "wake_time_pattern",
    "What time do you typically wake? (if 2–3× or frequently)",
    false,
    200,
  ),
  freeText("bedtime_routine", "Describe your bedtime routine", true, 2000),
  chips(
    "screen_time_before_bed",
    "Do you use screens within 1 hour of bed?",
    [
      { value: "never", label: "Never/rarely" },
      { value: "sometimes", label: "Sometimes" },
      { value: "always", label: "Almost always" },
    ],
  ),
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
  yesNo("caffeine_after_noon", "Do you consume caffeine after noon?"),
  freeText("nap_frequency", "How often do you nap?", false, 500),
];

/** Legacy dashboard stress deep dive (section 11). */
const STRESS_DEEP_DIVE_BANK: QuestionBank = [
  freeText(
    "stress_type",
    "What type of stress are you experiencing?",
    true,
    2000,
  ),
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
    { value: "weekly", label: "Few times a week" },
    { value: "daily", label: "Daily" },
    { value: "constant", label: "Nearly constant" },
  ]),
  freeText(
    "anxiety_triggers",
    "What tends to trigger your anxiety? (if not “rarely”)",
    true,
    2000,
  ),
  chips("panic_attacks", "Have you experienced panic attacks?", [
    { value: "never", label: "Never" },
    { value: "past", label: "In the past" },
    { value: "current", label: "Currently" },
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
    "overwhelm_capacity",
    "On a scale of 1–10, how overwhelmed do you feel most days?",
    1,
    10,
    1,
  ),
];

/** Legacy dashboard skin deep dive (section 12). */
const SKIN_DEEP_DIVE_BANK: QuestionBank = [
  freeText(
    "primary_skin_concern",
    "What is your primary skin concern?",
    true,
    2000,
  ),
  freeText("onset_timing", "When did it start or get worse?", false, 500),
  freeText(
    "location_on_body",
    "Where on your body is it primarily?",
    false,
    500,
  ),
  freeText(
    "triggers_or_patterns",
    "Do you notice any patterns or triggers?",
    true,
    2000,
  ),
  freeText(
    "tried_treatments",
    "What treatments have you tried?",
    true,
    2000,
  ),
  freeText(
    "dermatologist_history",
    "Have you seen a dermatologist? What did they recommend?",
    true,
    2000,
  ),
  freeText(
    "topical_products",
    "What topical products do you currently use?",
    true,
    2000,
  ),
  freeText(
    "diet_skin_connection",
    "Have you noticed a connection between your diet and your skin?",
    true,
    2000,
  ),
  chips("stress_skin_connection", "Does your skin change with stress?", [
    { value: "worse_with_stress", label: "Worse with stress" },
    { value: "improves_when_relaxed", label: "Improves when relaxed" },
    { value: "no_connection", label: "No connection" },
  ]),
  chips(
    "cycle_skin_connection",
    "Does your skin change with your menstrual cycle?",
    [
      { value: "worse_before_during", label: "Worse before/during period" },
      { value: "around_ovulation", label: "Around ovulation" },
      { value: "no_pattern", label: "No pattern" },
      { value: "na", label: "N/A" },
    ],
  ),
  freeText(
    "family_skin_history",
    "Family history of skin conditions?",
    true,
    2000,
  ),
];

/** Legacy dashboard weight & metabolism deep dive (section 13). */
const METABOLISM_DEEP_DIVE_BANK: QuestionBank = [
  chips("weight_goal", "What's your weight-related goal?", [
    { value: "lose", label: "Lose" },
    { value: "gain", label: "Gain" },
    { value: "maintain", label: "Maintain" },
    { value: "recomposition", label: "Body recomposition" },
  ]),
  freeText("weight_history", "Describe your weight history", true, 2000),
  freeText(
    "weight_loss_attempts",
    "What weight loss approaches have you tried?",
    true,
    2000,
  ),
  freeText(
    "weight_fluctuations",
    "Do you experience weight fluctuations?",
    true,
    2000,
  ),
  freeText("hunger_patterns", "Describe your hunger patterns", true, 2000),
  freeText("cravings", "What cravings do you experience?", true, 2000),
  freeText("energy_crashes", "Do you experience energy crashes?", true, 2000),
  freeText(
    "blood_sugar_diagnosed",
    "Have you been diagnosed with any blood sugar or metabolic conditions?",
    true,
    2000,
  ),
  freeText("fasting_glucose_known", "Fasting glucose (if known)", false, 200),
  freeText("a1c_known", "HbA1c (if known)", false, 200),
  freeText(
    "family_metabolic_history",
    "Family history of metabolic conditions?",
    true,
    2000,
  ),
  freeText("meal_timing", "Describe your typical meal timing", true, 2000),
  chips("eating_speed", "How quickly do you eat?", [
    { value: "fast", label: "Fast" },
    { value: "moderate", label: "Moderate" },
    { value: "slow", label: "Slow" },
  ]),
  freeText(
    "body_composition_testing",
    "Have you done body composition testing?",
    true,
    2000,
  ),
  slider(
    "motivation_for_weight_change",
    "How motivated are you to make dietary/lifestyle changes for weight loss? (if goal = lose)",
    1,
    10,
    1,
  ),
];

const BANKS = {
  gut_deep_dive: GUT_DEEP_DIVE_BANK,
  hormone_deep_dive: [
    yesNo("cycle_changes", "Have you noticed changes in your menstrual cycle?"),
    yesNo("hot_flashes", "Do you experience hot flashes or night sweats?"),
    yesNo("libido_changes", "Have you noticed changes in libido or mood?"),
    slider("energy_slump", "Rate afternoon energy slumps (0 = none, 10 = severe)", 0, 10, 1),
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
