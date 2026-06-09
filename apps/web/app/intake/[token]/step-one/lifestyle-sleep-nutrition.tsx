"use client";

import type { Lifestyle } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, labelClass, sublabelClass, textareaClass } from "./shared";

type LifestyleSleepNutritionProps = {
  value: Lifestyle;
  onChange: (next: Lifestyle) => void;
};

export function LifestyleSleepNutritionBlock({
  value,
  onChange,
}: LifestyleSleepNutritionProps) {
  return (
    <>
      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Sleep</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Average hours / night</span>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={value.sleep.average_hours ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  sleep: {
                    ...value.sleep,
                    average_hours: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Quality</span>
            <select
              className={inputClass}
              value={value.sleep.quality}
              onChange={(e) =>
                onChange({
                  ...value,
                  sleep: {
                    ...value.sleep,
                    quality: e.target.value as Lifestyle["sleep"]["quality"],
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="poor">Poor</option>
              <option value="fair">Fair</option>
              <option value="good">Good</option>
              <option value="excellent">Excellent</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Wake feeling rested?</span>
            <select
              className={inputClass}
              value={value.sleep.wake_feeling_rested}
              onChange={(e) =>
                onChange({
                  ...value,
                  sleep: {
                    ...value.sleep,
                    wake_feeling_rested: e.target.value as Lifestyle["sleep"]["wake_feeling_rested"],
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="never">Never</option>
              <option value="sometimes">Sometimes</option>
              <option value="usually">Usually</option>
              <option value="always">Always</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Sleep issues</span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.sleep.issues}
              onChange={(e) =>
                onChange({ ...value, sleep: { ...value.sleep, issues: e.target.value } })
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Nutrition</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Diet type</span>
            <select
              className={inputClass}
              value={value.nutrition.diet_type}
              onChange={(e) =>
                onChange({
                  ...value,
                  nutrition: {
                    ...value.nutrition,
                    diet_type: e.target.value as Lifestyle["nutrition"]["diet_type"],
                  },
                })
              }
            >
              <option value="">—</option>
              <option value="standard">Standard American</option>
              <option value="paleo">Paleo</option>
              <option value="keto">Keto</option>
              <option value="carnivore">Carnivore</option>
              <option value="vegan">Vegan</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="mediterranean">Mediterranean</option>
              <option value="none">No specific diet</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Daily water (oz)</span>
            <input
              className={inputClass}
              type="number"
              min={0}
              value={value.nutrition.water_oz_per_day ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  nutrition: {
                    ...value.nutrition,
                    water_oz_per_day: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Restrictions</span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.nutrition.restrictions}
              onChange={(e) =>
                onChange({
                  ...value,
                  nutrition: { ...value.nutrition, restrictions: e.target.value },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Food sensitivities</span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.nutrition.sensitivities}
              onChange={(e) =>
                onChange({
                  ...value,
                  nutrition: { ...value.nutrition, sensitivities: e.target.value },
                })
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={labelClass}>
              What&apos;s your relationship with food / eating?
            </span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.nutrition.food_relationship}
              onChange={(e) =>
                onChange({
                  ...value,
                  nutrition: { ...value.nutrition, food_relationship: e.target.value },
                })
              }
            />
          </label>
        </div>
      </div>
    </>
  );
}
