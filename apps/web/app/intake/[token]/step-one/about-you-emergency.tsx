"use client";

import type { AboutYou } from "@/lib/intake/schemas/step-one.schema";

import { inputClass, labelClass, sublabelClass } from "./shared";

type AboutYouEmergencyProps = {
  value: AboutYou;
  onChange: (next: AboutYou) => void;
};

export function AboutYouEmergency({ value, onChange }: AboutYouEmergencyProps) {
  const patch = (partial: Partial<AboutYou>) => onChange({ ...value, ...partial });

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-line bg-surface-sunken p-4">
      <legend className={sublabelClass}>Emergency contact</legend>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Name</span>
        <input
          className={inputClass}
          value={value.emergency_contact_name}
          autoComplete="name"
          onChange={(e) => patch({ emergency_contact_name: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Relationship</span>
        <input
          className={inputClass}
          value={value.emergency_contact_relationship}
          onChange={(e) => patch({ emergency_contact_relationship: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Phone</span>
        <input
          className={inputClass}
          type="tel"
          value={value.emergency_contact_phone}
          autoComplete="tel"
          onChange={(e) => patch({ emergency_contact_phone: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
