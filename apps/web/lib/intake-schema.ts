// Pure types + helpers for intake. Imported by both server pages and the
// client form — must not import from ./db (which pulls in `pg` and breaks
// the client bundle with "Can't resolve 'fs'").

export type DurationUnit = "days" | "weeks" | "months" | "years";
export type Severity = number; // 1..10
export type SleepQuality = "poor" | "fair" | "good" | "excellent";
export type ExerciseIntensity = "low" | "moderate" | "high";
export type DiagnosisStatus = "active" | "resolved" | "managed";
export type DietType =
  | "standard"
  | "paleo"
  | "keto"
  | "carnivore"
  | "vegan"
  | "vegetarian"
  | "mediterranean"
  | "none"
  | "other";

// ---------------------------------------------------------------------------
// MSQ-style symptom scoring (0-4 scale per symptom, grouped by body system)
// ---------------------------------------------------------------------------

/** 0 = never, 1 = occasional not severe, 2 = occasional severe,
 *  3 = frequent not severe, 4 = frequent severe */
export type MsqScore = 0 | 1 | 2 | 3 | 4;

export const MSQ_CATEGORIES = [
  "head", "eyes", "ears", "nose", "mouth_throat", "skin",
  "heart", "lungs", "digestive", "joints_muscles", "weight",
  "energy_activity", "mind", "emotions", "other",
] as const;

export type MsqCategory = (typeof MSQ_CATEGORIES)[number];

/** Pre-defined symptoms per body system, matching the MSQ questionnaire */
export const MSQ_SYMPTOMS: Record<MsqCategory, string[]> = {
  head: ["Headaches", "Faintness", "Dizziness", "Insomnia"],
  eyes: ["Watery or itchy eyes", "Swollen, reddened or sticky eyelids", "Bags or dark circles under eyes", "Blurred or tunnel vision"],
  ears: ["Itchy ears", "Earaches or ear infections", "Drainage from ear", "Ringing in ears or hearing loss"],
  nose: ["Stuffy nose", "Sinus problems", "Hay fever", "Sneezing attacks", "Excessive mucus formation"],
  mouth_throat: ["Chronic coughing", "Gagging, frequent need to clear throat", "Sore throat, hoarseness, loss of voice", "Swollen or discolored tongue, gums, lips", "Canker sores"],
  skin: ["Acne", "Hives, rashes, or dry skin", "Hair loss", "Flushing or hot flashes", "Excessive sweating"],
  heart: ["Irregular or skipped heartbeat", "Rapid or pounding heartbeat", "Chest pain"],
  lungs: ["Chest congestion", "Asthma or bronchitis", "Shortness of breath", "Difficult breathing"],
  digestive: ["Nausea or vomiting", "Diarrhea", "Constipation", "Bloated feeling", "Belching or passing gas", "Heartburn", "Intestinal or stomach pain"],
  joints_muscles: ["Pain or aches in joints", "Arthritis", "Stiffness or limitation of movement", "Pain or aches in muscles", "Feeling of weakness or tiredness"],
  weight: ["Binge eating or drinking", "Craving certain foods", "Excessive weight", "Compulsive eating", "Water retention", "Underweight"],
  energy_activity: ["Fatigue or sluggishness", "Apathy or lethargy", "Hyperactivity", "Restlessness"],
  mind: ["Poor memory", "Confusion or poor comprehension", "Poor concentration", "Poor physical coordination", "Difficulty making decisions", "Stuttering or stammering", "Slurred speech", "Learning disabilities"],
  emotions: ["Mood swings", "Anxiety, fear, or nervousness", "Anger, irritability, or aggressiveness", "Depression"],
  other: ["Frequent illness", "Frequent or urgent urination", "Genital itch or discharge"],
};

export const MSQ_THRESHOLDS = {
  optimal: 10,
  mild: 50,
  moderate: 100,
} as const;

export function msqSeverityLabel(grandTotal: number): "optimal" | "mild" | "moderate" | "severe" {
  if (grandTotal < MSQ_THRESHOLDS.optimal) return "optimal";
  if (grandTotal < MSQ_THRESHOLDS.mild) return "mild";
  if (grandTotal < MSQ_THRESHOLDS.moderate) return "moderate";
  return "severe";
}

