"use client";

import { useEffect, useState } from "react";
import {
  useDebouncedSave,
  SectionShell,
  SelectField,
  TextArea,
  TextField,
  NumberField,
  SliderField,
} from "../shared";

export interface MetabolismDeepDiveData {
  weight_goal: "lose" | "gain" | "maintain" | "recomposition" | "";
  weight_history: string;
  weight_loss_attempts: string;
  weight_fluctuations: string;
  hunger_patterns: string;
  cravings: string;
  energy_crashes: string;
  blood_sugar_diagnosed: string;
  fasting_glucose_known: string;
  a1c_known: string;
  family_metabolic_history: string;
  meal_timing: string;
  snacking: string;
  eating_speed: "fast" | "moderate" | "slow" | "";
  body_composition_testing: string;
  motivation_for_weight_change: number | null;
}

const EMPTY: MetabolismDeepDiveData = {
  weight_goal: "",
  weight_history: "",
  weight_loss_attempts: "",
  weight_fluctuations: "",
  hunger_patterns: "",
  cravings: "",
  energy_crashes: "",
  blood_sugar_diagnosed: "",
  fasting_glucose_known: "",
  a1c_known: "",
  family_metabolic_history: "",
  meal_timing: "",
  snacking: "",
  eating_speed: "",
  body_composition_testing: "",
  motivation_for_weight_change: null,
};

interface Props {
  patientId: string;
  initial: MetabolismDeepDiveData | undefined;
  onDraftChange?: (v: MetabolismDeepDiveData) => void;
}

export function MetabolismDeepDiveSection({ patientId, initial, onDraftChange }: Props) {
  const [data, setData] = useState<MetabolismDeepDiveData>(initial ?? EMPTY);
  const status = useDebouncedSave(patientId, "metabolism_deep_dive" as any, data);
  useEffect(() => { onDraftChange?.(data); }, [data, onDraftChange]);

  function patch(p: Partial<MetabolismDeepDiveData>) {
    setData((d) => ({ ...d, ...p }));
  }

  return (
    <SectionShell
      title="Weight & metabolism deep dive"
      description="Weight resistance is often a downstream symptom of hormonal, gut, or metabolic imbalance. This section helps us understand the root cause rather than just the number on the scale."
      status={status}
    >
      <SelectField
        label="What's your weight-related goal?"
        value={data.weight_goal}
        onChange={(v) => patch({ weight_goal: v as MetabolismDeepDiveData["weight_goal"] })}
        options={[
          { value: "", label: "—" },
          { value: "lose", label: "Lose weight" },
          { value: "gain", label: "Gain weight" },
          { value: "maintain", label: "Maintain current weight" },
          { value: "recomposition", label: "Body recomposition (lose fat, gain muscle)" },
        ]}
      />

      <TextArea
        label="Describe your weight history"
        value={data.weight_history}
        onChange={(v) => patch({ weight_history: v })}
        rows={2}
        placeholder="Has your weight been stable? Gradual gain? Sudden changes? What life events corresponded?"
      />

      <TextArea
        label="What weight loss approaches have you tried?"
        value={data.weight_loss_attempts}
        onChange={(v) => patch({ weight_loss_attempts: v })}
        rows={2}
        placeholder="Diets, programs, medications (Ozempic, etc.), fasting protocols, etc."
      />

      <TextArea
        label="Do you experience weight fluctuations?"
        value={data.weight_fluctuations}
        onChange={(v) => patch({ weight_fluctuations: v })}
        rows={2}
        placeholder="Water retention, rapid gain/loss, cycle-related changes?"
      />

      <TextArea
        label="Describe your hunger patterns"
        value={data.hunger_patterns}
        onChange={(v) => patch({ hunger_patterns: v })}
        rows={2}
        placeholder="Always hungry? Rarely hungry? Hungry but no appetite? Specific times of day?"
      />

      <TextArea
        label="What cravings do you experience?"
        value={data.cravings}
        onChange={(v) => patch({ cravings: v })}
        rows={2}
        placeholder="Sugar, salt, carbs, chocolate, specific foods? When do they hit?"
      />

      <TextArea
        label="Do you experience energy crashes?"
        value={data.energy_crashes}
        onChange={(v) => patch({ energy_crashes: v })}
        rows={2}
        placeholder="After meals? Mid-afternoon? Morning? How severe?"
      />

      <TextArea
        label="Have you been diagnosed with any blood sugar or metabolic conditions?"
        value={data.blood_sugar_diagnosed}
        onChange={(v) => patch({ blood_sugar_diagnosed: v })}
        rows={2}
        placeholder="Pre-diabetes, insulin resistance, diabetes, metabolic syndrome, PCOS?"
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="Fasting glucose (if known)"
          value={data.fasting_glucose_known}
          onChange={(v) => patch({ fasting_glucose_known: v })}
          placeholder="e.g., 95 mg/dL"
        />
        <TextField
          label="HbA1c (if known)"
          value={data.a1c_known}
          onChange={(v) => patch({ a1c_known: v })}
          placeholder="e.g., 5.4%"
        />
      </div>

      <TextArea
        label="Family history of metabolic conditions?"
        value={data.family_metabolic_history}
        onChange={(v) => patch({ family_metabolic_history: v })}
        rows={2}
        placeholder="Diabetes, obesity, heart disease, metabolic syndrome?"
      />

      <TextArea
        label="Describe your typical meal timing"
        value={data.meal_timing}
        onChange={(v) => patch({ meal_timing: v })}
        rows={2}
        placeholder="When do you eat your first and last meal? Do you skip meals? Intermittent fasting?"
      />

      <SelectField
        label="How quickly do you eat?"
        value={data.eating_speed}
        onChange={(v) => patch({ eating_speed: v as MetabolismDeepDiveData["eating_speed"] })}
        options={[
          { value: "", label: "—" },
          { value: "fast", label: "Fast (done in 5-10 min)" },
          { value: "moderate", label: "Moderate (10-20 min)" },
          { value: "slow", label: "Slow (20+ min)" },
        ]}
      />

      <TextArea
        label="Have you done body composition testing? (DEXA, InBody, etc.)"
        value={data.body_composition_testing}
        onChange={(v) => patch({ body_composition_testing: v })}
        rows={2}
      />

      {data.weight_goal === "lose" && (
        <SliderField
          label="How motivated are you to make dietary/lifestyle changes for weight loss? (1-10)"
          value={data.motivation_for_weight_change}
          onChange={(v) => patch({ motivation_for_weight_change: v })}
        />
      )}
    </SectionShell>
  );
}
