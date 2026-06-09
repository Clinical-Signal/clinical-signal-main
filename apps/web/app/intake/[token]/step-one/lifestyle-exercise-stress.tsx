"use client";

import type { Lifestyle } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, labelClass, sublabelClass, textareaClass } from "./shared";

type LifestyleExerciseStressProps = {
  value: Lifestyle;
  onChange: (next: Lifestyle) => void;
};

export function LifestyleExerciseStressBlock({
  value,
  onChange,
}: LifestyleExerciseStressProps) {
  return (
    <>
      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Exercise</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Type</span>
            <input
              className={inputClass}
              value={value.exercise.type}
              onChange={(e) =>
                onChange({
                  ...value,
                  exercise: { ...value.exercise, type: e.target.value },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Sessions / week</span>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={value.exercise.frequency_per_week ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  exercise: {
                    ...value.exercise,
                    frequency_per_week: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Intensity</span>
            <select
              className={inputClass}
              value={value.exercise.intensity}
              onChange={(e) =>
                onChange({
                  ...value,
                  exercise: {
                    ...value.exercise,
                    intensity: e.target.value as Lifestyle["exercise"]["intensity"],
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Stress</h3>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>
            Stress level (1–10){" "}
            <span className="text-ink">{value.stress.level ?? "—"}</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={value.stress.level ?? 5}
            onChange={(e) =>
              onChange({
                ...value,
                stress: { ...value.stress, level: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className={sublabelClass}>Main sources</span>
          <textarea
            className={textareaClass}
            rows={2}
            value={value.stress.sources}
            onChange={(e) =>
              onChange({ ...value, stress: { ...value.stress, sources: e.target.value } })
            }
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className={sublabelClass}>Current stress management</span>
          <textarea
            className={textareaClass}
            rows={2}
            value={value.stress.management}
            onChange={(e) =>
              onChange({
                ...value,
                stress: { ...value.stress, management: e.target.value },
              })
            }
          />
        </label>
      </div>
    </>
  );
}