// ---------------------------------------------------------------------------
// Section interfaces
// ---------------------------------------------------------------------------

/** Legacy v1 symptom (free-form). Kept for backward compat with existing data. */
export interface IntakeSymptom {
  name: string;
  severity: Severity;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  notes: string;
}

export interface IntakeDiagnosis {
  condition: string;
  year: string;
  status: DiagnosisStatus | "";
  treatment: string;
}

export interface IntakeMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescriber: string;
}

/**
 * Symptoms section — now supports both:
 * - v1: free-form symptom list (backward compat)
 * - v2: MSQ-style scored checklist by body system
 */
export interface IntakeSymptomsSection {
  /** v1 free-form symptoms (kept for backward compat) */
  symptoms: IntakeSymptom[];
  top_concerns: string;
  /** v2 MSQ scores: { "head": { "Headaches": 2, "Dizziness": 0, ... }, ... } */
  msq_scores?: Partial<Record<MsqCategory, Record<string, MsqScore>>>;
  /** Trend: "getting_better" | "getting_worse" | "staying_same" per category */
  msq_trend?: Partial<Record<MsqCategory, "getting_better" | "getting_worse" | "staying_same">>;
}

export interface IntakeHistorySection {
  diagnoses: IntakeDiagnosis[];
  /** Note: includes cosmetic surgeries */
  surgeries: string;
  family_history: string;
}

export interface IntakeMedicationsSection {
  prescriptions: IntakeMedication[];
  supplements: IntakeMedication[];
  /** Medications or supplements stopped in the last 6 months */
  recently_stopped?: string;
}

export interface IntakeLifestyleSection {
  sleep: {
    average_hours: number | null;
    quality: SleepQuality | "";
    issues: string;
    trouble_falling_asleep?: boolean | null;
    trouble_staying_asleep?: boolean | null;
    wake_feeling_rested?: "never" | "sometimes" | "usually" | "always" | "";
    bedtime?: string;
    wake_time?: string;
  };
  nutrition: {
    diet_type: DietType | "";
    restrictions: string;
    sensitivities: string;
    water_oz_per_day: number | null;
    meals_per_day?: number | null;
    eats_breakfast?: boolean | null;
    alcohol?: "never" | "rarely" | "weekly" | "daily" | "";
    alcohol_amount?: string;
    caffeine?: string;
    /** Dr. Laura: "What's your relationship with food/eating?" */
    food_relationship?: string;
  };
  exercise: {
    type: string;
    frequency_per_week: number | null;
    intensity: ExerciseIntensity | "";
    duration_per_session?: string;
    tracks_workouts?: boolean | null;
  };
  stress: {
    level: Severity | null;
    sources: string;
    management: string;
  };
  wellness_practices?: {
    sauna?: boolean | null;
    sauna_details?: string;
    cold_exposure?: boolean | null;
    cold_exposure_details?: string;
    meditation_breathwork?: boolean | null;
    meditation_details?: string;
    journaling?: boolean | null;
    other?: string;
  };
}

/** Kept for backward compat — merged into why_here for v2 */
export interface IntakeGoalsSection {
  desired_outcomes: string;
  failed_approaches: string;
  commitment: Severity | null;
}

export interface IntakePreviousLabsSection {
  has_previous_labs: boolean | null;
  remembered_results: string;
  lab_types?: string[];
  concerns?: string;
}

// ---------------------------------------------------------------------------
// v2 sections
// ---------------------------------------------------------------------------

export interface IntakeAboutYouSection {
  full_name: string;
  date_of_birth: string;
  sex_at_birth: "male" | "female" | "intersex" | "";
  gender_identity: string;
  height_inches: number | null;
  weight_lbs: number | null;
  state: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
}

/**
 * "Why You're Here" — expanded per Dr. Laura's feedback.
 * Goes beyond surface-level goals to understand mindset, readiness,
 * bottlenecks, and behavioral patterns around health.
 */
