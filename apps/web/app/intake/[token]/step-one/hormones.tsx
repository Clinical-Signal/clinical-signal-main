"use client";

import {
  HormonesSchema,
  createEmptyHormones,
  type Hormones,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  labelClass,
  sublabelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

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

const GYNECOLOGICAL_OPTIONS = ["PCOS", "Endometriosis", "Fibroids"];

type HormonesScreenProps = {
  token: string;
  value: Hormones;
  onChange: (next: Hormones) => void;
  onIntakeDataSynced: (hormones: Hormones) => void;
};

export function HormonesScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: HormonesScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "hormones",
    value,
    schema: HormonesSchema,
    onSynced: onIntakeDataSynced,
  });

  const patch = (partial: Partial<Hormones>) => onChange({ ...value, ...partial });

  const toggleMulti = (
    field: "pms_symptoms" | "thyroid_symptoms" | "pcos_endo_fibroids",
    option: string,
  ) => {
    const current = value[field];
    patch({
      [field]: current.includes(option)
        ? current.filter((entry) => entry !== option)
        : [...current, option],
    });
  };

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Hormones & cycle"
        description="Required for all patients — your cycle is a vital sign."
        saveStatus={saveStatus}
      />

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
    </section>
  );
}

export function normalizeHormonesFromIntake(data: Partial<Hormones> | undefined): Hormones {
  const empty = createEmptyHormones();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
