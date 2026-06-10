"use client";

import {
  WearablesSchema,
  createEmptyWearables,
  type Wearables,
} from "@/lib/intake/schemas/step-one.schema";

import {
  ScreenHeader,
  inputClass,
  sublabelClass,
  useSectionBlurSave,
} from "./shared";

const DEVICE_OPTIONS = [
  "Oura Ring",
  "Apple Watch",
  "WHOOP",
  "Fitbit",
  "Garmin",
  "Continuous Glucose Monitor (CGM)",
  "Mira / Inito (fertility)",
  "Eight Sleep",
  "Other",
];

type WearablesScreenProps = {
  token: string;
  value: Wearables;
  onChange: (next: Wearables) => void;
  onIntakeDataSynced: (wearables: Wearables) => void;
};

export function WearablesScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: WearablesScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "wearables",
    value,
    schema: WearablesSchema,
    onSynced: onIntakeDataSynced,
  });

  const toggleDevice = (device: string) => {
    const next = value.devices.includes(device)
      ? value.devices.filter((entry) => entry !== device)
      : [...value.devices, device];
    const updated = { ...value, devices: next };
    onChange(updated);
  };

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Wearables & tracking"
        description="Devices you use to track health data."
        saveStatus={saveStatus}
      />

      <div>
        <span className={sublabelClass}>Which devices do you use? (check all that apply)</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEVICE_OPTIONS.map((device) => (
            <label
              key={device}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
            >
              <input
                type="checkbox"
                checked={value.devices.includes(device)}
                onChange={() => toggleDevice(device)}
              />
              {device}
            </label>
          ))}
        </div>
      </div>

      {value.devices.length > 0 ? (
        <>
          <label className="flex flex-col gap-2">
            <span className={sublabelClass}>How long have you been using these?</span>
            <input
              className={inputClass}
              value={value.usage_duration}
              onChange={(e) => onChange({ ...value, usage_duration: e.target.value })}
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className={sublabelClass}>
              Willing to share data exports with your practitioner?
            </legend>
            <div className="flex gap-4 text-sm text-ink">
              {(
                [
                  { v: "yes", label: "Yes" },
                  { v: "no", label: "No" },
                  { v: "maybe", label: "Maybe" },
                ] as const
              ).map(({ v, label }) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="willing_to_share"
                    checked={value.willing_to_share === v}
                    onChange={() => onChange({ ...value, willing_to_share: v })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <p className="text-sm text-ink-muted">No devices selected — this section is optional.</p>
      )}
    </section>
  );
}

export function normalizeWearablesFromIntake(data: Partial<Wearables> | undefined): Wearables {
  const empty = createEmptyWearables();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
