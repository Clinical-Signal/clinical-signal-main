import { describe, expect, it } from "vitest";

import { LEGACY_CONDITIONAL_QUESTION_BANKS } from "./question-banks";

/** Exact legacy prompts from dashboard sections 8–13 (manager-approved wording). */
const LEGACY_PROMPTS: Record<keyof typeof LEGACY_CONDITIONAL_QUESTION_BANKS, string[]> = {
  gut_deep_dive: [
    "Typical bowel habits (frequency)",
    "Bowel consistency",
    "Bloating: when does it happen? After specific foods?",
    "Heartburn or reflux?",
    "Gas or burping?",
    "Previous GI testing? (GI Map, SIBO breath test, endoscopy, colonoscopy)",
    "History of antibiotic use (frequency, most recent)",
    "History of antacid/PPI use",
    "Food elimination trials? What happened?",
  ],
  immune_deep_dive: [
    "Which autoimmune condition(s)?",
    "When diagnosed?",
    "Current treatment (medications, biologics)?",
    "Known triggers for flares?",
    "Frequency of common illness (colds, flu per year)",
    "Mold exposure history?",
    "Tick-borne illness history?",
  ],
  sleep_deep_dive: [
    "How often do you wake during the night?",
    "What time do you typically wake? (if 2–3× or frequently)",
    "Describe your bedtime routine",
    "Do you use screens within 1 hour of bed?",
    "Describe your sleep environment",
    "Any snoring, gasping, or suspected sleep apnea?",
    "Restless legs or leg cramps at night?",
    "Do you use any sleep aids?",
    "How does your energy change throughout the day?",
    "Do you consume caffeine after noon?",
    "How often do you nap?",
  ],
  stress_deep_dive: [
    "What type of stress are you experiencing?",
    "How long have you been under significant stress?",
    "Do you experience physical symptoms of stress?",
    "How often do you experience anxiety?",
    'What tends to trigger your anxiety? (if not "rarely")',
    "Have you experienced panic attacks?",
    "Any history of significant emotional trauma?",
    "What do you currently do to manage stress?",
    "Do you feel you have a solid support system?",
    "Are you currently in therapy or counseling?",
    "Do you notice signs of nervous system dysregulation?",
    "Do you eat differently when stressed or emotional?",
    "On a scale of 1–10, how overwhelmed do you feel most days?",
  ],
  skin_deep_dive: [
    "What is your primary skin concern?",
    "When did it start or get worse?",
    "Where on your body is it primarily?",
    "Do you notice any patterns or triggers?",
    "What treatments have you tried?",
    "Have you seen a dermatologist? What did they recommend?",
    "What topical products do you currently use?",
    "Have you noticed a connection between your diet and your skin?",
    "Does your skin change with stress?",
    "Does your skin change with your menstrual cycle?",
    "Family history of skin conditions?",
  ],
  metabolism_deep_dive: [
    "What's your weight-related goal?",
    "Describe your weight history",
    "What weight loss approaches have you tried?",
    "Do you experience weight fluctuations?",
    "Describe your hunger patterns",
    "What cravings do you experience?",
    "Do you experience energy crashes?",
    "Have you been diagnosed with any blood sugar or metabolic conditions?",
    "Fasting glucose (if known)",
    "HbA1c (if known)",
    "Family history of metabolic conditions?",
    "Describe your typical meal timing",
    "How quickly do you eat?",
    "Have you done body composition testing? (DEXA, InBody, etc.)",
    "How motivated are you to make dietary/lifestyle changes for weight loss?",
  ],
};

describe("legacy conditional question banks (sections 8–13)", () => {
  for (const [moduleKey, expectedPrompts] of Object.entries(LEGACY_PROMPTS)) {
    it(`${moduleKey} includes every legacy prompt verbatim`, () => {
      const bank =
        LEGACY_CONDITIONAL_QUESTION_BANKS[
          moduleKey as keyof typeof LEGACY_CONDITIONAL_QUESTION_BANKS
        ];
      const actualPrompts = bank.map((q) => q.prompt);
      expect(actualPrompts).toEqual(expectedPrompts);
    });
  }
});
