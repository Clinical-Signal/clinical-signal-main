"use client";

import { useEffect, useState } from "react";
import {
  useDebouncedSave,
  SectionShell,
  SelectField,
  TextArea,
  TextField,
} from "../shared";

export interface SleepDeepDiveData {
  bedtime_routine: string;
  screen_time_before_bed: string;
  sleep_environment: string;
  wake_during_night: "never" | "once" | "2-3_times" | "frequently" | "";
  wake_time_pattern: string;
  dreams_nightmares: string;
  snoring_apnea: string;
  restless_legs: string;
  sleep_aids: string;
  energy_pattern_during_day: string;
  caffeine_after_noon: "yes" | "no" | "";
  nap_frequency: string;
}

const EMPTY: SleepDeepDiveData = {
  bedtime_routine: "",
  screen_time_before_bed: "",
  sleep_environment: "",
  wake_during_night: "",
  wake_time_pattern: "",
  dreams_nightmares: "",
  snoring_apnea: "",
  restless_legs: "",
  sleep_aids: "",
  energy_pattern_during_day: "",
  caffeine_after_noon: "",
  nap_frequency: "",
};

interface Props {
  patientId: string;
  initial: SleepDeepDiveData | undefined;
  onDraftChange?: (v: SleepDeepDiveData) => void;
}

export function SleepDeepDiveSection({ patientId, initial, onDraftChange }: Props) {
  const [data, setData] = useState<SleepDeepDiveData>(initial ?? EMPTY);
  const status = useDebouncedSave(patientId, "sleep_deep_dive" as any, data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<SleepDeepDiveData>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="Sleep deep dive"
      description="Your sleep patterns suggest this area needs attention. These details help us identify root causes — cortisol, blood sugar, nervous system, or environmental factors."
      status={status}
    >
      <SelectField
        label="How often do you wake during the night?"
        value={data.wake_during_night}
        onChange={(v) => patch({ wake_during_night: v as SleepDeepDiveData["wake_during_night"] })}
        options={[
          { value: "", label: "—" },
          { value: "never", label: "Never" },
          { value: "once", label: "Once" },
          { value: "2-3_times", label: "2–3 times" },
          { value: "frequently", label: "Frequently (4+)" },
        ]}
      />

      {(data.wake_during_night === "2-3_times" || data.wake_during_night === "frequently") && (
        <TextField
          label="What time do you typically wake? (e.g., 2-3 AM)"
          value={data.wake_time_pattern}
          onChange={(v) => patch({ wake_time_pattern: v })}
          placeholder="This helps identify if cortisol patterns are a factor"
        />
      )}

      <TextArea
        label="Describe your bedtime routine"
        value={data.bedtime_routine}
        onChange={(v) => patch({ bedtime_routine: v })}
        rows={2}
        placeholder="What do the last 1-2 hours before bed look like?"
      />

      <SelectField
        label="Do you use screens (phone, TV, laptop) within 1 hour of bed?"
        value={data.screen_time_before_bed}
        onChange={(v) => patch({ screen_time_before_bed: v })}
        options={[
          { value: "", label: "—" },
          { value: "never", label: "Never / rarely" },
          { value: "sometimes", label: "Sometimes" },
          { value: "always", label: "Almost always" },
        ]}
      />

      <TextArea
        label="Describe your sleep environment"
        value={data.sleep_environment}
        onChange={(v) => patch({ sleep_environment: v })}
        rows={2}
        placeholder="Dark room? Cool temperature? White noise? Partner? Pets?"
      />

      <TextArea
        label="Any snoring, gasping, or suspected sleep apnea?"
        value={data.snoring_apnea}
        onChange={(v) => patch({ snoring_apnea: v })}
        rows={2}
      />

      <TextArea
        label="Restless legs or leg cramps at night?"
        value={data.restless_legs}
        onChange={(v) => patch({ restless_legs: v })}
        rows={2}
        placeholder="This can indicate mineral imbalances (magnesium, iron)"
      />

      <TextArea
        label="Do you use any sleep aids? (melatonin, magnesium, Rx, cannabis, etc.)"
        value={data.sleep_aids}
        onChange={(v) => patch({ sleep_aids: v })}
        rows={2}
      />

      <TextArea
        label="How does your energy change throughout the day?"
        value={data.energy_pattern_during_day}
        onChange={(v) => patch({ energy_pattern_during_day: v })}
        rows={2}
        placeholder="Morning energy vs. afternoon crash? Second wind at night? Steady all day?"
      />

      <SelectField
        label="Do you consume caffeine after noon?"
        value={data.caffeine_after_noon}
        onChange={(v) => patch({ caffeine_after_noon: v as SleepDeepDiveData["caffeine_after_noon"] })}
        options={[
          { value: "", label: "—" },
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
      />

      <TextField
        label="How often do you nap?"
        value={data.nap_frequency}
        onChange={(v) => patch({ nap_frequency: v })}
        placeholder="Never / occasionally / daily — and for how long?"
      />
    </SectionShell>
  );
}
