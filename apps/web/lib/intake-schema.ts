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
}

export interface IntakeData {
  symptoms?: IntakeSymptomsSection;
  history?: IntakeHistorySection;
  medications?: IntakeMedicationsSection;
  lifestyle?: IntakeLifestyleSection;
  goals?: IntakeGoalsSection;
  previous_labs?: IntakePreviousLabsSection;
  submitted_at?: string;
  _saved?: Partial<Record<IntakeSectionKey, string>>;
}

export type IntakeSectionKey =
  | "symptoms"
  | "history"
  | "medications"
  | "lifestyle"
  | "goals"
  | "previous_labs";

export const INTAKE_SECTIONS: { key: IntakeSectionKey; title: string }[] = [
  { key: "symptoms", title: "Current symptoms" },
  { key: "history", title: "Health history" },
  { key: "medications", title: "Medications & supplements" },
  { key: "lifestyle", title: "Lifestyle" },
  { key: "goals", title: "Health goals" },
  { key: "previous_labs", title: "Previous labs" },
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
    case "previous_labs":
      return (
        data.previous_labs?.has_previous_labs !== null &&
        data.previous_labs?.has_previous_labs !== undefined
      );
  }
}

export function intakeCompletionPct(data: IntakeData): number {
  const total = INTAKE_SECTIONS.length;
  const done = INTAKE_SECTIONS.filter((s) => isSectionComplete(data, s.key)).length;
  return Math.round((done / total) * 100);
}
