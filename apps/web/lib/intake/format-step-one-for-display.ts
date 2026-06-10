import { MSQ_SYMPTOMS, type MsqCategory } from "@/lib/intake-schema";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { StepOne } from "@/lib/intake/schemas/step-one.schema";

export const NOT_PROVIDED = "Not provided";

export type StepOneDisplayEntry = {
  sectionTitle: string;
  label: string;
  value: string;
};

const SECTION_TITLES: Record<keyof StepOne, string> = {
  about_you: "About the patient",
  why_here: "Why they are here",
  symptoms: "Symptoms (MSQ)",
  history: "Health history",
  medications: "Medications & supplements",
  lifestyle: "Lifestyle",
  hormones: "Hormones & metabolism",
  previous_labs: "Previous labs",
  wearables: "Wearables",
  anything_else: "Anything else",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Preferred name",
  date_of_birth: "Date of birth",
  sex_at_birth: "Sex at birth",
  gender_identity: "Gender identity",
  height_inches: "Height (inches)",
  weight_lbs: "Weight (lbs)",
  state: "State",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_relationship: "Emergency contact relationship",
  emergency_contact_phone: "Emergency contact phone",
  what_brings_you: "What brings them in",
  top_three_goals: "Top goals (3–6 months)",
  six_month_vision: "Six-month vision",
  overall_health_rating: "Overall health rating",
  health_rating_why: "Why they rated their health",
  motivation_level: "Motivation level",
  motivation_blocker: "Motivation blocker",
  cost_of_not_changing: "Cost of not changing",
  health_impact_on_life: "Health impact on life",
  what_hasnt_worked: "What has not worked",
  biggest_roadblock: "Biggest roadblock",
  capacity_for_change: "Capacity for change",
  top_concerns: "Top health concerns",
  surgeries: "Surgeries",
  family_history: "Family history",
  recently_stopped: "Recently stopped medications",
  remembered_results: "Remembered lab results",
  has_previous_labs: "Has previous labs",
  usage_duration: "Wearable usage duration",
  willing_to_share: "Willing to share wearable data",
  additional_info: "Additional information",
  referral_source: "Referral source",
};

