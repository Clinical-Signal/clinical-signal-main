"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { intakeCompletionPct } from "@/lib/intake-schema";
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
  // Track the latest draft snapshot so the sticky progress bar updates as
  // the practitioner fills sections. Starts from the server-rendered
  // `initial` and is patched by each section via onDraftChange.
  const [draft, setDraft] = useState<IntakeData>(initial);
  const pct = useMemo(() => intakeCompletionPct(draft), [draft]);

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-14 z-[5] -mx-4 rounded-xl border border-line bg-surface/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-ink-subtle">
            Intake progress ·{" "}
            <span className="text-ink">{pct}% complete</span>
          </div>
          <div className="text-xs text-ink-subtle">
            Auto-saves as you type
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <SymptomsSection
        patientId={patientId}
        initial={initial.symptoms}
        onDraftChange={(v) => setDraft((d) => ({ ...d, symptoms: v }))}
      />
      <HistorySection
        patientId={patientId}
        initial={initial.history}
        onDraftChange={(v) => setDraft((d) => ({ ...d, history: v }))}
      />
      <MedicationsSection
        patientId={patientId}
        initial={initial.medications}
        onDraftChange={(v) => setDraft((d) => ({ ...d, medications: v }))}
      />
      <LifestyleSection
        patientId={patientId}
        initial={initial.lifestyle}
        onDraftChange={(v) => setDraft((d) => ({ ...d, lifestyle: v }))}
      />
      <GoalsSection
        patientId={patientId}
        initial={initial.goals}
        onDraftChange={(v) => setDraft((d) => ({ ...d, goals: v }))}
      />
      <PreviousLabsSection
        patientId={patientId}
        initial={initial.previous_labs}
        onDraftChange={(v) => setDraft((d) => ({ ...d, previous_labs: v }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken/60 px-5 py-4">
        <p className="max-w-md text-sm text-ink-muted">
          Submitting advances the patient to <em>labs pending</em>. You can
          edit intake afterwards — nothing is locked.
        </p>
        <div className="flex flex-col items-end gap-1">
          <Button
            loading={submitting}
            loadingText="Submitting…"
            onClick={() =>
              startSubmit(async () => {
                setSubmitError(null);
                const res = await submitIntakeAction(patientId);
                if (res && !res.ok) setSubmitError(res.error);
              })
            }
          >
            Submit intake
          </Button>
          {submitError ? (
            <p className="text-sm text-danger">{submitError}</p>
          ) : null}
        </div>
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
  description,
  status,
  children,
}: {
  title: string;
  description?: string;
  status: { saving: boolean; savedAt: string | null; error: string | null };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>
          ) : null}
        </div>
        <SaveStatus {...status} />
      </header>
      <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
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
  if (error)
    return (
      <span className="text-xs text-danger">Couldn&apos;t save: {error}</span>
    );
  if (saving)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Saving…
      </span>
    );
  if (savedAt)
    return (
      <span className="text-xs text-ink-subtle">
        Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    );
  return <span className="text-xs text-ink-faint">Not yet saved</span>;
}

// ---------------------------------------------------------------------------
// Shared form atoms
// ---------------------------------------------------------------------------

const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus " +
  "disabled:bg-surface-sunken disabled:text-ink-subtle";
const labelClass = "text-xs font-medium uppercase tracking-wide text-ink-subtle";

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
        {label} <span className="ml-2 text-ink">{value ?? "—"}</span>
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
      className="self-start text-xs text-danger transition-colors hover:text-danger/80"
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
      className="self-start rounded-md border border-dashed border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-sunken"
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeSymptomsSection | undefined;
  onDraftChange?: (v: IntakeSymptomsSection) => void;
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
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patchSymptom(i: number, patch: Partial<IntakeSymptom>) {
    setData((d) => ({
      ...d,
      symptoms: d.symptoms.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  }

  return (
    <SectionShell
      title="Current symptoms"
      description="What the patient is experiencing right now. Severity on a 1–10 scale."
      status={status}
    >
      <div className="flex flex-col gap-3">
        {data.symptoms.length === 0 ? (
          <p className="text-sm text-ink-subtle">No symptoms recorded yet.</p>
        ) : null}
        {data.symptoms.map((s, i) => (
          <div
            key={i}
            className="rounded-lg border border-line bg-surface-sunken/50 p-3"
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeHistorySection | undefined;
  onDraftChange?: (v: IntakeHistorySection) => void;
}) {
  const [data, setData] = useState<IntakeHistorySection>(
    Array.isArray(initial?.diagnoses)
      ? (initial as IntakeHistorySection)
      : { diagnoses: [], surgeries: "", family_history: "" },
  );
  const status = useDebouncedSave(patientId, "history", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patchDx(i: number, patch: Partial<IntakeDiagnosis>) {
    setData((d) => ({
      ...d,
      diagnoses: d.diagnoses.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    }));
  }

  return (
    <SectionShell
      title="Health history"
      description="Prior diagnoses, surgeries, hospitalizations, and relevant family history."
      status={status}
    >
      {data.diagnoses.map((dx, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface-sunken/50 p-3"
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
      <h4 className="text-sm font-semibold text-ink">{label}</h4>
      {items.map((m, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface-sunken/50 p-3"
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeMedicationsSection | undefined;
  onDraftChange?: (v: IntakeMedicationsSection) => void;
}) {
  const [data, setData] = useState<IntakeMedicationsSection>(
    Array.isArray(initial?.prescriptions) || Array.isArray(initial?.supplements)
      ? (initial as IntakeMedicationsSection)
      : { prescriptions: [], supplements: [] },
  );
  const status = useDebouncedSave(patientId, "medications", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);
  return (
    <SectionShell
      title="Medications & supplements"
      description="Everything the patient is currently taking — prescription and non-prescription."
      status={status}
    >
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeLifestyleSection | undefined;
  onDraftChange?: (v: IntakeLifestyleSection) => void;
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
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  return (
    <SectionShell
      title="Lifestyle"
      description="Sleep, nutrition, movement, and stress. Foundations that shape every downstream system."
      status={status}
    >
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Sleep</h4>
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

      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Nutrition</h4>
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

      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Exercise</h4>
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

      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Stress</h4>
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeGoalsSection | undefined;
  onDraftChange?: (v: IntakeGoalsSection) => void;
}) {
  const [data, setData] = useState<IntakeGoalsSection>(
    initial && typeof initial.desired_outcomes === "string"
      ? initial
      : { desired_outcomes: "", failed_approaches: "", commitment: null },
  );
  const status = useDebouncedSave(patientId, "goals", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);
  return (
    <SectionShell
      title="Health goals"
      description="What the patient wants to achieve, and what they've already tried."
      status={status}
    >
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
  onDraftChange,
}: {
  patientId: string;
  initial: IntakePreviousLabsSection | undefined;
  onDraftChange?: (v: IntakePreviousLabsSection) => void;
}) {
  const [data, setData] = useState<IntakePreviousLabsSection>(
    initial ?? { has_previous_labs: null, remembered_results: "" },
  );
  const status = useDebouncedSave(patientId, "previous_labs", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);
  return (
    <SectionShell
      title="Previous labs"
      description="Anything they've had run before. Upload PDFs from the records page."
      status={status}
    >
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
        <p className="text-xs text-ink-subtle">
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
