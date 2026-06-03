"use client";

import {
  AnythingElseSchema,
  createEmptyAnythingElse,
  type AnythingElse,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  labelClass,
  textareaClass,
  useSectionBlurSave,
} from "./shared";

const REFERRAL_OPTIONS = [
  "Google search",
  "Instagram",
  "Facebook",
  "Podcast",
  "Friend or family",
  "Another practitioner",
  "Other",
];

type AnythingElseScreenProps = {
  token: string;
  value: AnythingElse;
  onChange: (next: AnythingElse) => void;
  onIntakeDataSynced: (anythingElse: AnythingElse) => void;
};

export function AnythingElseScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: AnythingElseScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "anything_else",
    value,
    schema: AnythingElseSchema,
    onSynced: onIntakeDataSynced,
  });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Anything else?"
        description="Last chance to share anything we have not covered."
        saveStatus={saveStatus}
      />

      <label className="flex flex-col gap-2">
        <span className={labelClass}>
          Is there anything else you want your practitioner to know?
        </span>
        <textarea
          className={textareaClass}
          rows={4}
          value={value.additional_info}
          onChange={(e) => onChange({ ...value, additional_info: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>How did you hear about us?</span>
        <select
          className={inputClass}
          value={value.referral_source}
          onChange={(e) => onChange({ ...value, referral_source: e.target.value })}
        >
          <option value="">—</option>
          {REFERRAL_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function normalizeAnythingElseFromIntake(
  data: Partial<AnythingElse> | undefined,
): AnythingElse {
  const empty = createEmptyAnythingElse();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
