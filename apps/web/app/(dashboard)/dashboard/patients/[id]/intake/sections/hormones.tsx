"use client";

import { useEffect, useState } from "react";
import type { IntakeHormoneSection } from "@/lib/intake-schema";

interface Props {
  patientId: string;
  initial: IntakeHormoneSection | undefined;
  onDraftChange?: (v: IntakeHormoneSection) => void;
  SectionShell: React.ComponentType<{
    title: string;
    description?: string;
    status: { saving: boolean; savedAt: string | null; error: string | null };
    children: React.ReactNode;
  }>;
  useDebouncedSave: (
    patientId: string,
    section: string,
    value: unknown,
  ) => { savedAt: string | null; saving: boolean; error: string | null };
}

const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus";
const labelClass = "text-xs font-medium uppercase tracking-wide text-ink-subtle";

const PMS_OPTIONS = [
  "Bloating", "Breast tenderness", "Cramps", "Mood swings",
  "Irritability", "Headaches", "Fatigue", "Acne", "Food cravings",
  "Back pain", "Anxiety", "Depression",
];

const THYROID_SYMPTOM_OPTIONS = [
  "Fatigue", "Weight gain", "Cold intolerance", "Hair thinning",
  "Dry skin", "Constipation", "Brain fog", "Depression",
  "Heat intolerance", "Weight loss", "Anxiety", "Rapid heartbeat",
  "Tremors", "Insomnia", "Neck swelling",
];

const GYNECOLOGICAL_OPTIONS = ["PCOS", "Endometriosis", "Fibroids"];

const EMPTY: IntakeHormoneSection = {
  cycle_regular: "",
  cycle_length_days: null,
  period_length_days: null,
  pms_symptoms: [],
  last_period_date: "",
  cycle_tracking: "",
  menopause_status: "",
  hrt_history: "",
  thyroid_diagnosis: "",
  thyroid_symptoms: [],
  pcos_endo_fibroids: [],
  previous_hormone_testing: "",
  birth_control: "",
  blood_sugar_issues: "",
  metabolism_concerns: "",
};

export function HormonesSection({
  patientId,
  initial,
  onDraftChange,
  SectionShell,
  useDebouncedSave,
}: Props) {
  const [data, setData] = useState<IntakeHormoneSection>(
    initial?.cycle_regular !== undefined ? initial : EMPTY,
  );
  const status = useDebouncedSave(patientId, "hormones", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<IntakeHormoneSection>) {
    setData((d) => ({ ...d, ...p }));
  }

  function toggleMulti(field: "pms_symptoms" | "thyroid_symptoms" | "pcos_endo_fibroids", value: string) {
    setData((d) => {
      const current = d[field];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...d, [field]: next };
    });
  }

  return (
    <SectionShell
      title="Hormones & cycle"
      description="Your menstrual cycle is a vital sign. This section is required for all patients."
      status={status}
    >
      {/* Menstrual cycle */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Menstrual cycle</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Regular or irregular?</span>
            <select className={inputClass} value={data.cycle_regular} onChange={(e) => patch({ cycle_regular: e.target.value as IntakeHormoneSection["cycle_regular"] })}>
              <option value="">—</option>
              <option value="regular">Regular</option>
              <option value="irregular">Irregular</option>
              <option value="no_period">No period</option>
              <option value="na">N/A</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Cycle length (days)</span>
            <input className={inputClass} type="number" value={data.cycle_length_days ?? ""} min={0} max={100} onChange={(e) => patch({ cycle_length_days: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 28" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Period length (days)</span>
            <input className={inputClass} type="number" value={data.period_length_days ?? ""} min={0} max={30} onChange={(e) => patch({ period_length_days: e.target.value ? Number(e.target.value) : null })} placeholder="e.g. 5" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Last period date</span>
            <input className={inputClass} type="date" value={data.last_period_date} onChange={(e) => patch({ last_period_date: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Do you track your cycle? If yes, how?</span>
            <input className={inputClass} value={data.cycle_tracking} onChange={(e) => patch({ cycle_tracking: e.target.value })} placeholder="App, wearable (Oura), Mira, Inito, etc." />
          </label>
        </div>

        <div className="mt-3">
          <span className={labelClass}>PMS symptoms (check all that apply)</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PMS_OPTIONS.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors hover:bg-surface-sunken cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.pms_symptoms.includes(opt)}
                  onChange={() => toggleMulti("pms_symptoms", opt)}
                  className="h-3.5 w-3.5"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Hormone history */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Hormone history</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Menopause status</span>
            <select className={inputClass} value={data.menopause_status} onChange={(e) => patch({ menopause_status: e.target.value as IntakeHormoneSection["menopause_status"] })}>
              <option value="">—</option>
              <option value="pre">Pre-menopause</option>
              <option value="peri">Peri-menopause</option>
              <option value="post">Post-menopause</option>
              <option value="na">N/A</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Birth control: current or recent use? Type?</span>
            <input className={inputClass} value={data.birth_control} onChange={(e) => patch({ birth_control: e.target.value })} placeholder="Pill, IUD, patch, none, etc." />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1">
          <span className={labelClass}>Hormone replacement therapy (HRT)? Current or past?</span>
          <input className={inputClass} value={data.hrt_history} onChange={(e) => patch({ hrt_history: e.target.value })} placeholder="Type, duration, current status" />
        </label>
        <label className="mt-3 flex flex-col gap-1">
          <span className={labelClass}>Previous hormone testing? (DUTCH, blood panel) When and results if known</span>
          <textarea className={inputClass} value={data.previous_hormone_testing} onChange={(e) => patch({ previous_hormone_testing: e.target.value })} rows={2} />
        </label>

        <div className="mt-3">
          <span className={labelClass}>History of PCOS, endometriosis, or fibroids?</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GYNECOLOGICAL_OPTIONS.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors hover:bg-surface-sunken cursor-pointer">
                <input type="checkbox" checked={data.pcos_endo_fibroids.includes(opt)} onChange={() => toggleMulti("pcos_endo_fibroids", opt)} className="h-3.5 w-3.5" />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Thyroid */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Thyroid</h4>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Any thyroid diagnosis?</span>
          <input className={inputClass} value={data.thyroid_diagnosis} onChange={(e) => patch({ thyroid_diagnosis: e.target.value })} placeholder="Hypothyroid, Hashimoto's, Graves', etc. or none" />
        </label>
        <div className="mt-3">
          <span className={labelClass}>Do you experience any of these thyroid-related symptoms?</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {THYROID_SYMPTOM_OPTIONS.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors hover:bg-surface-sunken cursor-pointer">
                <input type="checkbox" checked={data.thyroid_symptoms.includes(opt)} onChange={() => toggleMulti("thyroid_symptoms", opt)} className="h-3.5 w-3.5" />
                {opt}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Blood sugar / metabolism */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Blood sugar & metabolism</h4>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Any blood sugar issues? (diabetes, pre-diabetes, reactive hypoglycemia, insulin resistance)</span>
          <textarea className={inputClass} value={data.blood_sugar_issues} onChange={(e) => patch({ blood_sugar_issues: e.target.value })} rows={2} placeholder="Diagnosis, treatment, or symptoms you've noticed" />
        </label>
        <label className="mt-3 flex flex-col gap-1">
          <span className={labelClass}>Any metabolism concerns?</span>
          <textarea className={inputClass} value={data.metabolism_concerns} onChange={(e) => patch({ metabolism_concerns: e.target.value })} rows={2} placeholder="Difficulty losing weight, energy crashes after meals, etc." />
        </label>
      </div>
    </SectionShell>
  );
}
