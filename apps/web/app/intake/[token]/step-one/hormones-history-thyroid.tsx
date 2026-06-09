"use client";

import type { Hormones } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, labelClass, sublabelClass, textareaClass } from "./shared";

const GYNECOLOGICAL_OPTIONS = ["PCOS", "Endometriosis", "Fibroids"];

const THYROID_SYMPTOM_OPTIONS = [
  "Fatigue",
  "Weight gain",
  "Cold intolerance",
  "Hair thinning",
  "Dry skin",
  "Constipation",
  "Brain fog",
  "Depression",
  "Heat intolerance",
  "Weight loss",
  "Anxiety",
  "Rapid heartbeat",
  "Tremors",
  "Insomnia",
  "Neck swelling",
];

type HormonesHistoryThyroidProps = {
  value: Hormones;
  onChange: (next: Hormones) => void;
  toggleMulti: (
    field: "thyroid_symptoms" | "pcos_endo_fibroids",
    option: string,
  ) => void;
};

export function HormonesHistoryThyroidBlock({
  value,
  onChange,
  toggleMulti,
}: HormonesHistoryThyroidProps) {
  const patch = (partial: Partial<Hormones>) => onChange({ ...value, ...partial });

  return (
    <>
      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Hormone history</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Menopause status</span>
            <select
              className={inputClass}
              value={value.menopause_status}
              onChange={(e) =>
                patch({
                  menopause_status: e.target.value as Hormones["menopause_status"],
                })
              }
            >
              <option value="">—</option>
              <option value="pre">Pre-menopause</option>
              <option value="peri">Peri-menopause</option>
              <option value="post">Post-menopause</option>
              <option value="na">N/A</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>
              Birth control: current or recent use? Type?
            </span>
            <input
              className={inputClass}
              value={value.birth_control}
              onChange={(e) => patch({ birth_control: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>
              Hormone replacement therapy (HRT)? Current or past?
            </span>
            <input
              className={inputClass}
              value={value.hrt_history}
              onChange={(e) => patch({ hrt_history: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>
              Previous hormone testing? (DUTCH, blood panel) When and results if known
            </span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.previous_hormone_testing}
              onChange={(e) => patch({ previous_hormone_testing: e.target.value })}
            />
          </label>
          <div>
            <span className={sublabelClass}>
              History of PCOS, endometriosis, or fibroids?
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {GYNECOLOGICAL_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
                >
                  <input
                    type="checkbox"
                    checked={value.pcos_endo_fibroids.includes(opt)}
                    onChange={() => toggleMulti("pcos_endo_fibroids", opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Thyroid</h3>
        <label className="flex flex-col gap-2">
          <span className={sublabelClass}>Any thyroid diagnosis?</span>
          <input
            className={inputClass}
            value={value.thyroid_diagnosis}
            onChange={(e) => patch({ thyroid_diagnosis: e.target.value })}
          />
        </label>
        <div className="mt-3">
          <span className={sublabelClass}>
            Do you experience any of these thyroid-related symptoms?
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {THYROID_SYMPTOM_OPTIONS.map((opt) => (
              <label
                key={opt}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
              >
                <input
                  type="checkbox"
                  checked={value.thyroid_symptoms.includes(opt)}
                  onChange={() => toggleMulti("thyroid_symptoms", opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Blood sugar & metabolism</h3>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>
            Any blood sugar issues? (diabetes, pre-diabetes, reactive hypoglycemia, insulin
            resistance)
          </span>
          <textarea
            className={textareaClass}
            rows={2}
            value={value.blood_sugar_issues}
            onChange={(e) => patch({ blood_sugar_issues: e.target.value })}
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className={labelClass}>Any metabolism concerns?</span>
          <textarea
            className={textareaClass}
            rows={2}
            value={value.metabolism_concerns}
            onChange={(e) => patch({ metabolism_concerns: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}
