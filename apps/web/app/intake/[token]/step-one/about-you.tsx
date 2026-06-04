"use client";

import { useMemo, useState } from "react";

import {
  AboutYouSchema,
  createEmptyAboutYou,
  type AboutYou,
} from "@/lib/intake/schemas/step-one.schema";

import { AboutYouDemographics } from "./about-you-demographics";
import { AboutYouEmergency } from "./about-you-emergency";
import { aboutYouFieldErrors } from "./about-you-field-errors";
import {
  IntroBanner,
  ScreenHeader,
  inputClass,
  labelClass,
  useSectionBlurSave,
} from "./shared";

const inputErrorClass = `${inputClass} border-warning`;

type AboutYouScreenProps = {
  token: string;
  value: AboutYou;
  onChange: (next: AboutYou) => void;
  onIntakeDataSynced: (aboutYou: AboutYou) => void;
  showIntro?: boolean;
};

export function AboutYouScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
  showIntro = false,
}: AboutYouScreenProps) {
  const [touched, setTouched] = useState<Partial<Record<keyof AboutYou, boolean>>>({});
  const fieldErrors = useMemo(() => aboutYouFieldErrors(value), [value]);

  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "about_you",
    value,
    schema: AboutYouSchema,
    onSynced: onIntakeDataSynced,
  });

  const patch = (partial: Partial<AboutYou>) => onChange({ ...value, ...partial });

  const markTouched = (field: keyof AboutYou) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const showError = (field: keyof AboutYou) =>
    touched[field] ? fieldErrors[field] : undefined;

  const fieldInputClass = (field: keyof AboutYou) =>
    showError(field) ? inputErrorClass : inputClass;

  return (
    <section className="flex min-w-0 flex-col gap-5" onBlur={() => void saveOnBlur()}>
      {showIntro ? <IntroBanner /> : null}
      <ScreenHeader
        title="About you"
        description="How we should address you and basic demographics."
        saveStatus={saveStatus}
      />

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Full name</span>
        <input
          className={fieldInputClass("full_name")}
          value={value.full_name}
          autoComplete="name"
          aria-invalid={Boolean(showError("full_name"))}
          aria-describedby={showError("full_name") ? "about-you-name-error" : undefined}
          onBlur={() => markTouched("full_name")}
          onChange={(e) => patch({ full_name: e.target.value })}
        />
        {showError("full_name") ? (
          <span id="about-you-name-error" className="text-xs text-warning">
            {showError("full_name")}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Date of birth</span>
        <input
          className={fieldInputClass("date_of_birth")}
          type="date"
          value={value.date_of_birth}
          autoComplete="bday"
          aria-invalid={Boolean(showError("date_of_birth"))}
          aria-describedby={
            showError("date_of_birth") ? "about-you-dob-error" : undefined
          }
          onBlur={() => markTouched("date_of_birth")}
          onChange={(e) => patch({ date_of_birth: e.target.value })}
        />
        {showError("date_of_birth") ? (
          <span id="about-you-dob-error" className="text-xs text-warning">
            {showError("date_of_birth")}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Sex assigned at birth</span>
        <select
          className={inputClass}
          value={value.sex_at_birth}
          onChange={(e) =>
            patch({ sex_at_birth: e.target.value as AboutYou["sex_at_birth"] })
          }
        >
          <option value="">Select…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="intersex">Intersex</option>
        </select>
      </label>

      <AboutYouDemographics
        value={value}
        onChange={onChange}
        fieldInputClass={fieldInputClass}
        showError={showError}
        markTouched={markTouched}
      />

      <AboutYouEmergency value={value} onChange={onChange} />
    </section>
  );
}

export function normalizeAboutYouFromIntake(data: Partial<AboutYou> | undefined): AboutYou {
  const empty = createEmptyAboutYou();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