export interface IntakeWhyHereSection {
  /** "In your own words, what brings you here?" */
  what_brings_you: string;
  /** "What are your top 3 health goals for the next 3-6 months?" */
  top_three_goals: string;
  /** "If we were having this conversation 6 months from now and things
   *  went really well, what would be different in your life?" */
  six_month_vision: string;
  /** "On a scale of 1-10, how would you rate your overall health today?" */
  overall_health_rating: number | null;
  /** Dynamic follow-up: "Why did you rate it at that number?" */
  health_rating_why: string;
  /** "How motivated are you to make changes right now?" (1-10) */
  motivation_level: number | null;
  /** Dynamic follow-up if < 9: "What would make this number higher?" */
  motivation_blocker: string;
  /** "What concerns you the most about continuing as you are right now?" */
  cost_of_not_changing: string;
  /** "Who or what in your life is being impacted by your health?" */
  health_impact_on_life: string;
  /** "What have you tried so far that hasn't worked?" */
  what_hasnt_worked: string;
  /** "What's been the biggest roadblock in seeking help/guidance?" */
  biggest_roadblock: string;
  /** "What realistically feels manageable for you right now in terms
   *  of making changes?" */
  capacity_for_change: string;
}

/** Conditional: only shown if digestive issues flagged in symptoms */
export interface IntakeGutDeepDiveSection {
  bowel_frequency: string;
  bowel_consistency: string;
  bloating_details: string;
  /** Dr. Laura addition */
  heartburn_reflux: string;
  /** Dr. Laura addition */
  gas_burping: string;
  diagnosed_gi_conditions: string[];
  previous_gi_testing: string;
  antibiotic_history: string;
  antacid_ppi_history: string;
  elimination_trials: string;
}

/**
 * Hormone section — REQUIRED for all patients per Dr. Laura.
 * "A woman's menstrual cycle is a vital sign comparable to HR and BP."
 */
export interface IntakeHormoneSection {
  cycle_regular: "regular" | "irregular" | "no_period" | "na" | "";
  cycle_length_days: number | null;
  period_length_days: number | null;
  pms_symptoms: string[];
  last_period_date: string;
  /** Dr. Laura: "Do you track your cycle? If yes, how?" */
  cycle_tracking: string;
  menopause_status: "pre" | "peri" | "post" | "na" | "";
  hrt_history: string;
  /** Expanded: list specific thyroid symptoms so patients recognize them */
  thyroid_diagnosis: string;
  thyroid_symptoms: string[];
  pcos_endo_fibroids: string[];
  previous_hormone_testing: string;
  birth_control: string;
  /** Dr. Laura: blood sugar / metabolism questions */
  blood_sugar_issues: string;
  metabolism_concerns: string;
}

/** Conditional: only shown if autoimmune flagged in symptoms */
export interface IntakeImmuneDeepDiveSection {
  autoimmune_conditions: string;
  diagnosed_when: string;
  current_treatment: string;
  flare_triggers: string;
  illness_frequency_per_year: number | null;
  vaccination_history: string;
  mold_exposure: string;
  tick_borne_illness: string;
}

export interface IntakeWearablesSection {
  devices: string[];
  usage_duration: string;
  willing_to_share: "yes" | "no" | "maybe" | "";
}

export interface IntakeAnythingElseSection {
  additional_info: string;
  referral_source: string;
}

// ---------------------------------------------------------------------------
// Aggregate types
// ---------------------------------------------------------------------------

export interface IntakeData {
  // v1 sections (backward compat)
  symptoms?: IntakeSymptomsSection;
  history?: IntakeHistorySection;
  medications?: IntakeMedicationsSection;
  lifestyle?: IntakeLifestyleSection;
  goals?: IntakeGoalsSection;
  previous_labs?: IntakePreviousLabsSection;
  // v2 sections
  about_you?: IntakeAboutYouSection;
  why_here?: IntakeWhyHereSection;
  gut_deep_dive?: IntakeGutDeepDiveSection;
  /** v2: required for all patients (was IntakeHormoneDeepDiveSection) */
  hormones?: IntakeHormoneSection;
  /** Legacy key — old data may use this instead of `hormones` */
  hormone_deep_dive?: IntakeHormoneSection;
  immune_deep_dive?: IntakeImmuneDeepDiveSection;
  wearables?: IntakeWearablesSection;
  anything_else?: IntakeAnythingElseSection;
  submitted_at?: string;
  _saved?: Partial<Record<IntakeSectionKey, string>>;
}

