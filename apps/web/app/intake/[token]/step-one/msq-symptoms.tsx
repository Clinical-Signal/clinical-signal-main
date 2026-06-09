"use client";

import { useMemo, useState } from "react";

import {
  MSQ_CATEGORIES,
  MSQ_SYMPTOMS,
  msqCategoryTotal,
  msqGrandTotal,
  msqSeverityLabel,
  type MsqCategory,
} from "@/lib/intake-schema";
import {
  SymptomsSchema,
  createEmptyMsqScores,
  createEmptySymptoms,
  type MsqScore,
  type Symptoms,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  sublabelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

const CATEGORY_LABELS: Record<MsqCategory, string> = {
  head: "Head",
  eyes: "Eyes",
  ears: "Ears",
  nose: "Nose",
  mouth_throat: "Mouth & throat",
  skin: "Skin",
  heart: "Heart",
  lungs: "Lungs",
  digestive: "Digestive tract",
  joints_muscles: "Joints & muscles",
  weight: "Weight",
  energy_activity: "Energy & activity",
  mind: "Mind",
  emotions: "Emotions",
  other: "Other",
};

const SCORE_LABELS: Record<MsqScore, string> = {
  0: "Never",
  1: "Occasional, not severe",
  2: "Occasional, severe",
  3: "Frequent, not severe",
  4: "Frequent, severe",
};

const SEVERITY_TONE: Record<string, string> = {
  optimal: "border-line bg-success-soft text-success",
  mild: "border-line bg-warning-soft text-warning",
  moderate: "border-line bg-warning-soft text-warning",
  severe: "border-line bg-danger-soft text-danger",
};

type MsqSymptomsScreenProps = {
  token: string;
  value: Symptoms;
  onChange: (next: Symptoms) => void;
  onIntakeDataSynced: (symptoms: Symptoms) => void;
};

export function MsqSymptomsScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: MsqSymptomsScreenProps) {
  const { saveStatus, saveOnBlur, saveValue } = useSectionBlurSave({
    token,
    section: "symptoms",
    value,
    schema: SymptomsSchema,
    onSynced: onIntakeDataSynced,
  });

  const [expanded, setExpanded] = useState<Set<MsqCategory>>(new Set());
  const grandTotal = useMemo(() => msqGrandTotal(value.msq_scores), [value.msq_scores]);
  const severityLevel = msqSeverityLabel(grandTotal);

  const setScore = (cat: MsqCategory, symptom: string, score: MsqScore) => {
    const next: Symptoms = {
      ...value,
      msq_scores: {
        ...value.msq_scores,
        [cat]: {
          ...(value.msq_scores?.[cat] ?? {}),
          [symptom]: score,
        },
      },
    };
    onChange(next);
    void saveValue(next);
  };

  const toggleCategory = (cat: MsqCategory) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Current symptoms"
        description="Rate each symptom for the past 30 days."
        saveStatus={saveStatus}
      />

      <div className={`rounded-lg border p-4 ${SEVERITY_TONE[severityLevel]}`}>
        <p className="text-sm font-semibold">
          MSQ total: {grandTotal} · {severityLevel}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {MSQ_CATEGORIES.map((cat) => {
          const catTotal = msqCategoryTotal(value.msq_scores?.[cat]);
          const isOpen = expanded.has(cat);
          return (
            <div key={cat} className="rounded-lg border border-line bg-surface">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-ink">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-sm text-accent">{catTotal}</span>
              </button>
              {isOpen ? (
                <div className="border-t border-line px-3 py-3">
                  {MSQ_SYMPTOMS[cat].map((symptom) => {
                    const val = value.msq_scores?.[cat]?.[symptom] ?? 0;
                    return (
                      <div
                        key={symptom}
                        className="grid grid-cols-1 gap-2 border-t border-line py-2 first:border-t-0 sm:grid-cols-[1fr,auto]"
                      >
                        <span className="text-sm text-ink">{symptom}</span>
                        <div className="flex gap-1">
                          {([0, 1, 2, 3, 4] as MsqScore[]).map((score) => (
                            <button
                              key={score}
                              type="button"
                              title={SCORE_LABELS[score]}
                              onClick={() => setScore(cat, symptom, score)}
                              className={`h-9 w-9 rounded-md text-xs font-medium ${
                                val === score
                                  ? "bg-accent text-ink-inverse"
                                  : "border border-line text-ink-muted"
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <label className="flex flex-col gap-2">
        <span className={sublabelClass}>Top 3 health concerns</span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.top_concerns}
          onChange={(e) => onChange({ ...value, top_concerns: e.target.value })}
        />
      </label>
    </section>
  );
}

export function normalizeSymptomsFromIntake(data: Partial<Symptoms> | undefined): Symptoms {
  const empty = createEmptySymptoms();
  if (!data) {
    return empty;
  }
  return {
    ...empty,
    ...data,
    msq_scores: data.msq_scores ?? createEmptyMsqScores(),
  };
}