function formatScalar(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function pushField(
  entries: StepOneDisplayEntry[],
  sectionTitle: string,
  label: string,
  value: unknown,
): void {
  const formatted = formatScalar(value);
  entries.push({
    sectionTitle,
    label,
    value: formatted ?? NOT_PROVIDED,
  });
}

function pushRecordFields(
  entries: StepOneDisplayEntry[],
  sectionTitle: string,
  record: Record<string, unknown>,
  prefix = "",
): void {
  for (const [key, value] of Object.entries(record)) {
    const label = FIELD_LABELS[key] ?? humanizeKey(key);
    const fullLabel = prefix ? `${prefix} — ${label}` : label;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      pushRecordFields(
        entries,
        sectionTitle,
        value as Record<string, unknown>,
        fullLabel,
      );
      continue;
    }

    pushField(entries, sectionTitle, fullLabel, value);
  }
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function appendMsqScores(entries: StepOneDisplayEntry[], stepOne: StepOne): void {
  const sectionTitle = SECTION_TITLES.symptoms;
  const scores = stepOne.symptoms.msq_scores;
  if (!scores) {
    return;
  }

  for (const category of Object.keys(scores) as MsqCategory[]) {
    const categoryScores = scores[category];
    if (!categoryScores) {
      continue;
    }

    for (const symptom of MSQ_SYMPTOMS[category] ?? []) {
      const score = categoryScores[symptom] ?? 0;
      if (score > 0) {
        entries.push({
          sectionTitle,
          label: `${humanizeKey(category)} — ${symptom}`,
          value: String(score),
        });
      }
    }
  }
}

function appendDiagnoses(entries: StepOneDisplayEntry[], stepOne: StepOne): void {
  const sectionTitle = SECTION_TITLES.history;
  const rows = stepOne.history.diagnoses.filter((row) => row.condition.trim());

  if (rows.length === 0) {
    pushField(entries, sectionTitle, "Diagnoses", null);
    return;
  }

  rows.forEach((row, index) => {
    const summary = [
      row.condition.trim(),
      row.year.trim() ? `(${row.year.trim()})` : null,
      row.status.trim() ? `— ${row.status.trim()}` : null,
      row.treatment.trim() ? `— ${row.treatment.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    entries.push({
      sectionTitle,
      label: `Diagnosis ${index + 1}`,
      value: summary || NOT_PROVIDED,
    });
  });
}

function appendMedicationRows(
  entries: StepOneDisplayEntry[],
  sectionTitle: string,
  labelPrefix: string,
  rows: Array<{ name: string; dosage: string; frequency: string; duration: string; prescriber: string }>,
): void {
  const filled = rows.filter((row) => row.name.trim());
  if (filled.length === 0) {
    pushField(entries, sectionTitle, labelPrefix, null);
    return;
  }

  filled.forEach((row, index) => {
    const details = [row.dosage, row.frequency, row.duration, row.prescriber]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" · ");

    entries.push({
      sectionTitle,
      label: `${labelPrefix} ${index + 1}`,
      value: details ? `${row.name.trim()} (${details})` : row.name.trim(),
    });
  });
}

function appendWearableDevices(entries: StepOneDisplayEntry[], stepOne: StepOne): void {
  const sectionTitle = SECTION_TITLES.wearables;
  const devices = stepOne.wearables.devices.filter((device) => device.trim());

  if (devices.length === 0) {
    pushField(entries, sectionTitle, "Devices", null);
    return;
  }

  entries.push({
    sectionTitle,
    label: "Devices",
    value: devices.join(", "),
  });
}

/** Flattens Step 1 intake into labeled Q&A rows for dashboard and email surfaces. */
export function formatStepOneForDisplay(intakeData: IntakeData): StepOneDisplayEntry[] {
  const entries: StepOneDisplayEntry[] = [];
  const stepOne: StepOne = {
    about_you: intakeData.about_you,
    why_here: intakeData.why_here,
    symptoms: intakeData.symptoms,
    history: intakeData.history,
    medications: intakeData.medications,
    lifestyle: intakeData.lifestyle,
    hormones: intakeData.hormones,
    previous_labs: intakeData.previous_labs,
    wearables: intakeData.wearables,
    anything_else: intakeData.anything_else,
  };

  pushRecordFields(entries, SECTION_TITLES.about_you, stepOne.about_you as Record<string, unknown>);
  pushRecordFields(entries, SECTION_TITLES.why_here, stepOne.why_here as Record<string, unknown>);
  pushField(entries, SECTION_TITLES.symptoms, FIELD_LABELS.top_concerns, stepOne.symptoms.top_concerns);
  appendMsqScores(entries, stepOne);
  appendDiagnoses(entries, stepOne);
  pushField(entries, SECTION_TITLES.history, FIELD_LABELS.surgeries, stepOne.history.surgeries);
  pushField(
    entries,
    SECTION_TITLES.history,
    FIELD_LABELS.family_history,
    stepOne.history.family_history,
  );
  appendMedicationRows(
    entries,
    SECTION_TITLES.medications,
    "Prescription",
    stepOne.medications.prescriptions,
  );
  appendMedicationRows(
    entries,
    SECTION_TITLES.medications,
    "Supplement",
    stepOne.medications.supplements,
  );
  pushField(
    entries,
    SECTION_TITLES.medications,
    FIELD_LABELS.recently_stopped,
    stepOne.medications.recently_stopped,
  );
  pushRecordFields(
    entries,
    SECTION_TITLES.lifestyle,
    stepOne.lifestyle as unknown as Record<string, unknown>,
  );
  pushRecordFields(
    entries,
    SECTION_TITLES.hormones,
    stepOne.hormones as unknown as Record<string, unknown>,
  );
  pushField(
    entries,
    SECTION_TITLES.previous_labs,
    FIELD_LABELS.has_previous_labs,
    stepOne.previous_labs.has_previous_labs,
  );
  pushField(
    entries,
    SECTION_TITLES.previous_labs,
    FIELD_LABELS.remembered_results,
    stepOne.previous_labs.remembered_results,
  );
  appendWearableDevices(entries, stepOne);
  pushField(
    entries,
    SECTION_TITLES.wearables,
    FIELD_LABELS.usage_duration,
    stepOne.wearables.usage_duration,
  );
  pushField(
    entries,
    SECTION_TITLES.wearables,
    FIELD_LABELS.willing_to_share,
    stepOne.wearables.willing_to_share,
  );
  pushRecordFields(
    entries,
    SECTION_TITLES.anything_else,
    stepOne.anything_else as Record<string, unknown>,
  );

  return entries;
}

export function groupStepOneDisplayEntries(
  entries: StepOneDisplayEntry[],
): Array<{ sectionTitle: string; fields: StepOneDisplayEntry[] }> {
  const order: string[] = [];
  const grouped = new Map<string, StepOneDisplayEntry[]>();

  for (const entry of entries) {
    if (!grouped.has(entry.sectionTitle)) {
      grouped.set(entry.sectionTitle, []);
      order.push(entry.sectionTitle);
    }
    grouped.get(entry.sectionTitle)?.push(entry);
  }

  return order.map((sectionTitle) => ({
    sectionTitle,
    fields: grouped.get(sectionTitle) ?? [],
  }));
}
