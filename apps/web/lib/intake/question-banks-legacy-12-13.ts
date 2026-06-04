import type { Question } from "./schemas/question-plan.schema";

import { chips, freeText, slider } from "./question-bank-controls";

/** Legacy dashboard §12 — skin deep dive. */
export const SKIN_DEEP_DIVE_BANK: readonly Question[] = [
  freeText(
    "primary_skin_concern",
    "What is your primary skin concern?",
    true,
    2000,
  ),
  freeText("onset_timing", "When did it start or get worse?", false, 500),
  freeText("location_on_body", "Where on your body is it primarily?", false, 500),
  freeText(
    "triggers_or_patterns",
    "Do you notice any patterns or triggers?",
    true,
    2000,
  ),
  freeText("tried_treatments", "What treatments have you tried?", true, 2000),
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
  chips("cycle_skin_connection", "Does your skin change with your menstrual cycle?", [
    { value: "worse_before_during_period", label: "Worse before/during period" },
    { value: "worse_around_ovulation", label: "Worse around ovulation" },
    { value: "no_pattern", label: "No pattern" },
    { value: "na", label: "N/A" },
  ]),
  freeText(
    "family_skin_history",
    "Family history of skin conditions?",
    true,
    2000,
  ),
];

/** Legacy dashboard §13 — weight & metabolism deep dive. */
export const METABOLISM_DEEP_DIVE_BANK: readonly Question[] = [
  chips("weight_goal", "What's your weight-related goal?", [
    { value: "lose", label: "Lose" },
    { value: "gain", label: "Gain" },
    { value: "maintain", label: "Maintain" },
    { value: "body_recomposition", label: "Body recomposition" },
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
  freeText("hba1c_known", "HbA1c (if known)", false, 200),
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
    "Have you done body composition testing? (DEXA, InBody, etc.)",
    true,
    2000,
  ),
  slider(
    "weight_loss_motivation",
    "How motivated are you to make dietary/lifestyle changes for weight loss?",
    1,
    10,
    1,
    undefined,
    false,
  ),
];
