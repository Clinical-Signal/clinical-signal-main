"use client";

import type { Lifestyle } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, labelClass, textareaClass } from "./shared";

type WellnessPractices = Lifestyle["wellness_practices"];

const PRACTICE_KEYS = [
  "sauna",
  "cold_exposure",
  "meditation_breathwork",
  "journaling",
] as const;

const PRACTICE_LABELS: Record<(typeof PRACTICE_KEYS)[number], string> = {
  sauna: "Sauna use?",
  cold_exposure: "Cold exposure?",
  meditation_breathwork: "Meditation or breathwork?",
  journaling: "Journaling?",
};

type LifestyleWellnessProps = {
  wellness: WellnessPractices;
  onChange: (wellness: WellnessPractices) => void;
};

export function LifestyleWellnessBlock({ wellness, onChange }: LifestyleWellnessProps) {
  const patch = (partial: Partial<WellnessPractices>) =>
    onChange({ ...wellness, ...partial });

  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Wellness practices</h3>
      <div className="flex flex-col gap-4">
        {PRACTICE_KEYS.map((key) => {
          const val = wellness[key];
          const detailKey =
            key === "journaling"
              ? null
              : (`${key}_details` as "sauna_details" | "cold_exposure_details" | "meditation_details");
          return (
            <div key={key}>
              <div className="flex flex-wrap items-center gap-4">
                <span className={`${labelClass} min-w-[12rem]`}>{PRACTICE_LABELS[key]}</span>
                {(
                  [
                    { v: true, label: "Yes" },
                    { v: false, label: "No" },
                  ] as const
                ).map(({ v, label }) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={key}
                      checked={val === v}
                      onChange={() => patch({ [key]: v })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {val === true && detailKey ? (
                <input
                  className={`${inputClass} mt-2`}
                  value={wellness[detailKey]}
                  placeholder="Type, frequency, duration…"
                  onChange={(e) => patch({ [detailKey]: e.target.value })}
                />
              ) : null}
            </div>
          );
        })}
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Other wellness practices</span>
          <textarea
            className={textareaClass}
            rows={2}
            value={wellness.other}
            onChange={(e) => patch({ other: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
