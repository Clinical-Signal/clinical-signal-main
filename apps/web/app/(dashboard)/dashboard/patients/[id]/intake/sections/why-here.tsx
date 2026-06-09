"use client";

import { useEffect, useState } from "react";
import type { IntakeWhyHereSection } from "@/lib/intake-schema";
import { useDebouncedSave, SectionShell, inputClass, labelClass } from "../shared";

// Reuse shared form atoms from the parent form via props
interface Props {
  patientId: string;
  initial: IntakeWhyHereSection | undefined;
  onDraftChange?: (v: IntakeWhyHereSection) => void;
}


const EMPTY: IntakeWhyHereSection = {
  what_brings_you: "",
  top_three_goals: "",
  six_month_vision: "",
  overall_health_rating: null,
  health_rating_why: "",
  motivation_level: null,
  motivation_blocker: "",
  cost_of_not_changing: "",
  health_impact_on_life: "",
  what_hasnt_worked: "",
  biggest_roadblock: "",
  capacity_for_change: "",
};

export function WhyHereSection({
  patientId,
  initial,
  onDraftChange,
}: Props) {
  const [data, setData] = useState<IntakeWhyHereSection>(
    initial?.what_brings_you !== undefined ? initial : EMPTY,
  );
  const status = useDebouncedSave(patientId, "why_here", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<IntakeWhyHereSection>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="Why you're here"
      description="Help your practitioner understand your goals, motivation, and what's been holding you back."
      status={status}
    >
      {/* Core questions */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>In your own words, what brings you here?</span>
        <textarea
          className={inputClass}
          value={data.what_brings_you}
          rows={3}
          placeholder="What's going on with your health that made you seek help?"
          onChange={(e) => patch({ what_brings_you: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>What are your top 3 health goals for the next 3-6 months?</span>
        <textarea
          className={inputClass}
          value={data.top_three_goals}
          rows={3}
          placeholder="Be as specific as you can — what would you like to be different?"
          onChange={(e) => patch({ top_three_goals: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>
          If we were having this conversation 6 months from now and things went really well, what would be different in your life?
        </span>
        <textarea
          className={inputClass}
          value={data.six_month_vision}
          rows={3}
          placeholder="Paint the picture — how would your day-to-day be different?"
          onChange={(e) => patch({ six_month_vision: e.target.value })}
        />
      </label>

      {/* Health rating with dynamic follow-up */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            On a scale of 1-10, how would you rate your overall health today?{" "}
            <span className="ml-2 text-ink">{data.overall_health_rating ?? "—"}</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={data.overall_health_rating ?? 5}
            onChange={(e) => patch({ overall_health_rating: Number(e.target.value) })}
          />
        </label>
        {data.overall_health_rating !== null && (
          <label className="mt-3 flex flex-col gap-1">
            <span className={labelClass}>Why did you rate it at {data.overall_health_rating}?</span>
            <textarea
              className={inputClass}
              value={data.health_rating_why}
              rows={2}
              placeholder="What made you pick that number instead of higher or lower?"
              onChange={(e) => patch({ health_rating_why: e.target.value })}
            />
          </label>
        )}
      </div>

      {/* Motivation with dynamic follow-up */}
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            How motivated are you to make changes right now?{" "}
            <span className="ml-2 text-ink">{data.motivation_level ?? "—"}</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={data.motivation_level ?? 5}
            onChange={(e) => patch({ motivation_level: Number(e.target.value) })}
          />
        </label>
        {data.motivation_level !== null && data.motivation_level < 9 && (
          <label className="mt-3 flex flex-col gap-1">
            <span className={labelClass}>What would make that number higher for you?</span>
            <textarea
              className={inputClass}
              value={data.motivation_blocker}
              rows={2}
              placeholder="What's in the way of being fully committed?"
              onChange={(e) => patch({ motivation_blocker: e.target.value })}
            />
          </label>
        )}
      </div>

      {/* Deeper behavioral questions */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>What concerns you the most about continuing as you are right now?</span>
        <textarea
          className={inputClass}
          value={data.cost_of_not_changing}
          rows={2}
          placeholder="What happens if nothing changes?"
          onChange={(e) => patch({ cost_of_not_changing: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Who or what in your life is being impacted by your health?</span>
        <textarea
          className={inputClass}
          value={data.health_impact_on_life}
          rows={2}
          placeholder="Family, work, relationships, hobbies…"
          onChange={(e) => patch({ health_impact_on_life: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>What have you tried so far that hasn't worked?</span>
        <textarea
          className={inputClass}
          value={data.what_hasnt_worked}
          rows={2}
          placeholder="Diets, supplements, doctors, programs, etc."
          onChange={(e) => patch({ what_hasnt_worked: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>What's been the biggest roadblock in seeking help or guidance?</span>
        <textarea
          className={inputClass}
          value={data.biggest_roadblock}
          rows={2}
          placeholder="Cost, time, trust, overwhelm, not knowing where to start…"
          onChange={(e) => patch({ biggest_roadblock: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>What realistically feels manageable for you right now in terms of making changes?</span>
        <textarea
          className={inputClass}
          value={data.capacity_for_change}
          rows={2}
          placeholder="Small steps? Ready for a full overhaul? Somewhere in between?"
          onChange={(e) => patch({ capacity_for_change: e.target.value })}
        />
      </label>
    </SectionShell>
  );
}