export type IntakeSectionKey =
  | "symptoms"
  | "history"
  | "medications"
  | "lifestyle"
  | "goals"
  | "previous_labs"
  | "about_you"
  | "why_here"
  | "gut_deep_dive"
  | "hormones"
  | "hormone_deep_dive" // legacy alias
  | "immune_deep_dive"
  | "wearables"
  | "anything_else";

/** Sections that only appear when specific symptoms are flagged.
 *  NOTE: hormones was removed — it's now required per Dr. Laura. */
export type ConditionalSectionKey =
  | "gut_deep_dive"
  | "immune_deep_dive";

/**
 * Maps conditional sections to the symptom keywords that trigger them.
 * Checks both v1 free-form symptom names and v2 MSQ category scores.
 */
export const CONDITIONAL_TRIGGERS: Record<ConditionalSectionKey, string[]> = {
  gut_deep_dive: ["digestive", "bloating", "gas", "constipation", "diarrhea", "reflux", "ibs", "sibo", "gut", "heartburn", "nausea"],
  immune_deep_dive: ["autoimmune", "immune", "lupus", "hashimoto", "rheumatoid", "ms "],
};

/**
 * Check whether a conditional section should be shown based on current symptoms.
 * Checks v1 free-form names AND v2 MSQ digestive category scores.
 */
export function shouldShowConditionalSection(
  symptoms: IntakeSymptomsSection | undefined,
  section: ConditionalSectionKey,
): boolean {
  if (!symptoms) return false;
  const triggers = CONDITIONAL_TRIGGERS[section];

  // Check v1 free-form symptoms
  const v1Match = symptoms.symptoms?.some((s) =>
    triggers.some((t) => s.name.toLowerCase().includes(t.toLowerCase())),
  );
  if (v1Match) return true;

  // Check v2 MSQ scores — if any symptom in the relevant category scored > 0
  if (symptoms.msq_scores) {
    if (section === "gut_deep_dive") {
      const digestiveScores = symptoms.msq_scores.digestive;
      if (digestiveScores && Object.values(digestiveScores).some((v) => v > 0)) return true;
    }
    if (section === "immune_deep_dive") {
      const otherScores = symptoms.msq_scores.other;
      if (otherScores) {
        const immuneSymptom = otherScores["Frequent illness"];
        if (immuneSymptom && immuneSymptom > 0) return true;
      }
    }
  }

  return false;
}

/** Helper to read hormone data from either the new or legacy key */
export function getHormoneData(data: IntakeData): IntakeHormoneSection | undefined {
  return data.hormones ?? data.hormone_deep_dive;
}

export const INTAKE_SECTIONS: { key: IntakeSectionKey; title: string; conditional?: boolean }[] = [
  { key: "about_you", title: "About you" },
  { key: "why_here", title: "Why you're here" },
  { key: "symptoms", title: "Current symptoms" },
  { key: "history", title: "Health history" },
  { key: "medications", title: "Medications & supplements" },
  { key: "lifestyle", title: "Lifestyle" },
  { key: "hormones", title: "Hormones & cycle" },
  { key: "gut_deep_dive", title: "Gut health deep dive", conditional: true },
  { key: "immune_deep_dive", title: "Immune deep dive", conditional: true },
  { key: "previous_labs", title: "Previous labs & testing" },
  { key: "wearables", title: "Wearables & tracking" },
  { key: "anything_else", title: "Anything else" },
];

// ---------------------------------------------------------------------------
// Empty factories
// ---------------------------------------------------------------------------

