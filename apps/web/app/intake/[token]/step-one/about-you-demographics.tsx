"use client";

import type { AboutYou } from "@/lib/intake/schemas/step-one.schema";

import { US_STATES } from "./about-you-states";
import { inputClass, labelClass } from "./shared";

type AboutYouDemographicsProps = {
  value: AboutYou;
  onChange: (next: AboutYou) => void;
  fieldInputClass: (field: keyof AboutYou) => string;
  showError: (field: keyof AboutYou) => string | undefined;
  markTouched: (field: keyof AboutYou) => void;
};

export function AboutYouDemographics({
  value,
  onChange,
  fieldInputClass,
  showError,
  markTouched,
}: AboutYouDemographicsProps) {
  const patch = (partial: Partial<AboutYou>) => onChange({ ...value, ...partial });

  return (
    <>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Gender identity (if different from above)</span>
        <input
          className={inputClass}
          value={value.gender_identity}
          autoComplete="sex"
          onChange={(e) => patch({ gender_identity: e.target.value })}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className={labelClass}>Height (inches)</span>
          <input
            className={inputClass}
            type="number"
            min={0}
            max={120}
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
            max={1000}
            value={value.weight_lbs ?? ""}
            onChange={(e) =>
              patch({ weight_lbs: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className={labelClass}>State</span>
        <select
          className={fieldInputClass("state")}
          value={value.state}
          onBlur={() => markTouched("state")}
          onChange={(e) => patch({ state: e.target.value })}
        >
          {US_STATES.map((code) => (
            <option key={code || "empty"} value={code}>
              {code === "" ? "Select…" : code}
            </option>
          ))}
        </select>
        {showError("state") ? (
          <span className="text-xs text-warning">{showError("state")}</span>
        ) : null}
      </label>
    </>
  );
}
