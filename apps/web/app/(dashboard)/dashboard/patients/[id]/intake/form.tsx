"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  intakeCompletionPct,
  shouldShowConditionalSection,
  getHormoneData,
  INTAKE_SECTIONS,
} from "@/lib/intake-schema";
import { useBranching } from "@/lib/intake-branching";
import {
  emptyDiagnosis,
  emptyMedication,
  emptySymptom,
  type IntakeData,
  type IntakeAnythingElseSection,
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
  type IntakeWearablesSection,
} from "@/lib/intake-schema";
import { submitIntakeAction } from "./actions";
import {
  useDebouncedSave,
  SectionShell,
  TextField,
  NumberField,
  SelectField,
  TextArea,
  SliderField,
  RemoveButton,
  AddButton,
  inputClass,
  labelClass,
} from "./shared";

// New v2 sections
import { AboutYouSection } from "./sections/about-you";
import { WhyHereSection } from "./sections/why-here";
import { MsqSymptomsSection } from "./sections/msq-symptoms";
import { HormonesSection } from "./sections/hormones";
import { WearablesSection } from "./sections/wearables";
import { AnythingElseSection } from "./sections/anything-else";
// v3 conditional deep dives
import { SleepDeepDiveSection } from "./sections/sleep-deep-dive";
import { StressDeepDiveSection } from "./sections/stress-deep-dive";
import { SkinDeepDiveSection } from "./sections/skin-deep-dive";
import { MetabolismDeepDiveSection } from "./sections/metabolism-deep-dive";

interface Props {
  patientId: string;
  initial: IntakeData;
}

