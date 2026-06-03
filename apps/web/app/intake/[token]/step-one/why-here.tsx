"use client";

import {
  WhyHereSchema,
  createEmptyWhyHere,
  type WhyHere,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  labelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

type WhyHereScreenProps = {
  token: string;
  value: WhyHere;
  onChange: (next: WhyHere) => void;
  onIntakeDataSynced: (whyHere: WhyHere) => void;
};

export function WhyHereScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: WhyHereScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "why_here",
    value,
    schema: WhyHereSchema,
    onSynced: onIntakeDataSynced,
  });

  const patch = (partial: Partial<WhyHere>) => onChange({ ...value, ...partial });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Why you're here"
        description="Goals, motivation, and what has been in the way."
        saveStatus={saveStatus}
      />

      <label className="flex flex-col gap-2">
        <span className={labelClass}>In your own words, what brings you here?</span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.what_brings_you}
          onChange={(e) => patch({ what_brings_you: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          What are your top 3 health goals for the next 3–6 months?
        </span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.top_three_goals}
          onChange={(e) => patch({ top_three_goals: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          If we were having this conversation 6 months from now and things went really
          well, what would be different in your life?
        </span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.six_month_vision}
          onChange={(e) => patch({ six_month_vision: e.target.value })}
        />
      </label>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>
            On a scale of 1–10, how would you rate your overall health today?{" "}
            <span className="text-ink">{value.overall_health_rating ?? "—"}</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={value.overall_health_rating ?? 5}
            onChange={(e) => patch({ overall_health_rating: Number(e.target.value) })}
          />
        </label>
        {value.overall_health_rating !== null ? (
          <label className="mt-4 flex flex-col gap-2">
            <span className={labelClass}>
              Why did you rate it at {value.overall_health_rating}?
            </span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.health_rating_why}
              onChange={(e) => patch({ health_rating_why: e.target.value })}
            />
          </label>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>
            How motivated are you to make changes right now?{" "}
            <span className="text-ink">{value.motivation_level ?? "—"}</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={value.motivation_level ?? 5}
            onChange={(e) => patch({ motivation_level: Number(e.target.value) })}
          />
        </label>
        {value.motivation_level !== null && value.motivation_level < 9 ? (
          <label className="mt-4 flex flex-col gap-2">
            <span className={labelClass}>What would make that number higher for you?</span>
            <textarea
              className={textareaClass}
              rows={2}
              value={value.motivation_blocker}
              onChange={(e) => patch({ motivation_blocker: e.target.value })}
            />
          </label>
        ) : null}
      </div>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          What concerns you the most about continuing as you are right now?
        </span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.cost_of_not_changing}
          onChange={(e) => patch({ cost_of_not_changing: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          Who or what in your life is being impacted by your health?
        </span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.health_impact_on_life}
          onChange={(e) => patch({ health_impact_on_life: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>What have you tried so far that hasn&apos;t worked?</span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.what_hasnt_worked}
          onChange={(e) => patch({ what_hasnt_worked: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          What&apos;s been the biggest roadblock in seeking help or guidance?
        </span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.biggest_roadblock}
          onChange={(e) => patch({ biggest_roadblock: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          What realistically feels manageable for you right now in terms of making changes?
        </span>
        <textarea
          className={textareaClass}
          rows={2}
          value={value.capacity_for_change}
          onChange={(e) => patch({ capacity_for_change: e.target.value })}
        />
      </label>
    </section>
  );
}

export function normalizeWhyHereFromIntake(data: Partial<WhyHere> | undefined): WhyHere {
  const empty = createEmptyWhyHere();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
