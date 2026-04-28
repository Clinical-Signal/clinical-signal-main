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
  | "vegan"
  | "vegetarian"
  | "mediterranean"
  | "other";

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

export interface IntakeSymptomsSection {
  symptoms: IntakeSymptom[];
  top_concerns: string;
}

export interface IntakeHistorySection {
  diagnoses: IntakeDiagnosis[];
  surgeries: string;
  family_history: string;
}

export interface IntakeMedicationsSection {
  prescriptions: IntakeMedication[];
  supplements: IntakeMedication[];
}

export interface IntakeLifestyleSection {
  sleep: {
    average_hours: number | null;
    quality: SleepQuality | "";
    issues: string;
  };
  nutrition: {
    diet_type: DietType | "";
    restrictions: string;
    sensitivities: string;
    water_oz_per_day: number | null;
  };
  exercise: {
    type: string;
    frequency_per_week: number | null;
    intensity: ExerciseIntensity | "";
  };
  stress: {
    level: Severity | null;
    sources: string;
    management: string;
  };
}

export interface IntakeGoalsSection {
  desired_outcomes: string;
  failed_approaches: string;
  commitment: Severity | null;
}

export interface IntakePreviousLabsSection {
  has_previous_labs: boolean | null;
  remembered_results: string;
  lab_types?: string[]; // e.g. ["blood_panel", "thyroid", "gi_map", "dutch"]
}

// ---------------------------------------------------------------------------
// New sections for 12-section intake (v2)
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

export interface IntakeWhyHereSection {
  what_brings_you: string;
  top_three_goals: string;
  overall_health_rating: number | null; // 1-10
  motivation_level: number | null; // 1-10
}

/** Conditional: only shown if digestive issues flagged in symptoms */
export interface IntakeGutDeepDiveSection {
  bowel_frequency: string;
  bowel_consistency: string;
  bloating_details: string;
  diagnosed_gi_conditions: string[];
  previous_gi_testing: string;
  antibiotic_history: string;
  antacid_ppi_history: string;
  elimination_trials: string;
}

/** Conditional: only shown if hormonal symptoms flagged in symptoms */
export interface IntakeHormoneDeepDiveSection {
  cycle_regular: "regular" | "irregular" | "no_period" | "na" | "";
  cycle_length_days: number | null;
  period_length_days: number | null;
  pms_symptoms: string[];
  last_period_date: string;
  menopause_status: "pre" | "peri" | "post" | "na" | "";
  hrt_history: string;
  thyroid_details: string;
  pcos_endo_fibroids: string[];
  previous_hormone_testing: string;
  birth_control: string;
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
  // v1 sections (always present)
  symptoms?: IntakeSymptomsSection;
  history?: IntakeHistorySection;
  medications?: IntakeMedicationsSection;
  lifestyle?: IntakeLifestyleSection;
  goals?: IntakeGoalsSection;
  previous_labs?: IntakePreviousLabsSection;
  // v2 sections (added for 12-section intake)
  about_you?: IntakeAboutYouSection;
  why_here?: IntakeWhyHereSection;
  gut_deep_dive?: IntakeGutDeepDiveSection;
  hormone_deep_dive?: IntakeHormoneDeepDiveSection;
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
  | "hormone_deep_dive"
  | "immune_deep_dive"
  | "wearables"
  | "anything_else";

/** Sections that only appear when specific symptoms are flagged */
export type ConditionalSectionKey =
  | "gut_deep_dive"
  | "hormone_deep_dive"
  | "immune_deep_dive";

/**
 * Maps conditional sections to the symptom keywords that trigger them.
 * If any symptom name matches (case-insensitive substring), the section shows.
 */
export const CONDITIONAL_TRIGGERS: Record<ConditionalSectionKey, string[]> = {
  gut_deep_dive: ["digestive", "bloating", "gas", "constipation", "diarrhea", "reflux", "ibs", "sibo", "gut"],
  hormone_deep_dive: ["hormonal", "irregular cycle", "hot flash", "pms", "libido", "menopause", "thyroid", "pcos"],
  immune_deep_dive: ["autoimmune", "immune", "lupus", "hashimoto", "rheumatoid", "ms "],
};

/**
 * Check whether a conditional section should be shown based on current symptoms.
 */
export function shouldShowConditionalSection(
  symptoms: IntakeSymptomsSection | undefined,
  section: ConditionalSectionKey,
): boolean {
  if (!symptoms?.symptoms?.length) return false;
  const triggers = CONDITIONAL_TRIGGERS[section];
  return symptoms.symptoms.some((s) =>
    triggers.some((t) => s.name.toLowerCase().includes(t.toLowerCase())),
  );
}

export const INTAKE_SECTIONS: { key: IntakeSectionKey; title: string; conditional?: boolean }[] = [
  { key: "about_you", title: "About you" },
  { key: "why_here", title: "Why you're here" },
  { key: "symptoms", title: "Current symptoms" },
  { key: "history", title: "Health history" },
  { key: "medications", title: "Medications & supplements" },
  { key: "lifestyle", title: "Lifestyle" },
  { key: "gut_deep_dive", title: "Gut health deep dive", conditional: true },
  { key: "hormone_deep_dive", title: "Hormone deep dive", conditional: true },
  { key: "immune_deep_dive", title: "Immune deep dive", conditional: true },
  { key: "previous_labs", title: "Previous labs & testing" },
  { key: "wearables", title: "Wearables & tracking" },
  { key: "anything_else", title: "Anything else" },
];

export function emptySymptom(): IntakeSymptom {
  return { name: "", severity: 5, duration_value: null, duration_unit: null, notes: "" };
}
export function emptyDiagnosis(): IntakeDiagnosis {
  return { condition: "", year: "", status: "", treatment: "" };
}
export function emptyMedication(): IntakeMedication {
  return { name: "", dosage: "", frequency: "", duration: "", prescriber: "" };
}

export function isSectionComplete(data: IntakeData, key: IntakeSectionKey): boolean {
  switch (key) {
    case "about_you":
      return !!(data.about_you?.full_name?.trim() && data.about_you?.date_of_birth);
    case "why_here":
      return !!(data.why_here?.what_brings_you?.trim());
    case "symptoms":
      return !!data.symptoms?.symptoms?.some((s) => s.name.trim());
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
      // Optional chaining throughout so legacy free-text intake shapes
      // (e.g. seed data with `lifestyle.sleep_hours` instead of
      // `lifestyle.sleep.average_hours`) don't blow up the hub render.
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
    case "gut_deep_dive":
      return !!(data.gut_deep_dive?.bowel_frequency?.trim() || data.gut_deep_dive?.diagnosed_gi_conditions?.length);
    case "hormone_deep_dive":
      return !!(data.hormone_deep_dive?.cycle_regular);
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
      // Always counts as "complete" — it's optional
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
