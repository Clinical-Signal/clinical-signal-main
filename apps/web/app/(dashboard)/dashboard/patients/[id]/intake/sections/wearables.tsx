"use client";

import { useEffect, useState } from "react";
import type { IntakeWearablesSection } from "@/lib/intake-schema";

interface Props {
  patientId: string;
  initial: IntakeWearablesSection | undefined;
  onDraftChange?: (v: IntakeWearablesSection) => void;
  SectionShell: React.ComponentType<{
    title: string;
    description?: string;
    status: { saving: boolean; savedAt: string | null; error: string | null };
    children: React.ReactNode;
  }>;
  useDebouncedSave: (
    patientId: string,
    section: string,
    value: unknown,
  ) => { savedAt: string | null; saving: boolean; error: string | null };
}

const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:shadow-focus";
const labelClass = "text-xs font-medium uppercase tracking-wide text-ink-subtle";

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

const EMPTY: IntakeWearablesSection = {
  devices: [],
  usage_duration: "",
  willing_to_share: "",
};

export function WearablesSection({
  patientId,
  initial,
  onDraftChange,
  SectionShell,
  useDebouncedSave,
}: Props) {
  const [data, setData] = useState<IntakeWearablesSection>(
    initial?.devices !== undefined ? initial : EMPTY,
  );
  const status = useDebouncedSave(patientId, "wearables", data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function toggleDevice(device: string) {
    setData((d) => {
      const next = d.devices.includes(device)
        ? d.devices.filter((v) => v !== device)
        : [...d.devices, device];
      return { ...d, devices: next };
    });
  }

  return (
    <SectionShell
      title="Wearables & tracking devices"
      description="Help us understand what health data you're already collecting."
      status={status}
    >
      <div>
        <span className={labelClass}>Which devices do you use? (check all that apply)</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DEVICE_OPTIONS.map((opt) => (
            <label
              key={opt}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink transition-colors hover:bg-surface-sunken cursor-pointer"
            >
              <input
                type="checkbox"
                checked={data.devices.includes(opt)}
                onChange={() => toggleDevice(opt)}
                className="h-3.5 w-3.5"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>

      {data.devices.length > 0 && (
        <>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>How long have you been using these?</span>
            <input
              className={inputClass}
              value={data.usage_duration}
              onChange={(e) => setData((d) => ({ ...d, usage_duration: e.target.value }))}
              placeholder="e.g. Oura for 2 years, CGM for 3 months"
            />
          </label>

          <div>
            <span className={labelClass}>
              Willing to share data exports with your practitioner?
            </span>
            <div className="mt-1.5 flex gap-3">
              {(["yes", "no", "maybe"] as const).map((v) => (
                <label key={v} className="inline-flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="willing_to_share"
                    checked={data.willing_to_share === v}
                    onChange={() => setData((d) => ({ ...d, willing_to_share: v }))}
                    className="h-4 w-4"
                  />
                  {v === "yes" ? "Yes" : v === "no" ? "No" : "Maybe"}
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {data.devices.length === 0 && (
        <p className="text-sm text-ink-subtle">
          No worries if you don't use any devices — this section is optional.
        </p>
      )}
    </SectionShell>
  );
}
