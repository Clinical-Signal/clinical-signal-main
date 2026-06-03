"use client";

import {
  PreviousLabsSchema,
  createEmptyPreviousLabs,
  type PreviousLabs,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  labelClass,
  sublabelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

type PreviousLabsScreenProps = {
  token: string;
  value: PreviousLabs;
  onChange: (next: PreviousLabs) => void;
  onIntakeDataSynced: (previousLabs: PreviousLabs) => void;
};

export function PreviousLabsScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: PreviousLabsScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "previous_labs",
    value,
    schema: PreviousLabsSchema,
    onSynced: onIntakeDataSynced,
  });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Previous labs"
        description="Prior lab work you remember — PDF uploads happen separately."
        saveStatus={saveStatus}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className={sublabelClass}>Do you have previous lab results?</legend>
        <div className="flex gap-4 text-sm text-ink">
          {(
            [
              { v: true, label: "Yes" },
              { v: false, label: "No" },
            ] as const
          ).map(({ v, label }) => (
            <label key={label} className="flex items-center gap-2">
              <input
                type="radio"
                name="has_previous_labs"
                checked={value.has_previous_labs === v}
                onChange={() => onChange({ ...value, has_previous_labs: v })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Any results you remember</span>
        <textarea
          className={textareaClass}
          rows={3}
          value={value.remembered_results}
          onChange={(e) => onChange({ ...value, remembered_results: e.target.value })}
        />
      </label>
    </section>
  );
}

export function normalizePreviousLabsFromIntake(
  data: Partial<PreviousLabs> | undefined,
): PreviousLabs {
  const empty = createEmptyPreviousLabs();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
