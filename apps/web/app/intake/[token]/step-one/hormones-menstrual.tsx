"use client";

import type { Hormones } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, sublabelClass } from "./shared";

const PMS_OPTIONS = [
  "Bloating",
  "Breast tenderness",
  "Cramps",
  "Mood swings",
  "Irritability",
  "Headaches",
  "Fatigue",
  "Acne",
  "Food cravings",
  "Back pain",
  "Anxiety",
  "Depression",
];

type HormonesMenstrualProps = {
  value: Hormones;
  onChange: (next: Hormones) => void;
  toggleMulti: (field: "pms_symptoms", option: string) => void;
};

export function HormonesMenstrualBlock({
  value,
  onChange,
  toggleMulti,
}: HormonesMenstrualProps) {
  const patch = (partial: Partial<Hormones>) => onChange({ ...value, ...partial });

  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Menstrual cycle</h3>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Regular or irregular?</span>
          <select
            className={inputClass}
            value={value.cycle_regular}
            onChange={(e) =>
              patch({ cycle_regular: e.target.value as Hormones["cycle_regular"] })
            }
          >
            <option value="">—</option>
            <option value="regular">Regular</option>
            <option value="irregular">Irregular</option>
            <option value="no_period">No period</option>
            <option value="na">N/A</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Cycle length (days)</span>
          <input
            className={inputClass}
            type="number"
            value={value.cycle_length_days ?? ""}
            onChange={(e) =>
              patch({
                cycle_length_days: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Period length (days)</span>
          <input
            className={inputClass}
            type="number"
            value={value.period_length_days ?? ""}
            onChange={(e) =>
              patch({
                period_length_days: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Last period date</span>
          <input
            className={inputClass}
            type="date"
            value={value.last_period_date}
            onChange={(e) => patch({ last_period_date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Do you track your cycle? If yes, how?</span>
          <input
            className={inputClass}
            value={value.cycle_tracking}
            onChange={(e) => patch({ cycle_tracking: e.target.value })}
          />
        </label>
        <div>
          <span className={sublabelClass}>PMS symptoms (check all that apply)</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PMS_OPTIONS.map((opt) => (
              <label
                key={opt}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
              >
                <input
                  type="checkbox"
                  checked={value.pms_symptoms.includes(opt)}
                  onChange={() => toggleMulti("pms_symptoms", opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
