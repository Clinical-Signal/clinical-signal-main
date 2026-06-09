"use client";

import { useEffect, useState } from "react";
import {
  useDebouncedSave,
  SectionShell,
  SelectField,
  TextArea,
  SliderField,
} from "../shared";

export interface StressDeepDiveData {
  stress_type: string;
  stress_duration: string;
  physical_stress_symptoms: string;
  anxiety_frequency: "rarely" | "weekly" | "daily" | "constant" | "";
  anxiety_triggers: string;
  panic_attacks: "never" | "past" | "current" | "";
  trauma_history: string;
  coping_mechanisms: string;
  support_system: string;
  therapy_counseling: string;
  nervous_system_signs: string;
  emotional_eating: string;
  overwhelm_capacity: number | null;
}

const EMPTY: StressDeepDiveData = {
  stress_type: "",
  stress_duration: "",
  physical_stress_symptoms: "",
  anxiety_frequency: "",
  anxiety_triggers: "",
  panic_attacks: "",
  trauma_history: "",
  coping_mechanisms: "",
  support_system: "",
  therapy_counseling: "",
  nervous_system_signs: "",
  emotional_eating: "",
  overwhelm_capacity: null,
};

interface Props {
  patientId: string;
  initial: StressDeepDiveData | undefined;
  onDraftChange?: (v: StressDeepDiveData) => void;
}

export function StressDeepDiveSection({ patientId, initial, onDraftChange }: Props) {
  const [data, setData] = useState<StressDeepDiveData>(initial ?? EMPTY);
  const status = useDebouncedSave(patientId, "stress_deep_dive" as any, data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<StressDeepDiveData>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="Stress & nervous system deep dive"
      description="High stress directly impacts cortisol, gut health, hormones, sleep, and immune function. Understanding your stress patterns helps us address root causes."
      status={status}
    >
      <TextArea
        label="What type of stress are you experiencing? (work, relationships, financial, health, caregiving, etc.)"
        value={data.stress_type}
        onChange={(v) => patch({ stress_type: v })}
        rows={2}
      />

      <TextArea
        label="How long have you been under significant stress?"
        value={data.stress_duration}
        onChange={(v) => patch({ stress_duration: v })}
        rows={2}
        placeholder="Months? Years? Has it been getting worse?"
      />

      <TextArea
        label="Do you experience physical symptoms of stress? (tension, jaw clenching, chest tightness, stomach issues, headaches)"
        value={data.physical_stress_symptoms}
        onChange={(v) => patch({ physical_stress_symptoms: v })}
        rows={2}
      />

      <SelectField
        label="How often do you experience anxiety?"
        value={data.anxiety_frequency}
        onChange={(v) => patch({ anxiety_frequency: v as StressDeepDiveData["anxiety_frequency"] })}
        options={[
          { value: "", label: "—" },
          { value: "rarely", label: "Rarely" },
          { value: "weekly", label: "A few times a week" },
          { value: "daily", label: "Daily" },
          { value: "constant", label: "Nearly constant" },
        ]}
      />

      {data.anxiety_frequency && data.anxiety_frequency !== "rarely" && (
        <TextArea
          label="What tends to trigger your anxiety?"
          value={data.anxiety_triggers}
          onChange={(v) => patch({ anxiety_triggers: v })}
          rows={2}
        />
      )}

      <SelectField
        label="Have you experienced panic attacks?"
        value={data.panic_attacks}
        onChange={(v) => patch({ panic_attacks: v as StressDeepDiveData["panic_attacks"] })}
        options={[
          { value: "", label: "—" },
          { value: "never", label: "Never" },
          { value: "past", label: "In the past" },
          { value: "current", label: "Currently experiencing" },
        ]}
      />

      <TextArea
        label="Any history of significant emotional trauma? (only share what feels comfortable)"
        value={data.trauma_history}
        onChange={(v) => patch({ trauma_history: v })}
        rows={2}
        placeholder="This is relevant because unresolved trauma activates the nervous system and impacts healing"
      />

      <TextArea
        label="What do you currently do to manage stress?"
        value={data.coping_mechanisms}
        onChange={(v) => patch({ coping_mechanisms: v })}
        rows={2}
        placeholder="Exercise, meditation, therapy, social time, substances, etc."
      />

      <TextArea
        label="Do you feel you have a solid support system?"
        value={data.support_system}
        onChange={(v) => patch({ support_system: v })}
        rows={2}
      />

      <TextArea
        label="Are you currently in therapy or counseling?"
        value={data.therapy_counseling}
        onChange={(v) => patch({ therapy_counseling: v })}
        rows={2}
      />

      <TextArea
        label="Do you notice signs of nervous system dysregulation? (startle easily, feel 'wired but tired', difficulty relaxing, sensory overwhelm)"
        value={data.nervous_system_signs}
        onChange={(v) => patch({ nervous_system_signs: v })}
        rows={2}
      />

      <TextArea
        label="Do you eat differently when stressed or emotional?"
        value={data.emotional_eating}
        onChange={(v) => patch({ emotional_eating: v })}
        rows={2}
      />

      <SliderField
        label="On a scale of 1-10, how overwhelmed do you feel most days?"
        value={data.overwhelm_capacity}
        onChange={(v) => patch({ overwhelm_capacity: v })}
      />
    </SectionShell>
  );
}
