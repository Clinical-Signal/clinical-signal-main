"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  IntakeSymptomsSection,
  MsqCategory,
  MsqScore,
} from "@/lib/intake-schema";
import {
  MSQ_CATEGORIES,
  MSQ_SYMPTOMS,
  msqCategoryTotal,
  msqGrandTotal,
  msqSeverityLabel,
} from "@/lib/intake-schema";
import { useDebouncedSave, SectionShell, inputClass, labelClass } from "../shared";

interface Props {
  patientId: string;
  initial: IntakeSymptomsSection | undefined;
  onDraftChange?: (v: IntakeSymptomsSection) => void;
}

const CATEGORY_LABELS: Record<MsqCategory, string> = {
  head: "Head",
  eyes: "Eyes",
  ears: "Ears",
  nose: "Nose",
  mouth_throat: "Mouth & Throat",
  skin: "Skin",
  heart: "Heart",
  lungs: "Lungs",
  digestive: "Digestive Tract",
  joints_muscles: "Joints & Muscles",
  weight: "Weight",
  energy_activity: "Energy & Activity",
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

const SEVERITY_COLORS: Record<string, string> = {
  optimal: "text-emerald-600",
  mild: "text-yellow-600",
  moderate: "text-orange-600",
  severe: "text-red-600",
};

const SEVERITY_BG: Record<string, string> = {
  optimal: "bg-emerald-50 border-emerald-200",
  mild: "bg-yellow-50 border-yellow-200",
  moderate: "bg-orange-50 border-orange-200",
  severe: "bg-red-50 border-red-200",
};

function initScores(): Partial<Record<MsqCategory, Record<string, MsqScore>>> {
  const out: Partial<Record<MsqCategory, Record<string, MsqScore>>> = {};
  for (const cat of MSQ_CATEGORIES) {
    out[cat] = {};
    for (const symptom of MSQ_SYMPTOMS[cat]) {
      out[cat]![symptom] = 0;
    }
  }
  return out;
}

export function MsqSymptomsSection({
  patientId,
  initial,
  onDraftChange,
}: Props) {
  const [data, setData] = useState<IntakeSymptomsSection>(() => ({
    symptoms: initial?.symptoms ?? [],
    top_concerns: initial?.top_concerns ?? "",
    msq_scores: initial?.msq_scores ?? initScores(),
    msq_trend: initial?.msq_trend ?? {},
  }));

  const status = useDebouncedSave(patientId, "symptoms", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  const grandTotal = useMemo(
    () => msqGrandTotal(data.msq_scores),
    [data.msq_scores],
  );
  const severityLevel = msqSeverityLabel(grandTotal);

  function setScore(cat: MsqCategory, symptom: string, score: MsqScore) {
    setData((d) => ({
      ...d,
      msq_scores: {
        ...d.msq_scores,
        [cat]: {
          ...(d.msq_scores?.[cat] ?? {}),
          [symptom]: score,
        },
      },
    }));
  }

  // Track which categories are expanded
  const [expanded, setExpanded] = useState<Set<MsqCategory>>(new Set());
  function toggleCategory(cat: MsqCategory) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <SectionShell
      title="Current symptoms"
      description="Rate each symptom based on the past 30 days. 0 = never, 4 = frequent and severe."
      status={status}
    >
      {/* Grand total summary */}
      <div className={`rounded-lg border p-4 ${SEVERITY_BG[severityLevel]}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-ink">MSQ Score: </span>
            <span className={`text-lg font-bold ${SEVERITY_COLORS[severityLevel]}`}>
              {grandTotal}
            </span>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${SEVERITY_COLORS[severityLevel]}`}>
            {severityLevel === "optimal" && "Optimal (< 10)"}
            {severityLevel === "mild" && "Mild toxicity (10-50)"}
            {severityLevel === "moderate" && "Moderate toxicity (50-100)"}
            {severityLevel === "severe" && "Severe toxicity (> 100)"}
          </span>
        </div>
      </div>

      {/* Category accordions */}
      <div className="flex flex-col gap-2">
        {MSQ_CATEGORIES.map((cat) => {
          const catTotal = msqCategoryTotal(data.msq_scores?.[cat]);
          const isOpen = expanded.has(cat);
          return (
            <div key={cat} className="rounded-lg border border-line bg-surface">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-sunken/50"
              >
                <span className="text-sm font-medium text-ink">
                  {CATEGORY_LABELS[cat]}
                  <span className="ml-2 text-xs text-ink-subtle">
                    ({MSQ_SYMPTOMS[cat].length} symptoms)
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${catTotal > 0 ? "text-accent" : "text-ink-subtle"}`}>
                    {catTotal}
                  </span>
                  <span className="text-ink-subtle">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 py-3">
                  <div className="mb-2 grid grid-cols-[1fr,auto] gap-x-4 gap-y-0">
                    <span className="text-xs font-medium text-ink-subtle">Symptom</span>
                    <span className="text-xs font-medium text-ink-subtle">Score (0-4)</span>
                  </div>
                  {MSQ_SYMPTOMS[cat].map((symptom) => {
                    const val = data.msq_scores?.[cat]?.[symptom] ?? 0;
                    return (
                      <div
                        key={symptom}
                        className="grid grid-cols-[1fr,auto] items-center gap-x-4 border-t border-line/50 py-2"
                      >
                        <span className="text-sm text-ink">{symptom}</span>
                        <div className="flex gap-1">
                          {([0, 1, 2, 3, 4] as MsqScore[]).map((score) => (
                            <button
                              key={score}
                              type="button"
                              title={SCORE_LABELS[score]}
                              onClick={() => setScore(cat, symptom, score)}
                              className={`h-8 w-8 rounded-md text-xs font-medium transition-colors ${
                                val === score
                                  ? score === 0
                                    ? "bg-surface-sunken text-ink-subtle border border-line-strong"
                                    : "bg-accent text-ink-inverse"
                                  : "border border-line text-ink-subtle hover:bg-surface-sunken"
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
              )}
            </div>
          );
        })}
      </div>

      {/* Top concerns (preserved from v1) */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Top 3 health concerns
        </span>
        <textarea
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus"
          value={data.top_concerns}
          rows={3}
          placeholder="What matters most to this patient right now?"
          onChange={(e) => setData((d) => ({ ...d, top_concerns: e.target.value }))}
        />
      </label>

      {/* Score legend */}
      <div className="rounded-lg border border-line bg-surface-sunken/40 px-4 py-3">
        <p className="mb-1 text-xs font-semibold text-ink-subtle">Scoring guide</p>
        <div className="grid grid-cols-1 gap-1 text-xs text-ink-subtle sm:grid-cols-5">
          {([0, 1, 2, 3, 4] as MsqScore[]).map((s) => (
            <span key={s}>
              <span className="font-semibold text-ink">{s}</span> = {SCORE_LABELS[s]}
            </span>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
