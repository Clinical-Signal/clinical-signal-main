"use client";

import {
  AboutYouSchema,
  createEmptyAboutYou,
  type AboutYou,
} from "@/lib/intake/schemas/step-one.schema";

import {
  IntroBanner,
  ScreenHeader,
  inputClass,
  labelClass,
  sublabelClass,
  useSectionBlurSave,
} from "./shared";

const US_STATES = [
  "",
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

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
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "about_you",
    value,
    schema: AboutYouSchema,
    onSynced: onIntakeDataSynced,
  });

  const patch = (partial: Partial<AboutYou>) => onChange({ ...value, ...partial });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      {showIntro ? <IntroBanner /> : null}
      <ScreenHeader
        title="About you"
        description="Basic demographics and emergency contact."
        saveStatus={saveStatus}
      />

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Full name</span>
        <input
          className={inputClass}
          value={value.full_name}
          autoComplete="name"
          onChange={(e) => patch({ full_name: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>Date of birth</span>
        <input
          className={inputClass}
          type="date"
          value={value.date_of_birth}
          autoComplete="bday"
          onChange={(e) => patch({ date_of_birth: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Sex assigned at birth</span>
          <select
            className={inputClass}
            value={value.sex_at_birth}
            onChange={(e) =>
              patch({ sex_at_birth: e.target.value as AboutYou["sex_at_birth"] })
            }
          >
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="intersex">Intersex</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Gender identity (if different from above)</span>
          <input
            className={inputClass}
            value={value.gender_identity}
            placeholder="Optional"
            onChange={(e) => patch({ gender_identity: e.target.value })}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Height (inches)</span>
          <input
            className={inputClass}
            type="number"
            min={0}
            value={value.height_inches ?? ""}
            onChange={(e) =>
              patch({
                height_inches: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Weight (lbs)</span>
          <input
            className={inputClass}
            type="number"
            min={0}
            value={value.weight_lbs ?? ""}
            onChange={(e) =>
              patch({ weight_lbs: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelClass}>State</span>
          <select
            className={inputClass}
            value={value.state}
            onChange={(e) => patch({ state: e.target.value })}
          >
            {US_STATES.map((state) => (
              <option key={state || "empty"} value={state}>
                {state || "—"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunken p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Emergency contact</h3>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Name</span>
            <input
              className={inputClass}
              value={value.emergency_contact_name}
              onChange={(e) => patch({ emergency_contact_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Relationship</span>
            <input
              className={inputClass}
              value={value.emergency_contact_relationship}
              onChange={(e) => patch({ emergency_contact_relationship: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>Phone</span>
            <input
              className={inputClass}
              type="tel"
              value={value.emergency_contact_phone}
              onChange={(e) => patch({ emergency_contact_phone: e.target.value })}
            />
          </label>
        </div>
      </div>
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
