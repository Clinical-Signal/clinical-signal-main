"use client";

import {
  HistorySchema,
  createEmptyHistory,
  emptyDiagnosis,
  type History,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  labelClass,
  sublabelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

type HealthHistoryScreenProps = {
  token: string;
  value: History;
  onChange: (next: History) => void;
  onIntakeDataSynced: (history: History) => void;
};

export function HealthHistoryScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: HealthHistoryScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "history",
    value,
    schema: HistorySchema,
    onSynced: onIntakeDataSynced,
  });

  const patchDx = (index: number, partial: Partial<History["diagnoses"][number]>) => {
    onChange({
      ...value,
      diagnoses: value.diagnoses.map((row, i) =>
        i === index ? { ...row, ...partial } : row,
      ),
    });
  };

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Health history"
        description="Prior diagnoses, surgeries, and family history."
        saveStatus={saveStatus}
      />

      {value.diagnoses.map((dx, index) => (
        <div key={index} className="rounded-lg border border-line bg-surface-sunken p-4">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className={sublabelClass}>Condition</span>
              <input
                className={inputClass}
                value={dx.condition}
                onChange={(e) => patchDx(index, { condition: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={sublabelClass}>Year diagnosed</span>
              <input
                className={inputClass}
                value={dx.year}
                onChange={(e) => patchDx(index, { year: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={sublabelClass}>Status</span>
              <select
                className={inputClass}
                value={dx.status}
                onChange={(e) =>
                  patchDx(index, {
                    status: e.target.value as History["diagnoses"][number]["status"],
                  })
                }
              >
                <option value="">—</option>
                <option value="active">Active</option>
                <option value="managed">Managed</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className={sublabelClass}>Treatment</span>
              <input
                className={inputClass}
                value={dx.treatment}
                onChange={(e) => patchDx(index, { treatment: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 text-sm text-danger"
            onClick={() =>
              onChange({
                ...value,
                diagnoses: value.diagnoses.filter((_, i) => i !== index),
              })
            }
          >
            Remove diagnosis
          </button>
        </div>
      ))}

      <button
        type="button"
        className="rounded-md border border-dashed border-line-strong px-4 py-2 text-sm text-ink-muted"
        onClick={() =>
          onChange({ ...value, diagnoses: [...value.diagnoses, emptyDiagnosis()] })
        }
      >
        + Add diagnosis
      </button>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          Surgeries or hospitalizations (includes cosmetic surgeries)
        </span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.surgeries}
          onChange={(e) => onChange({ ...value, surgeries: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Family health history</span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.family_history}
          onChange={(e) => onChange({ ...value, family_history: e.target.value })}
        />
      </label>
    </section>
  );
}

export function normalizeHistoryFromIntake(data: Partial<History> | undefined): History {
  const empty = createEmptyHistory();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data, diagnoses: data.diagnoses ?? [] };
}
