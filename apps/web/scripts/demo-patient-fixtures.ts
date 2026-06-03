import type { MsqCategory } from "@/lib/intake-schema";
import {
  StepOneSchema,
  createEmptyMsqScores,
  createEmptyStepOne,
  type MsqScore,
  type StepOne,
} from "@/lib/intake/schemas/step-one.schema";
import {
  IntakeDataSchema,
  type IntakeData,
} from "@/lib/intake/schemas/intake-data.schema";

export type DemoPatientFixture = {
  displayName: string;
  dob: string;
  notes: string;
  buildIntakeData: () => IntakeData;
};

function msq(
  overrides: Partial<Record<MsqCategory, Record<string, MsqScore>>>,
): StepOne["symptoms"]["msq_scores"] {
  const scores = createEmptyMsqScores();
  for (const [category, symptoms] of Object.entries(overrides) as Array<
    [MsqCategory, Record<string, MsqScore>]
  >) {
    for (const [symptom, value] of Object.entries(symptoms)) {
      scores[category][symptom] = value;
    }
  }
  return scores;
}

function baseAboutYou(
  fullName: string,
  dob: string,
  sex: "male" | "female",
): StepOne["about_you"] {
  return {
    full_name: fullName,
    date_of_birth: dob,
    sex_at_birth: sex,
    gender_identity: "",
    height_inches: sex === "female" ? 64 : 70,
    weight_lbs: sex === "female" ? 148 : 198,
    state: "CA",
    emergency_contact_name: "Demo Contact",
    emergency_contact_relationship: "Spouse",
    emergency_contact_phone: "555-010-0000",
  };
}

function toIntakeData(stepOne: StepOne): IntakeData {
  return IntakeDataSchema.parse({
    ...stepOne,
    _provenance: {},
    _ai_confirmations: {},
    _analysis_degraded: false,
  });
}

export function buildGutDemoIntakeData(): IntakeData {
  const stepOne = StepOneSchema.parse({
    ...createEmptyStepOne(),
    about_you: baseAboutYou("Jane Doe", "1988-04-12", "female"),
    why_here: {
      what_brings_you:
        "I have near-daily bloating after meals and frequent heartburn. My digestion feels unpredictable and I am looking for relief from GI distress.",
      top_three_goals:
        "Reduce bloating\nImprove bowel regularity\nStop relying on antacids",
      six_month_vision:
        "Eat comfortably without planning around bathroom access or reflux flares.",
      overall_health_rating: 5,
      health_rating_why: "Digestive symptoms dominate most days.",
      motivation_level: 8,
      motivation_blocker: "Fear that diet changes will be too restrictive.",
      cost_of_not_changing: "Avoiding social meals and feeling exhausted by symptoms.",
      health_impact_on_life: "Work focus and weekend plans revolve around symptom management.",
      what_hasnt_worked: "Generic probiotics and occasional PPI use.",
      biggest_roadblock: "Not sure which foods are triggers.",
      capacity_for_change:
        "Willing to keep a food log and try a structured elimination plan.",
    },
    symptoms: {
      symptoms: [],
      top_concerns: "Bloating, heartburn, irregular bowel movements",
      msq_scores: msq({
        digestive: {
          "Bloated feeling": 4,
          Heartburn: 3,
          "Belching or passing gas": 3,
          "Intestinal or stomach pain": 3,
          Constipation: 2,
          Diarrhea: 1,
        },
        energy_activity: { "Fatigue or sluggishness": 2 },
      }),
    },
    history: {
      diagnoses: [],
      surgeries: "",
      family_history: "Mother with IBS-like symptoms.",
    },
    lifestyle: {
      sleep: {
        average_hours: 7,
        quality: "fair",
        wake_feeling_rested: "sometimes",
        issues: "Occasional reflux when eating late.",
      },
      nutrition: {
        diet_type: "standard",
        water_oz_per_day: 48,
        restrictions: "",
        sensitivities: "Suspects dairy and wheat.",
        food_relationship: "Anxious about meals triggering symptoms.",
      },
      exercise: {
        type: "Walking",
        frequency_per_week: 3,
        intensity: "moderate",
      },
      stress: { level: 5, sources: "Work deadlines", management: "Evening walks" },
      wellness_practices: {
        sauna: false,
        sauna_details: "",
        cold_exposure: false,
        cold_exposure_details: "",
        meditation_breathwork: false,
        meditation_details: "",
        journaling: false,
        other: "",
      },
    },
    hormones: createEmptyStepOne().hormones,
    previous_labs: { has_previous_labs: false, remembered_results: "" },
    wearables: createEmptyStepOne().wearables,
    anything_else: { additional_info: "Demo gut-focused patient.", referral_source: "other" },
  });

  return toIntakeData(stepOne);
}

