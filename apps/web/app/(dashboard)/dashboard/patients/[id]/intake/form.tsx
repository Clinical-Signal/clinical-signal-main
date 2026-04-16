"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  emptyDiagnosis,
  emptyMedication,
  emptySymptom,
  type IntakeData,
  type IntakeDiagnosis,
  type IntakeGoalsSection,
  type IntakeHistorySection,
  type IntakeLifestyleSection,
  type IntakeMedication,
  type IntakeMedicationsSection,
  type IntakePreviousLabsSection,
  type IntakeSectionKey,
  type IntakeSymptom,
  type IntakeSymptomsSection,
} from "@/lib/intake-schema";
import { saveSectionAction, submitIntakeAction } from "./actions";

const SAVE_DEBOUNCE_MS = 1500;

interface Props {
  patientId: string;
  initial: IntakeData;
}

export function IntakeForm({ patientId, initial }: Props) {
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <SymptomsSection
        patientId={patientId}
        initial={initial.symptoms}
      />
      <HistorySection patientId={patientId} initial={initial.history} />
      <MedicationsSection patientId={patientId} initial={initial.medications} />
      <LifestyleSection patientId={patientId} initial={initial.lifestyle} />
      <GoalsSection patientId={patientId} initial={initial.goals} />
      <PreviousLabsSection
        patientId={patientId}
        initial={initial.previous_labs}
      />

      <div className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          Submitting marks intake as complete and advances the patient to{" "}
          <em>labs pending</em>. You can still edit afterward.
        </p>
        <button
          type="button"
          disabled={submitting}
          className="self-start rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          onClick={() =>
            startSubmit(async () => {
              setSubmitError(null);
              const res = await submitIntakeAction(patientId);
              if (res && !res.ok) setSubmitError(res.error);
            })
          }
        >
          {submitting ? "Submitting…" : "Submit intake"}
        </button>
        {submitError ? (
          <p className="text-sm text-red-600">{submitError}</p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper with auto-save
// ---------------------------------------------------------------------------

function useDebouncedSave<T>(
  patientId: string,
  section: IntakeSectionKey,
  value: T,
  initialSavedAt: string | null = null,
) {
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const skipFirst = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await saveSectionAction(patientId, section, valueRef.current);
        if (res.ok) setSavedAt(res.savedAt);
        else setError(res.error);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [patientId, section, value]);

  return { savedAt, saving, error };
}

function SectionShell({
  title,
  status,
  children,
}: {
  title: string;
  status: { saving: boolean; savedAt: string | null; error: string | null };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <SaveStatus {...status} />
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function SaveStatus({
  saving,
  savedAt,
  error,
}: {
  saving: boolean;
  savedAt: string | null;
  error: string | null;
}) {
  if (error) return <span className="text-xs text-red-600">Save failed: {error}</span>;
  if (saving) return <span className="text-xs text-slate-500">Saving…</span>;
  if (savedAt)
    return (
      <span className="text-xs text-slate-500">
        Saved {new Date(savedAt).toLocaleTimeString()}
      </span>
    );
  return <span className="text-xs text-slate-400">Not yet saved</span>;
}

// ---------------------------------------------------------------------------
// Shared form atoms
// ---------------------------------------------------------------------------

const inputClass =
  "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none";
const labelClass = "text-xs font-medium uppercase tracking-wide text-slate-500";

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T | ""; label: string }[];
  onChange: (v: T | "") => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <textarea
        className={inputClass}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>
        {label} <span className="ml-2 text-slate-700">{value ?? "—"}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-xs text-red-600 hover:underline"
    >
      Remove
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded border border-dashed border-slate-400 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      + {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section: Symptoms
// ---------------------------------------------------------------------------

function SymptomsSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakeSymptomsSection | undefined;
}) {
  const [data, setData] = useState<IntakeSymptomsSection>(
    // Defensively coerce: legacy seed has `symptoms: { sleep: ..., energy: ... }`
    // (object) instead of `{ symptoms: [], top_concerns: "" }`. Treat any
    // non-conforming shape as empty so the form renders.
    Array.isArray(initial?.symptoms)
      ? (initial as IntakeSymptomsSection)
      : { symptoms: [], top_concerns: initial?.top_concerns ?? "" },
  );
  const status = useDebouncedSave(patientId, "symptoms", data);

  function patchSymptom(i: number, patch: Partial<IntakeSymptom>) {
    setData((d) => ({
      ...d,
      symptoms: d.symptoms.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  }

  return (
    <SectionShell title="Current symptoms" status={status}>
      <div className="flex flex-col gap-3">
        {data.symptoms.length === 0 ? (
          <p className="text-sm text-slate-500">No symptoms recorded yet.</p>
        ) : null}
        {data.symptoms.map((s, i) => (
          <div
            key={i}
            className="rounded border border-slate-200 bg-slate-50 p-3"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <TextField
                label="Symptom"
                value={s.name}
                onChange={(v) => patchSymptom(i, { name: v })}
              />
              <SliderField
                label="Severity (1–10)"
                value={s.severity}
                onChange={(v) => patchSymptom(i, { severity: v })}
              />
              <NumberField
                label="Duration"
                value={s.duration_value}
                onChange={(v) => patchSymptom(i, { duration_value: v })}
                min={0}
              />
              <SelectField
                label="Unit"
                value={s.duration_unit ?? ""}
                onChange={(v) =>
                  patchSymptom(i, { duration_unit: (v || null) as IntakeSymptom["duration_unit"] })
                }
                options={[
                  { value: "", label: "—" },
                  { value: "days", label: "Days" },
                  { value: "weeks", label: "Weeks" },
                  { value: "months", label: "Months" },
                  { value: "years", label: "Years" },
                ]}
              />
            </div>
            <div className="mt-3">
              <TextArea
                label="Notes"
                value={s.notes}
                onChange={(v) => patchSymptom(i, { notes: v })}
                rows={2}
              />
            </div>
            <div className="mt-2">
              <RemoveButton
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    symptoms: d.symptoms.filter((_, idx) => idx !== i),
                  }))
                }
              />
            </div>
          </div>
        ))}
        <AddButton
          onClick={() =>
            setData((d) => ({ ...d, symptoms: [...d.symptoms, emptySymptom()] }))
          }
        >
          Add symptom
        </AddButton>
        <TextArea
          label="Top 3 health concerns"
          value={data.top_concerns}
          onChange={(v) => setData((d) => ({ ...d, top_concerns: v }))}
          rows={3}
          placeholder="What matters most to this patient right now?"
        />
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section: History
// ---------------------------------------------------------------------------

function HistorySection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakeHistorySection | undefined;
}) {
  const [data, setData] = useState<IntakeHistorySection>(
    Array.isArray(initial?.diagnoses)
      ? (initial as IntakeHistorySection)
      : { diagnoses: [], surgeries: "", family_history: "" },
  );
  const status = useDebouncedSave(patientId, "history", data);

  function patchDx(i: number, patch: Partial<IntakeDiagnosis>) {
    setData((d) => ({
      ...d,
      diagnoses: d.diagnoses.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    }));
  }

  return (
    <SectionShell title="Health history" status={status}>
      {data.diagnoses.map((dx, i) => (
        <div
          key={i}
          className="rounded border border-slate-200 bg-slate-50 p-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <TextField
              label="Condition"
              value={dx.condition}
              onChange={(v) => patchDx(i, { condition: v })}
            />
            <TextField
              label="Year diagnosed"
              value={dx.year}
              onChange={(v) => patchDx(i, { year: v })}
              placeholder="YYYY"
            />
            <SelectField
              label="Status"
              value={dx.status}
              onChange={(v) => patchDx(i, { status: v as IntakeDiagnosis["status"] })}
              options={[
                { value: "", label: "—" },
                { value: "active", label: "Active" },
                { value: "managed", label: "Managed" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
            <TextField
              label="Treatment"
              value={dx.treatment}
              onChange={(v) => patchDx(i, { treatment: v })}
            />
          </div>
          <div className="mt-2">
            <RemoveButton
              onClick={() =>
                setData((d) => ({
                  ...d,
                  diagnoses: d.diagnoses.filter((_, idx) => idx !== i),
                }))
              }
            />
          </div>
        </div>
      ))}
      <AddButton
        onClick={() =>
          setData((d) => ({ ...d, diagnoses: [...d.diagnoses, emptyDiagnosis()] }))
        }
      >
        Add diagnosis
      </AddButton>
      <TextArea
        label="Surgeries or hospitalizations"
        value={data.surgeries}
        onChange={(v) => setData((d) => ({ ...d, surgeries: v }))}
      />
      <TextArea
        label="Family health history"
        value={data.family_history}
        onChange={(v) => setData((d) => ({ ...d, family_history: v }))}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section: Medications & supplements
// ---------------------------------------------------------------------------

function MedicationList({
  label,
  items,
  onChange,
  addLabel,
}: {
  label: string;
  items: IntakeMedication[];
  onChange: (next: IntakeMedication[]) => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-slate-700">{label}</h4>
      {items.map((m, i) => (
        <div
          key={i}
          className="rounded border border-slate-200 bg-slate-50 p-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <TextField
              label="Name"
              value={m.name}
              onChange={(v) => onChange(items.map((x, idx) => (idx === i ? { ...x, name: v } : x)))}
            />
            <TextField
              label="Dosage"
              value={m.dosage}
              onChange={(v) => onChange(items.map((x, idx) => (idx === i ? { ...x, dosage: v } : x)))}
            />
            <TextField
              label="Frequency"
              value={m.frequency}
              onChange={(v) =>
                onChange(items.map((x, idx) => (idx === i ? { ...x, frequency: v } : x)))
              }
            />
            <TextField
              label="How long taking"
              value={m.duration}
              onChange={(v) =>
                onChange(items.map((x, idx) => (idx === i ? { ...x, duration: v } : x)))
              }
            />
            <TextField
              label="Prescriber (optional)"
              value={m.prescriber}
              onChange={(v) =>
                onChange(items.map((x, idx) => (idx === i ? { ...x, prescriber: v } : x)))
              }
            />
          </div>
          <div className="mt-2">
            <RemoveButton onClick={() => onChange(items.filter((_, idx) => idx !== i))} />
          </div>
        </div>
      ))}
      <AddButton onClick={() => onChange([...items, emptyMedication()])}>{addLabel}</AddButton>
    </div>
  );
}

function MedicationsSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakeMedicationsSection | undefined;
}) {
  const [data, setData] = useState<IntakeMedicationsSection>(
    Array.isArray(initial?.prescriptions) || Array.isArray(initial?.supplements)
      ? (initial as IntakeMedicationsSection)
      : { prescriptions: [], supplements: [] },
  );
  const status = useDebouncedSave(patientId, "medications", data);
  return (
    <SectionShell title="Medications & supplements" status={status}>
      <MedicationList
        label="Prescription medications"
        items={data.prescriptions}
        onChange={(prescriptions) => setData((d) => ({ ...d, prescriptions }))}
        addLabel="Add prescription"
      />
      <MedicationList
        label="Supplements"
        items={data.supplements}
        onChange={(supplements) => setData((d) => ({ ...d, supplements }))}
        addLabel="Add supplement"
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section: Lifestyle
// ---------------------------------------------------------------------------

function LifestyleSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakeLifestyleSection | undefined;
}) {
  const [data, setData] = useState<IntakeLifestyleSection>(
    initial && typeof initial.sleep === "object" && initial.sleep !== null
      ? initial
      : {
          sleep: { average_hours: null, quality: "", issues: "" },
          nutrition: { diet_type: "", restrictions: "", sensitivities: "", water_oz_per_day: null },
          exercise: { type: "", frequency_per_week: null, intensity: "" },
          stress: { level: null, sources: "", management: "" },
        },
  );
  const status = useDebouncedSave(patientId, "lifestyle", data);

  return (
    <SectionShell title="Lifestyle" status={status}>
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Sleep</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <NumberField
            label="Average hours / night"
            value={data.sleep.average_hours}
            onChange={(v) => setData((d) => ({ ...d, sleep: { ...d.sleep, average_hours: v } }))}
            min={0}
            max={24}
            step={0.5}
          />
          <SelectField
            label="Quality"
            value={data.sleep.quality}
            onChange={(v) =>
              setData((d) => ({ ...d, sleep: { ...d.sleep, quality: v as IntakeLifestyleSection["sleep"]["quality"] } }))
            }
            options={[
              { value: "", label: "—" },
              { value: "poor", label: "Poor" },
              { value: "fair", label: "Fair" },
              { value: "good", label: "Good" },
              { value: "excellent", label: "Excellent" },
            ]}
          />
        </div>
        <div className="mt-3">
          <TextArea
            label="Sleep issues"
            value={data.sleep.issues}
            onChange={(v) => setData((d) => ({ ...d, sleep: { ...d.sleep, issues: v } }))}
            rows={2}
            placeholder="Trouble falling asleep, waking at 3am, etc."
          />
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Nutrition</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SelectField
            label="Diet type"
            value={data.nutrition.diet_type}
            onChange={(v) =>
              setData((d) => ({
                ...d,
                nutrition: { ...d.nutrition, diet_type: v as IntakeLifestyleSection["nutrition"]["diet_type"] },
              }))
            }
            options={[
              { value: "", label: "—" },
              { value: "standard", label: "Standard" },
              { value: "paleo", label: "Paleo" },
              { value: "keto", label: "Keto" },
              { value: "vegan", label: "Vegan" },
              { value: "vegetarian", label: "Vegetarian" },
              { value: "mediterranean", label: "Mediterranean" },
              { value: "other", label: "Other" },
            ]}
          />
          <NumberField
            label="Daily water (oz)"
            value={data.nutrition.water_oz_per_day}
            onChange={(v) =>
              setData((d) => ({ ...d, nutrition: { ...d.nutrition, water_oz_per_day: v } }))
            }
            min={0}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextArea
            label="Restrictions"
            value={data.nutrition.restrictions}
            onChange={(v) =>
              setData((d) => ({ ...d, nutrition: { ...d.nutrition, restrictions: v } }))
            }
            rows={2}
          />
          <TextArea
            label="Food sensitivities"
            value={data.nutrition.sensitivities}
            onChange={(v) =>
              setData((d) => ({ ...d, nutrition: { ...d.nutrition, sensitivities: v } }))
            }
            rows={2}
          />
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Exercise</h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TextField
            label="Type"
            value={data.exercise.type}
            onChange={(v) => setData((d) => ({ ...d, exercise: { ...d.exercise, type: v } }))}
          />
          <NumberField
            label="Sessions / week"
            value={data.exercise.frequency_per_week}
            onChange={(v) =>
              setData((d) => ({ ...d, exercise: { ...d.exercise, frequency_per_week: v } }))
            }
            min={0}
            max={14}
          />
          <SelectField
            label="Intensity"
            value={data.exercise.intensity}
            onChange={(v) =>
              setData((d) => ({
                ...d,
                exercise: { ...d.exercise, intensity: v as IntakeLifestyleSection["exercise"]["intensity"] },
              }))
            }
            options={[
              { value: "", label: "—" },
              { value: "low", label: "Low" },
              { value: "moderate", label: "Moderate" },
              { value: "high", label: "High" },
            ]}
          />
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Stress</h4>
        <SliderField
          label="Stress level (1–10)"
          value={data.stress.level}
          onChange={(v) => setData((d) => ({ ...d, stress: { ...d.stress, level: v } }))}
        />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextArea
            label="Main sources"
            value={data.stress.sources}
            onChange={(v) => setData((d) => ({ ...d, stress: { ...d.stress, sources: v } }))}
            rows={2}
          />
          <TextArea
            label="Current stress management"
            value={data.stress.management}
            onChange={(v) => setData((d) => ({ ...d, stress: { ...d.stress, management: v } }))}
            rows={2}
          />
        </div>
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section: Goals
// ---------------------------------------------------------------------------

function GoalsSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakeGoalsSection | undefined;
}) {
  const [data, setData] = useState<IntakeGoalsSection>(
    initial && typeof initial.desired_outcomes === "string"
      ? initial
      : { desired_outcomes: "", failed_approaches: "", commitment: null },
  );
  const status = useDebouncedSave(patientId, "goals", data);
  return (
    <SectionShell title="Health goals" status={status}>
      <TextArea
        label="What are you hoping to achieve?"
        value={data.desired_outcomes}
        onChange={(v) => setData((d) => ({ ...d, desired_outcomes: v }))}
        rows={3}
      />
      <TextArea
        label="What have you tried that hasn't worked?"
        value={data.failed_approaches}
        onChange={(v) => setData((d) => ({ ...d, failed_approaches: v }))}
        rows={3}
      />
      <SliderField
        label="Commitment to making changes (1–10)"
        value={data.commitment}
        onChange={(v) => setData((d) => ({ ...d, commitment: v }))}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Section: Previous labs
// ---------------------------------------------------------------------------

function PreviousLabsSection({
  patientId,
  initial,
}: {
  patientId: string;
  initial: IntakePreviousLabsSection | undefined;
}) {
  const [data, setData] = useState<IntakePreviousLabsSection>(
    initial ?? { has_previous_labs: null, remembered_results: "" },
  );
  const status = useDebouncedSave(patientId, "previous_labs", data);
  return (
    <SectionShell title="Previous labs" status={status}>
      <fieldset className="flex gap-4 text-sm">
        <legend className={labelClass}>Do you have previous lab results?</legend>
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map(({ v, label }) => (
          <label key={label} className="flex items-center gap-1">
            <input
              type="radio"
              checked={data.has_previous_labs === v}
              onChange={() => setData((d) => ({ ...d, has_previous_labs: v }))}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {data.has_previous_labs ? (
        <p className="text-xs text-slate-500">
          Upload PDFs from the{" "}
          <a className="underline" href={`/dashboard/patients/${patientId}/records`}>
            records page
          </a>
          .
        </p>
      ) : null}
      <TextArea
        label="Any results you remember"
        value={data.remembered_results}
        onChange={(v) => setData((d) => ({ ...d, remembered_results: v }))}
        rows={3}
        placeholder="e.g. ferritin 28, TSH 2.1, vitamin D 22"
      />
    </SectionShell>
  );
}
