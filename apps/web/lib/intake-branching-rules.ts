/**
 * Clinical Branching Rules v1 — Dr. Laura's intake logic.
 *
 * These rules control which sections and questions appear in the intake form
 * based on the patient's answers. They encode clinical reasoning about what
 * information is relevant for different patient presentations.
 *
 * VERSIONED: changing these rules changes the intake experience. Keep the
 * version string updated so we can track which rule set a patient completed.
 */

import type { BranchRule } from "./intake-branching";

export const BRANCHING_RULES_VERSION = "clinical_v1";

export const CLINICAL_BRANCHING_RULES: BranchRule[] = [
  // =========================================================================
  // SECTION-LEVEL RULES
  // =========================================================================

  // --- Gut Health Deep Dive ---
  // Trigger: any digestive symptom scored > 0 in MSQ, or keywords in v1 symptoms
  {
    id: "gut_deep_dive_msq",
    label: "Show gut deep dive when digestive symptoms flagged",
    target: { type: "section", sectionKey: "gut_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "msq_any_symptom_gt", category: "digestive", threshold: 0 },
        {
          type: "has_symptom_keyword",
          keywords: [
            "digestive", "bloating", "gas", "constipation", "diarrhea",
            "reflux", "ibs", "sibo", "gut", "heartburn", "nausea",
            "stomach", "bowel", "stool", "indigestion", "cramps",
          ],
        },
      ],
    },
  },

  // --- Immune Deep Dive ---
  // Trigger: autoimmune keywords, or "Frequent illness" in MSQ > 1
  {
    id: "immune_deep_dive_trigger",
    label: "Show immune deep dive when autoimmune or frequent illness flagged",
    target: { type: "section", sectionKey: "immune_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "msq_any_symptom_gt", category: "other", threshold: 1 },
        {
          type: "has_symptom_keyword",
          keywords: [
            "autoimmune", "immune", "lupus", "hashimoto", "rheumatoid",
            "multiple sclerosis", "ms", "psoriasis", "celiac", "crohn",
            "colitis", "sjogren", "graves", "alopecia areata",
          ],
        },
        // Also trigger if they report autoimmune conditions in health history
        { type: "field_not_empty", section: "history", field: "diagnoses" },
      ],
    },
    priority: 1,
  },

  // --- Sleep Deep Dive ---
  // Trigger: poor sleep quality, sleep issues mentioned, or MSQ head symptoms
  // (insomnia is in the head category)
  {
    id: "sleep_deep_dive_trigger",
    label: "Show sleep deep dive when sleep issues flagged",
    target: { type: "section", sectionKey: "sleep_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "field_in", section: "lifestyle", field: "sleep.quality", values: ["poor", "fair"] },
        { type: "field_in", section: "lifestyle", field: "sleep.wake_feeling_rested", values: ["never", "sometimes"] },
        { type: "field_not_empty", section: "lifestyle", field: "sleep.issues" },
        {
          type: "has_symptom_keyword",
          keywords: ["insomnia", "sleep", "fatigue", "tired", "waking", "restless"],
        },
      ],
    },
  },

  // --- Stress & Nervous System Deep Dive ---
  // Trigger: stress level > 6, or high emotional MSQ scores
  {
    id: "stress_deep_dive_trigger",
    label: "Show stress deep dive when stress or emotional burden flagged",
    target: { type: "section", sectionKey: "stress_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "field_gt", section: "lifestyle", field: "stress.level", value: 6 },
        { type: "msq_category_score_gt", category: "emotions", threshold: 4 },
        { type: "msq_category_score_gt", category: "mind", threshold: 6 },
        {
          type: "has_symptom_keyword",
          keywords: ["anxiety", "panic", "ptsd", "trauma", "burnout", "overwhelm"],
        },
      ],
    },
  },

  // --- Skin Deep Dive ---
  // Trigger: skin symptoms in MSQ or keywords
  {
    id: "skin_deep_dive_trigger",
    label: "Show skin deep dive when skin issues flagged",
    target: { type: "section", sectionKey: "skin_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "msq_category_score_gt", category: "skin", threshold: 2 },
        {
          type: "has_symptom_keyword",
          keywords: [
            "acne", "eczema", "psoriasis", "rash", "hives", "skin",
            "hair loss", "alopecia", "dermatitis", "rosacea",
          ],
        },
      ],
    },
  },

  // --- Weight & Metabolism Deep Dive ---
  // Trigger: weight-related MSQ symptoms or blood sugar issues
  {
    id: "metabolism_deep_dive_trigger",
    label: "Show metabolism deep dive when weight/blood sugar issues flagged",
    target: { type: "section", sectionKey: "metabolism_deep_dive" },
    condition: {
      type: "or",
      conditions: [
        { type: "msq_category_score_gt", category: "weight", threshold: 3 },
        { type: "field_not_empty", section: "hormones", field: "blood_sugar_issues" },
        { type: "field_not_empty", section: "hormones", field: "metabolism_concerns" },
        {
          type: "has_symptom_keyword",
          keywords: [
            "weight", "obesity", "overweight", "weight loss", "weight gain",
            "blood sugar", "insulin", "metabolic", "diabetes", "pre-diabetic",
            "cravings", "hunger",
          ],
        },
      ],
    },
  },

  // =========================================================================
  // QUESTION-LEVEL RULES (within existing sections)
  // =========================================================================

  // --- WhyHere: motivation follow-up ---
  // Only show "What would make this number higher?" if motivation < 9
  {
    id: "why_here_motivation_followup",
    label: "Show motivation blocker follow-up when motivation < 9",
    target: { type: "question", sectionKey: "why_here", questionKey: "motivation_blocker" },
    condition: {
      type: "and",
      conditions: [
        { type: "field_not_empty", section: "why_here", field: "motivation_level" },
        { type: "field_lt", section: "why_here", field: "motivation_level", value: 9 },
      ],
    },
  },

  // --- WhyHere: health rating follow-up ---
  // Always show "Why did you rate it that number?" after rating
  {
    id: "why_here_rating_followup",
    label: "Show rating follow-up after health rating given",
    target: { type: "question", sectionKey: "why_here", questionKey: "health_rating_why" },
    condition: {
      type: "field_not_empty",
      section: "why_here",
      field: "overall_health_rating",
    },
  },

  // --- Hormones: cycle-specific questions ---
  // Only show cycle length, period length, PMS, last period date
  // if patient has a cycle (not "no_period" or "na")
  {
    id: "hormones_cycle_details",
    label: "Show cycle details when patient has a period",
    target: { type: "question", sectionKey: "hormones", questionKey: "cycle_details" },
    condition: {
      type: "field_in",
      section: "hormones",
      field: "cycle_regular",
      values: ["regular", "irregular"],
    },
  },

  // --- Hormones: menopause status ---
  // Only show menopause status for female patients over 35
  {
    id: "hormones_menopause",
    label: "Show menopause questions for females over 35",
    target: { type: "question", sectionKey: "hormones", questionKey: "menopause_status" },
    condition: {
      type: "and",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "age_gt", value: 35 },
      ],
    },
  },

  // --- Hormones: HRT history ---
  // Show HRT history if perimenopausal, postmenopausal, or mentions HRT
  {
    id: "hormones_hrt",
    label: "Show HRT history for peri/post-menopausal patients",
    target: { type: "question", sectionKey: "hormones", questionKey: "hrt_history" },
    condition: {
      type: "or",
      conditions: [
        { type: "field_in", section: "hormones", field: "menopause_status", values: ["peri", "post"] },
        { type: "has_symptom_keyword", keywords: ["hrt", "hormone replacement", "bioidentical"] },
      ],
    },
  },

  // --- Hormones: birth control ---
  // Show birth control question for females of reproductive age
  {
    id: "hormones_birth_control",
    label: "Show birth control question for females under 55",
    target: { type: "question", sectionKey: "hormones", questionKey: "birth_control" },
    condition: {
      type: "and",
      conditions: [
        { type: "sex_equals", value: "female" },
        { type: "age_lt", value: 55 },
      ],
    },
  },

  // --- Hormones: male-specific ---
  // Show testosterone/DHT questions for males
  {
    id: "hormones_male_specific",
    label: "Show male hormone questions for male patients",
    target: { type: "question", sectionKey: "hormones", questionKey: "male_hormone_details" },
    condition: { type: "sex_equals", value: "male" },
  },

  // --- Lifestyle: alcohol follow-up ---
  // Show alcohol amount only if they drink
  {
    id: "lifestyle_alcohol_amount",
    label: "Show alcohol amount if patient drinks",
    target: { type: "question", sectionKey: "lifestyle", questionKey: "alcohol_amount" },
    condition: {
      type: "field_in",
      section: "lifestyle",
      field: "nutrition.alcohol",
      values: ["weekly", "daily"],
    },
  },

  // --- Previous Labs: upload prompt ---
  // Show upload prompt only if they have previous labs
  {
    id: "previous_labs_upload",
    label: "Show upload prompt when patient has previous labs",
    target: { type: "question", sectionKey: "previous_labs", questionKey: "upload_prompt" },
    condition: {
      type: "field_equals",
      section: "previous_labs",
      field: "has_previous_labs",
      value: true,
    },
  },

  // --- Wellness: practice details ---
  // Show sauna details only if they use a sauna
  {
    id: "wellness_sauna_details",
    label: "Show sauna details if patient uses sauna",
    target: { type: "question", sectionKey: "lifestyle", questionKey: "sauna_details" },
    condition: {
      type: "field_equals",
      section: "lifestyle",
      field: "wellness_practices.sauna",
      value: true,
    },
  },
  {
    id: "wellness_cold_details",
    label: "Show cold exposure details if patient does cold exposure",
    target: { type: "question", sectionKey: "lifestyle", questionKey: "cold_exposure_details" },
    condition: {
      type: "field_equals",
      section: "lifestyle",
      field: "wellness_practices.cold_exposure",
      value: true,
    },
  },
];