export function buildHormoneDemoIntakeData(): IntakeData {
  const stepOne = StepOneSchema.parse({
    ...createEmptyStepOne(),
    about_you: baseAboutYou("Alex Smith", "1990-09-03", "female"),
    why_here: {
      what_brings_you:
        "My cycles have been irregular for a year, stress feels unmanageable, and I am exhausted despite sleeping enough. I want help restoring hormone balance.",
      top_three_goals:
        "Stabilize menstrual cycle\nImprove energy\nReduce anxiety related to hormonal swings",
      six_month_vision:
        "Predictable cycles, steadier mood, and energy through the afternoon.",
      overall_health_rating: 4,
      health_rating_why: "Fatigue and cycle changes are affecting daily life.",
      motivation_level: 9,
      motivation_blocker: "Overwhelmed by conflicting supplement advice online.",
      cost_of_not_changing: "Mood swings straining relationships and work performance.",
      health_impact_on_life: "Hard to exercise consistently due to low energy.",
      what_hasnt_worked: "Random adaptogens without lab guidance.",
      biggest_roadblock: "No recent hormone labs.",
      capacity_for_change: "Can track cycle and complete recommended labs.",
    },
    symptoms: {
      symptoms: [],
      top_concerns: "Irregular cycles, fatigue, stress, mood changes",
      msq_scores: msq({
        emotions: {
          "Mood swings": 3,
          "Anxiety, fear, or nervousness": 3,
        },
        energy_activity: { "Fatigue or sluggishness": 4, "Apathy or lethargy": 2 },
        mind: { "Poor concentration": 2 },
        weight: { "Water retention": 2 },
      }),
    },
    history: {
      diagnoses: [],
      surgeries: "",
      family_history: "Sister with PCOS.",
    },
    lifestyle: {
      sleep: {
        average_hours: 7.5,
        quality: "fair",
        wake_feeling_rested: "sometimes",
        issues: "Wakes around 3 AM during luteal phase.",
      },
      nutrition: {
        diet_type: "mediterranean",
        water_oz_per_day: 64,
        restrictions: "",
        sensitivities: "",
        food_relationship: "Craves carbs when stressed.",
      },
      exercise: {
        type: "Pilates",
        frequency_per_week: 2,
        intensity: "low",
      },
      stress: {
        level: 8,
        sources: "Caregiving and job transition",
        management: "Occasional breathwork",
      },
      wellness_practices: {
        sauna: false,
        sauna_details: "",
        cold_exposure: false,
        cold_exposure_details: "",
        meditation_breathwork: true,
        meditation_details: "10 minutes, 3x weekly",
        journaling: true,
        other: "",
      },
    },
    hormones: {
      cycle_regular: "irregular",
      cycle_length_days: 38,
      period_length_days: 6,
      last_period_date: "2026-03-15",
      cycle_tracking: "Uses a period tracking app.",
      pms_symptoms: ["Mood swings", "Fatigue", "Breast tenderness", "Cramps"],
      menopause_status: "pre",
      birth_control: "Stopped oral contraceptive 14 months ago.",
      hrt_history: "",
      previous_hormone_testing: "No DUTCH or comprehensive panel yet.",
      pcos_endo_fibroids: [],
      thyroid_diagnosis: "",
      thyroid_symptoms: ["Fatigue", "Weight gain", "Brain fog"],
      blood_sugar_issues: "",
      metabolism_concerns: "Afternoon energy crashes.",
    },
    previous_labs: { has_previous_labs: true, remembered_results: "TSH 2.4 (2025)" },
    wearables: createEmptyStepOne().wearables,
    anything_else: { additional_info: "Demo hormone-focused patient.", referral_source: "other" },
  });

  return toIntakeData(stepOne);
}

