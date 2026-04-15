import { phiKey, withTenant } from "./db";
import type { PatientStatus } from "./patients";

// ---------------------------------------------------------------------------
// Intake JSONB schema
// ---------------------------------------------------------------------------
// Persisted on `patients.intake_data`. Sections are saved independently so
// auto-save can land just one section without re-validating the rest.

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
  // Auto-set on submit; absence means draft.
  submitted_at?: string;
  // Per-section last-saved timestamps for the "draft saved at..." UI.
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
      const ls = data.lifestyle;
      if (!ls) return false;
      return !!(
        ls.sleep.average_hours ||
        ls.sleep.quality ||
        ls.nutrition.diet_type ||
        ls.exercise.type ||
        ls.stress.level
      );
    }
    case "goals":
      return !!(data.goals?.desired_outcomes?.trim() || data.goals?.commitment);
    case "previous_labs":
      return data.previous_labs?.has_previous_labs !== null && data.previous_labs?.has_previous_labs !== undefined;
  }
}

export function intakeCompletionPct(data: IntakeData): number {
  const total = INTAKE_SECTIONS.length;
  const done = INTAKE_SECTIONS.filter((s) => isSectionComplete(data, s.key)).length;
  return Math.round((done / total) * 100);
}

// ---------------------------------------------------------------------------
// DB ops
// ---------------------------------------------------------------------------

export async function getIntake(tenantId: string, patientId: string): Promise<IntakeData> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ intake_data: IntakeData }>(
      "SELECT intake_data FROM patients WHERE id = $1",
      [patientId],
    );
    return rows[0]?.intake_data ?? {};
  });
}

export async function saveIntakeSection(
  tenantId: string,
  patientId: string,
  section: IntakeSectionKey,
  value: unknown,
): Promise<{ savedAt: string; status: PatientStatus }> {
  const savedAt = new Date().toISOString();
  return withTenant(tenantId, async (c) => {
    // jsonb || jsonb merges shallowly. We patch the section + record the
    // saved timestamp under _saved. We also bump the patient to
    // intake_pending the first time the practitioner touches the form so
    // the dashboard reflects work-in-progress.
    const { rows } = await c.query<{ status: PatientStatus }>(
      `UPDATE patients
          SET intake_data = COALESCE(intake_data, '{}'::jsonb)
                              || jsonb_build_object($3::text, $4::jsonb)
                              || jsonb_build_object('_saved',
                                   COALESCE(intake_data->'_saved','{}'::jsonb)
                                   || jsonb_build_object($3::text, $5::text)
                                 ),
              status = CASE WHEN status = 'new' THEN 'intake_pending' ELSE status END
        WHERE id = $1 AND tenant_id = $2
        RETURNING status`,
      [patientId, tenantId, section, JSON.stringify(value), savedAt],
    );
    if (!rows[0]) throw new Error("Patient not found");
    return { savedAt, status: rows[0].status };
  });
}

export async function submitIntake(
  tenantId: string,
  patientId: string,
): Promise<{ status: PatientStatus }> {
  const submittedAt = new Date().toISOString();
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{ status: PatientStatus }>(
      `UPDATE patients
          SET intake_data = COALESCE(intake_data, '{}'::jsonb)
                              || jsonb_build_object('submitted_at', $3::text),
              status = CASE WHEN status IN ('new','intake_pending') THEN 'labs_pending' ELSE status END
        WHERE id = $1 AND tenant_id = $2
        RETURNING status`,
      [patientId, tenantId, submittedAt],
    );
    if (!rows[0]) throw new Error("Patient not found");
    return { status: rows[0].status };
  });
}

// ---------------------------------------------------------------------------
// Patient summary for the detail hub
// ---------------------------------------------------------------------------

export interface PatientSummary {
  id: string;
  name: string;
  dob: string | null;
  status: PatientStatus;
  intake: {
    completionPct: number;
    submittedAt: string | null;
  };
  recordCount: number;
  protocol: {
    id: string;
    title: string;
    status: string;
    version: number;
    createdAt: Date;
  } | null;
}

export async function getPatientSummary(
  tenantId: string,
  patientId: string,
): Promise<PatientSummary | null> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<{
      id: string;
      name: string;
      dob: string | null;
      status: PatientStatus;
      intake_data: IntakeData;
      record_count: string;
      proto_id: string | null;
      proto_title: string | null;
      proto_status: string | null;
      proto_version: number | null;
      proto_created: Date | null;
    }>(
      `SELECT p.id,
              pgp_sym_decrypt(p.name_encrypted, $2)::text AS name,
              CASE WHEN p.dob_encrypted IS NULL THEN NULL
                   ELSE pgp_sym_decrypt(p.dob_encrypted, $2)::text
              END AS dob,
              p.status,
              p.intake_data,
              (SELECT count(*)::text FROM records r WHERE r.patient_id = p.id) AS record_count,
              latest.id AS proto_id,
              latest.title AS proto_title,
              latest.status AS proto_status,
              latest.version AS proto_version,
              latest.created_at AS proto_created
         FROM patients p
         LEFT JOIN LATERAL (
           SELECT id, title, status, version, created_at
             FROM protocols
            WHERE patient_id = p.id
            ORDER BY created_at DESC
            LIMIT 1
         ) latest ON true
        WHERE p.id = $1`,
      [patientId, phiKey()],
    );
    const r = rows[0];
    if (!r) return null;
    const intake = r.intake_data ?? {};
    return {
      id: r.id,
      name: r.name,
      dob: r.dob,
      status: r.status,
      intake: {
        completionPct: intakeCompletionPct(intake),
        submittedAt: intake.submitted_at ?? null,
      },
      recordCount: parseInt(r.record_count, 10) || 0,
      protocol: r.proto_id
        ? {
            id: r.proto_id,
            title: r.proto_title!,
            status: r.proto_status!,
            version: r.proto_version!,
            createdAt: r.proto_created!,
          }
        : null,
    };
  });
}