export function emptySymptom(): IntakeSymptom {
  return { name: "", severity: 5, duration_value: null, duration_unit: null, notes: "" };
}
export function emptyDiagnosis(): IntakeDiagnosis {
  return { condition: "", year: "", status: "", treatment: "" };
}
export function emptyMedication(): IntakeMedication {
  return { name: "", dosage: "", frequency: "", duration: "", prescriber: "" };
}

// ---------------------------------------------------------------------------
// MSQ score helpers
// ---------------------------------------------------------------------------

/** Compute the total score for one MSQ category */
export function msqCategoryTotal(scores: Record<string, MsqScore> | undefined): number {
  if (!scores) return 0;
  return Object.values(scores).reduce((sum, v) => sum + v, 0);
}

/** Compute the grand total across all MSQ categories */
export function msqGrandTotal(
  allScores: Partial<Record<MsqCategory, Record<string, MsqScore>>> | undefined,
): number {
  if (!allScores) return 0;
  return MSQ_CATEGORIES.reduce(
    (sum, cat) => sum + msqCategoryTotal(allScores[cat]),
    0,
  );
}

// ---------------------------------------------------------------------------
// Section completeness checks
// ---------------------------------------------------------------------------

export function isSectionComplete(data: IntakeData, key: IntakeSectionKey): boolean {
  switch (key) {
    case "about_you":
      return !!(data.about_you?.full_name?.trim() && data.about_you?.date_of_birth);
    case "why_here":
      return !!(data.why_here?.what_brings_you?.trim());
    case "symptoms": {
      // v2: at least one MSQ category has a score entered
      const hasV2 = data.symptoms?.msq_scores &&
        Object.values(data.symptoms.msq_scores).some(
          (cat) => cat && Object.values(cat).some((v) => v > 0),
        );
      // v1 fallback
      const hasV1 = data.symptoms?.symptoms?.some((s) => s.name.trim());
      return !!(hasV2 || hasV1);
    }
    case "history":
      return (
        !!data.history?.diagnoses?.some((d) => d.condition.trim()) ||
        !!data.history?.surgeries?.trim() ||
        !!data.history?.family_history?.trim()
      );
    case "medications":
      return (
        !!data.medications?.prescriptions?.some((m) => m.name.trim()) ||
        !!data.medications?.supplements?.some((m) => m.name.trim())
      );
    case "lifestyle": {
      const ls = data.lifestyle as IntakeLifestyleSection | undefined;
      if (!ls) return false;
      return !!(
        ls.sleep?.average_hours ||
        ls.sleep?.quality ||
        ls.nutrition?.diet_type ||
        ls.exercise?.type ||
        ls.stress?.level
      );
    }
    case "goals":
      return !!(data.goals?.desired_outcomes?.trim() || data.goals?.commitment);
    case "hormones":
    case "hormone_deep_dive": {
      const h = getHormoneData(data);
      return !!(h?.cycle_regular);
    }
    case "gut_deep_dive":
      return !!(data.gut_deep_dive?.bowel_frequency?.trim() || data.gut_deep_dive?.diagnosed_gi_conditions?.length);
    case "immune_deep_dive":
      return !!(data.immune_deep_dive?.autoimmune_conditions?.trim());
    case "previous_labs":
      return (
        data.previous_labs?.has_previous_labs !== null &&
        data.previous_labs?.has_previous_labs !== undefined
      );
    case "wearables":
      return !!(data.wearables?.devices?.length);
    case "anything_else":
      return true;
  }
}

/**
 * Compute intake completion %. Conditional sections that aren't triggered
 * are excluded from the denominator so they don't penalize the score.
 */
export function intakeCompletionPct(data: IntakeData): number {
  const visibleSections = INTAKE_SECTIONS.filter((s) => {
    if (!s.conditional) return true;
    return shouldShowConditionalSection(
      data.symptoms,
      s.key as ConditionalSectionKey,
    );
  });
  const total = visibleSections.length;
  if (total === 0) return 0;
  const done = visibleSections.filter((s) => isSectionComplete(data, s.key)).length;
  return Math.round((done / total) * 100);
}