export function buildMetabolicDemoIntakeData(): IntakeData {
  const stepOne = StepOneSchema.parse({
    ...createEmptyStepOne(),
    about_you: baseAboutYou("Riley Chen", "1982-01-20", "male"),
    why_here: {
      what_brings_you:
        "I want to lose weight sustainably. My doctor mentioned pre-diabetes, and I struggle with intense cravings, especially in the evening.",
      top_three_goals:
        "Lose 25 pounds\nImprove blood sugar markers\nReduce sugar cravings",
      six_month_vision:
        "Stable energy, fewer cravings, and improved fasting glucose on labs.",
      overall_health_rating: 5,
      health_rating_why: "Weight and blood sugar feel stuck despite trying diets.",
      motivation_level: 7,
      motivation_blocker: "Travel schedule makes meal prep difficult.",
      cost_of_not_changing: "Family history of type 2 diabetes feels like a warning sign.",
      health_impact_on_life: "Low confidence and avoiding activities.",
      what_hasnt_worked: "Aggressive low-calorie diets rebound quickly.",
      biggest_roadblock: "Evening snacking habit.",
      capacity_for_change: "Can meal prep twice weekly and wear a CGM short term.",
    },
    symptoms: {
      symptoms: [],
      top_concerns: "Weight, cravings, blood sugar, afternoon crashes",
      msq_scores: msq({
        weight: {
          "Craving certain foods": 4,
          "Excessive weight": 3,
          "Compulsive eating": 2,
          "Water retention": 2,
        },
        energy_activity: { "Fatigue or sluggishness": 3 },
        digestive: { "Bloated feeling": 1 },
      }),
    },
    history: {
      diagnoses: [
        {
          condition: "Pre-diabetes",
          year: "2025",
          status: "managed",
          treatment: "Lifestyle counseling; not on medication.",
        },
      ],
      surgeries: "",
      family_history: "Father with type 2 diabetes and hypertension.",
    },
    lifestyle: {
      sleep: {
        average_hours: 6.5,
        quality: "fair",
        wake_feeling_rested: "sometimes",
        issues: "",
      },
      nutrition: {
        diet_type: "standard",
        water_oz_per_day: 40,
        restrictions: "",
        sensitivities: "",
        food_relationship: "Stress eating after dinner.",
      },
      exercise: {
        type: "Stationary bike",
        frequency_per_week: 2,
        intensity: "low",
      },
      stress: { level: 6, sources: "Work travel", management: "Weekend hiking" },
      wellness_practices: createEmptyStepOne().lifestyle.wellness_practices,
    },
    hormones: {
      ...createEmptyStepOne().hormones,
      blood_sugar_issues:
        "Pre-diabetes diagnosis in 2025; reactive hypoglycemia symptoms after high-carb meals.",
      metabolism_concerns: "Central weight gain over the last 4 years.",
      thyroid_symptoms: ["Fatigue"],
    },
    previous_labs: {
      has_previous_labs: true,
      remembered_results: "Fasting glucose 108 mg/dL; HbA1c 5.9% (2025).",
    },
    wearables: createEmptyStepOne().wearables,
    anything_else: {
      additional_info: "Demo metabolic-focused patient.",
      referral_source: "other",
    },
  });

  return toIntakeData(stepOne);
}

export const DEMO_PATIENT_FIXTURES: DemoPatientFixture[] = [
  {
    displayName: "Jane Doe",
    dob: "1988-04-12",
    notes: "Demo — gut / digestive pattern.",
    buildIntakeData: buildGutDemoIntakeData,
  },
  {
    displayName: "Alex Smith",
    dob: "1990-09-03",
    notes: "Demo — hormone / cycle pattern.",
    buildIntakeData: buildHormoneDemoIntakeData,
  },
  {
    displayName: "Riley Chen",
    dob: "1982-01-20",
    notes: "Demo — metabolic / weight pattern.",
    buildIntakeData: buildMetabolicDemoIntakeData,
  },
];
