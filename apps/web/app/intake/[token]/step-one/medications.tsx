"use client";

import {
  MedicationsSchema,
  createEmptyMedications,
  emptyMedicationRow,
  type MedicationRow,
  type Medications,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  labelClass,
  sublabelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

function MedicationList({
  title,
  rows,
  onChange,
  addLabel,
}: {
  title: string;
  rows: MedicationRow[];
  onChange: (next: MedicationRow[]) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.map((row, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface-sunken p-4">
          <div className="flex flex-col gap-3">
            {(
              [
                ["Name", "name"],
                ["Dosage", "dosage"],
                ["Frequency", "frequency"],
                ["How long taking", "duration"],
                ["Prescriber (optional)", "prescriber"],
              ] as const
            ).map(([label, field]) => (
              <label key={field} className="flex flex-col gap-2">
                <span className={sublabelClass}>{label}</span>
                <input
                  className={inputClass}
                  value={row[field]}
                  onChange={(e) =>
                    onChange(
                      rows.map((item, i) =>
                        i === index ? { ...item, [field]: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-sm text-danger"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded-md border border-dashed border-line-strong px-4 py-2 text-sm text-ink-muted"
        onClick={() => onChange([...rows, emptyMedicationRow()])}
      >
        + {addLabel}
      </button>
    </div>
  );
}

type MedicationsScreenProps = {
  token: string;
  value: Medications;
  onChange: (next: Medications) => void;
  onIntakeDataSynced: (medications: Medications) => void;
};

export function MedicationsScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: MedicationsScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "medications",
    value,
    schema: MedicationsSchema,
    onSynced: onIntakeDataSynced,
  });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Medications & supplements"
        description="Everything you are currently taking."
        saveStatus={saveStatus}
      />

      <MedicationList
        title="Prescription medications"
        rows={value.prescriptions}
        onChange={(prescriptions) => onChange({ ...value, prescriptions })}
        addLabel="Add prescription"
      />

      <MedicationList
        title="Supplements"
        rows={value.supplements}
        onChange={(supplements) => onChange({ ...value, supplements })}
        addLabel="Add supplement"
      />

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          Any medications or supplements stopped in the last 6 months? What and why?
        </span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.recently_stopped}
          onChange={(e) => onChange({ ...value, recently_stopped: e.target.value })}
        />
      </label>
    </section>
  );
}

export function normalizeMedicationsFromIntake(
  data: Partial<Medications> | undefined,
): Medications {
  const empty = createEmptyMedications();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