export function IntakeForm({ patientId, initial }: Props) {
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draft, setDraft] = useState<IntakeData>(initial);
  const pct = useMemo(() => intakeCompletionPct(draft), [draft]);

  // Branching engine — evaluates rules against current answers
  const branching = useBranching(draft);

  // Conditional section visibility (legacy + new branching engine)
  const showGut = shouldShowConditionalSection(draft.symptoms, "gut_deep_dive");
  const showImmune = shouldShowConditionalSection(draft.symptoms, "immune_deep_dive");
  const showSleep = branching.showSection("sleep_deep_dive");
  const showStress = branching.showSection("stress_deep_dive");
  const showSkin = branching.showSection("skin_deep_dive");
  const showMetabolism = branching.showSection("metabolism_deep_dive");

  // Count visible conditional sections for progress display
  const conditionalCount = [showGut, showImmune, showSleep, showStress, showSkin, showMetabolism].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Duration estimate per Dr. Laura */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-5 py-3 text-sm text-ink">
        Please set aside <strong>15-20 minutes</strong> to fully complete this
        intake so you and your practitioner can make the most of your time
        together.
      </div>

      {/* Progress bar with conditional section indicators */}
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
        {/* Show which conditional deep dives were triggered */}
        {conditionalCount > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {showGut && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Gut deep dive
              </span>
            )}
            {showImmune && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                Immune deep dive
              </span>
            )}
            {showSleep && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                Sleep deep dive
              </span>
            )}
            {showStress && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Stress deep dive
              </span>
            )}
            {showSkin && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                Skin deep dive
              </span>
            )}
            {showMetabolism && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                Metabolism deep dive
              </span>
            )}
            <span className="self-center text-[10px] text-ink-subtle">
              — triggered by your answers
            </span>
          </div>
        )}
      </div>

      {/* Section 1: About You */}
      <AboutYouSection
        patientId={patientId}
        initial={draft.about_you}
        onDraftChange={(v) => setDraft((d) => ({ ...d, about_you: v }))}
      />

      {/* Section 2: Why You're Here */}
      <WhyHereSection
        patientId={patientId}
        initial={draft.why_here}
        onDraftChange={(v) => setDraft((d) => ({ ...d, why_here: v }))}
      />

      {/* Section 3: Current Symptoms (MSQ) */}
      <MsqSymptomsSection
        patientId={patientId}
        initial={draft.symptoms}
        onDraftChange={(v) => setDraft((d) => ({ ...d, symptoms: v }))}
      />

      {/* Section 4: Health History */}
      <HistorySection
        patientId={patientId}
        initial={initial.history}
        onDraftChange={(v) => setDraft((d) => ({ ...d, history: v }))}
      />

      {/* Section 5: Medications & Supplements */}
      <MedicationsSection
        patientId={patientId}
        initial={initial.medications}
        onDraftChange={(v) => setDraft((d) => ({ ...d, medications: v }))}
      />

      {/* Section 6: Lifestyle */}
      <LifestyleSection
        patientId={patientId}
        initial={initial.lifestyle}
        onDraftChange={(v) => setDraft((d) => ({ ...d, lifestyle: v }))}
      />

      {/* Section 7: Hormones & Cycle (REQUIRED — not conditional) */}
      <HormonesSection
        patientId={patientId}
        initial={getHormoneData(draft)}
        onDraftChange={(v) => setDraft((d) => ({ ...d, hormones: v }))}
      />

      {/* Section 8: Gut Health Deep Dive (conditional) */}
      {showGut && (
        <GutDeepDiveSection
          patientId={patientId}
          initial={draft.gut_deep_dive}
          onDraftChange={(v) => setDraft((d) => ({ ...d, gut_deep_dive: v }))}
        />
      )}

      {/* Section 9: Immune Deep Dive (conditional) */}
      {showImmune && (
        <ImmuneDeepDiveSection
          patientId={patientId}
          initial={draft.immune_deep_dive}
          onDraftChange={(v) => setDraft((d) => ({ ...d, immune_deep_dive: v }))}
        />
      )}

      {/* Section 9a: Sleep Deep Dive (conditional — branching engine) */}
      {showSleep && (
        <SleepDeepDiveSection
          patientId={patientId}
          initial={draft.sleep_deep_dive as any}
          onDraftChange={(v) => setDraft((d) => ({ ...d, sleep_deep_dive: v as any }))}
        />
      )}

      {/* Section 9b: Stress Deep Dive (conditional — branching engine) */}
      {showStress && (
        <StressDeepDiveSection
          patientId={patientId}
          initial={draft.stress_deep_dive as any}
          onDraftChange={(v) => setDraft((d) => ({ ...d, stress_deep_dive: v as any }))}
        />
      )}

      {/* Section 9c: Skin Deep Dive (conditional — branching engine) */}
      {showSkin && (
        <SkinDeepDiveSection
          patientId={patientId}
          initial={draft.skin_deep_dive as any}
          onDraftChange={(v) => setDraft((d) => ({ ...d, skin_deep_dive: v as any }))}
        />
      )}

      {/* Section 9d: Metabolism Deep Dive (conditional — branching engine) */}
      {showMetabolism && (
        <MetabolismDeepDiveSection
          patientId={patientId}
          initial={draft.metabolism_deep_dive as any}
          onDraftChange={(v) => setDraft((d) => ({ ...d, metabolism_deep_dive: v as any }))}
        />
      )}

      {/* Section 10: Previous Labs */}
      <PreviousLabsSection
        patientId={patientId}
        initial={initial.previous_labs}
        onDraftChange={(v) => setDraft((d) => ({ ...d, previous_labs: v }))}
      />

      {/* Section 11: Goals (kept from v1, overlaps with WhyHere) */}
      <GoalsSection
        patientId={patientId}
        initial={initial.goals}
        onDraftChange={(v) => setDraft((d) => ({ ...d, goals: v }))}
      />

      {/* Section 12: Wearables */}
      <WearablesSection
        patientId={patientId}
        initial={initial.wearables}
        onDraftChange={(v) => setDraft((d) => ({ ...d, wearables: v }))}
      />

      {/* Section 13: Anything Else */}
      <AnythingElseSection
        patientId={patientId}
        initial={initial.anything_else}
        onDraftChange={(v) => setDraft((d) => ({ ...d, anything_else: v }))}
      />

      {/* Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken/60 px-5 py-4">
        <p className="max-w-md text-sm text-ink-muted">
          Submitting advances the patient to <em>labs pending</em>. You can
          edit intake afterwards — nothing is locked. A copy of your responses
          will be saved as a PDF for your records.
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
// Inline sections (kept from v1 — will be extracted to files later)
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
        label="Surgeries or hospitalizations (includes cosmetic surgeries)"
        value={data.surgeries}
        onChange={(v) => setData((d) => ({ ...d, surgeries: v }))}
      />
      <TextArea
        label="Family health history"
        value={data.family_history}
        onChange={(v) => setData((d) => ({ ...d, family_history: v }))}
        placeholder="Heart disease, diabetes, cancer, autoimmune, thyroid, mental health — note which family members"
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Medications
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
      <TextArea
        label="Any medications or supplements stopped in the last 6 months? What and why?"
        value={data.recently_stopped ?? ""}
        onChange={(v) => setData((d) => ({ ...d, recently_stopped: v }))}
        rows={2}
      />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Lifestyle
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
          wellness_practices: {},
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
      {/* Sleep */}
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
          <SelectField
            label="Wake feeling rested?"
            value={data.sleep.wake_feeling_rested ?? ""}
            onChange={(v) =>
              setData((d) => ({ ...d, sleep: { ...d.sleep, wake_feeling_rested: v as IntakeLifestyleSection["sleep"]["wake_feeling_rested"] } }))
            }
            options={[
              { value: "", label: "—" },
              { value: "never", label: "Never" },
              { value: "sometimes", label: "Sometimes" },
              { value: "usually", label: "Usually" },
              { value: "always", label: "Always" },
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

      {/* Nutrition */}
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
              { value: "standard", label: "Standard American" },
              { value: "paleo", label: "Paleo" },
              { value: "keto", label: "Keto" },
              { value: "carnivore", label: "Carnivore" },
              { value: "vegan", label: "Vegan" },
              { value: "vegetarian", label: "Vegetarian" },
              { value: "mediterranean", label: "Mediterranean" },
              { value: "none", label: "No specific diet" },
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
        <div className="mt-3">
          <TextArea
            label="What's your relationship with food / eating?"
            value={data.nutrition.food_relationship ?? ""}
            onChange={(v) =>
              setData((d) => ({ ...d, nutrition: { ...d.nutrition, food_relationship: v } }))
            }
            rows={2}
            placeholder="This helps us understand whether tracking or specific dietary recommendations are appropriate."
          />
        </div>
      </div>

      {/* Exercise */}
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

      {/* Stress */}
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

      {/* Wellness Practices */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <h4 className="mb-2 text-sm font-semibold text-ink">Wellness practices</h4>
        <div className="flex flex-col gap-3">
          {(["sauna", "cold_exposure", "meditation_breathwork", "journaling"] as const).map((key) => {
            const labels: Record<string, string> = {
              sauna: "Sauna use?",
              cold_exposure: "Cold exposure?",
              meditation_breathwork: "Meditation or breathwork?",
              journaling: "Journaling?",
            };
            const val = data.wellness_practices?.[key];
            const detailKey = `${key}_details` as keyof NonNullable<IntakeLifestyleSection["wellness_practices"]>;
            const hasDetails = key !== "journaling";
            return (
              <div key={key}>
                <div className="flex items-center gap-4">
                  <span className={`${labelClass} min-w-[200px]`}>{labels[key]}</span>
                  {[
                    { v: true, label: "Yes" },
                    { v: false, label: "No" },
                  ].map(({ v, label }) => (
                    <label key={label} className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        checked={val === v}
                        onChange={() =>
                          setData((d) => ({
                            ...d,
                            wellness_practices: { ...d.wellness_practices, [key]: v },
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {val === true && hasDetails && (
                  <div className="mt-2 ml-[200px]">
                    <input
                      className={inputClass}
                      value={(data.wellness_practices?.[detailKey] as string) ?? ""}
                      placeholder="Type, frequency, duration, etc."
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          wellness_practices: { ...d.wellness_practices, [detailKey]: e.target.value },
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          <TextArea
            label="Other wellness practices"
            value={data.wellness_practices?.other ?? ""}
            onChange={(v) =>
              setData((d) => ({
                ...d,
                wellness_practices: { ...d.wellness_practices, other: v },
              }))
            }
            rows={2}
            placeholder="Anything else you do for your health — grounding, red light therapy, etc."
          />
        </div>
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Gut Deep Dive (conditional)
// ---------------------------------------------------------------------------

function GutDeepDiveSection({
  patientId,
  initial,
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeData["gut_deep_dive"];
  onDraftChange?: (v: NonNullable<IntakeData["gut_deep_dive"]>) => void;
}) {
  const [data, setData] = useState(
    initial ?? {
      bowel_frequency: "",
      bowel_consistency: "",
      bloating_details: "",
      heartburn_reflux: "",
      gas_burping: "",
      diagnosed_gi_conditions: [],
      previous_gi_testing: "",
      antibiotic_history: "",
      antacid_ppi_history: "",
      elimination_trials: "",
    },
  );
  const status = useDebouncedSave(patientId, "gut_deep_dive", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  return (
    <SectionShell
      title="Gut health deep dive"
      description="Triggered by digestive symptoms. Helps guide GI-specific lab ordering and protocol."
      status={status}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextArea label="Typical bowel habits (frequency)" value={data.bowel_frequency} onChange={(v) => setData((d) => ({ ...d, bowel_frequency: v }))} rows={2} placeholder="How often? Bristol stool chart reference if known" />
        <TextArea label="Bowel consistency" value={data.bowel_consistency} onChange={(v) => setData((d) => ({ ...d, bowel_consistency: v }))} rows={2} />
      </div>
      <TextArea label="Bloating: when does it happen? After specific foods?" value={data.bloating_details} onChange={(v) => setData((d) => ({ ...d, bloating_details: v }))} rows={2} />
      <TextArea label="Heartburn or reflux?" value={data.heartburn_reflux} onChange={(v) => setData((d) => ({ ...d, heartburn_reflux: v }))} rows={2} placeholder="How often, triggers, what helps" />
      <TextArea label="Gas or burping?" value={data.gas_burping} onChange={(v) => setData((d) => ({ ...d, gas_burping: v }))} rows={2} placeholder="How often, timing, triggers" />
      <TextArea label="Previous GI testing? (GI Map, SIBO breath test, endoscopy, colonoscopy)" value={data.previous_gi_testing} onChange={(v) => setData((d) => ({ ...d, previous_gi_testing: v }))} rows={2} />
      <TextArea label="History of antibiotic use (frequency, most recent)" value={data.antibiotic_history} onChange={(v) => setData((d) => ({ ...d, antibiotic_history: v }))} rows={2} />
      <TextArea label="History of antacid/PPI use" value={data.antacid_ppi_history} onChange={(v) => setData((d) => ({ ...d, antacid_ppi_history: v }))} rows={2} />
      <TextArea label="Food elimination trials? What happened?" value={data.elimination_trials} onChange={(v) => setData((d) => ({ ...d, elimination_trials: v }))} rows={2} />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Immune Deep Dive (conditional)
// ---------------------------------------------------------------------------

function ImmuneDeepDiveSection({
  patientId,
  initial,
  onDraftChange,
}: {
  patientId: string;
  initial: IntakeData["immune_deep_dive"];
  onDraftChange?: (v: NonNullable<IntakeData["immune_deep_dive"]>) => void;
}) {
  const [data, setData] = useState(
    initial ?? {
      autoimmune_conditions: "",
      diagnosed_when: "",
      current_treatment: "",
      flare_triggers: "",
      illness_frequency_per_year: null,
      vaccination_history: "",
      mold_exposure: "",
      tick_borne_illness: "",
    },
  );
  const status = useDebouncedSave(patientId, "immune_deep_dive", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  return (
    <SectionShell
      title="Immune deep dive"
      description="Triggered by autoimmune symptoms. Helps identify underlying immune drivers."
      status={status}
    >
      <TextField label="Which autoimmune condition(s)?" value={data.autoimmune_conditions} onChange={(v) => setData((d) => ({ ...d, autoimmune_conditions: v }))} />
      <TextField label="When diagnosed?" value={data.diagnosed_when} onChange={(v) => setData((d) => ({ ...d, diagnosed_when: v }))} />
      <TextArea label="Current treatment (medications, biologics)?" value={data.current_treatment} onChange={(v) => setData((d) => ({ ...d, current_treatment: v }))} rows={2} />
      <TextArea label="Known triggers for flares?" value={data.flare_triggers} onChange={(v) => setData((d) => ({ ...d, flare_triggers: v }))} rows={2} />
      <NumberField label="Frequency of common illness (colds, flu per year)" value={data.illness_frequency_per_year} onChange={(v) => setData((d) => ({ ...d, illness_frequency_per_year: v }))} min={0} max={20} />
      <TextArea label="Mold exposure history?" value={data.mold_exposure} onChange={(v) => setData((d) => ({ ...d, mold_exposure: v }))} rows={2} />
      <TextArea label="Tick-borne illness history?" value={data.tick_borne_illness} onChange={(v) => setData((d) => ({ ...d, tick_borne_illness: v }))} rows={2} />
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Goals (v1 — kept for backward compat)
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
// Previous Labs
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
