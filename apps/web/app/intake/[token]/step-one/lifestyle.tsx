"use client";

import {
  LifestyleSchema,
  createEmptyLifestyle,
  type Lifestyle,
} from "@/lib/intake/schemas/step-one.schema";

import { LifestyleExerciseStressBlock } from "./lifestyle-exercise-stress";
import { LifestyleSleepNutritionBlock } from "./lifestyle-sleep-nutrition";
import { LifestyleWellnessBlock } from "./lifestyle-wellness";
import { ScreenHeader, useSectionBlurSave } from "./shared";

type LifestyleScreenProps = {
  token: string;
  value: Lifestyle;
  onChange: (next: Lifestyle) => void;
  onIntakeDataSynced: (lifestyle: Lifestyle) => void;
};

export function LifestyleScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: LifestyleScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "lifestyle",
    value,
    schema: LifestyleSchema,
    onSynced: onIntakeDataSynced,
  });

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Lifestyle"
        description="Sleep, nutrition, movement, stress, and wellness practices."
        saveStatus={saveStatus}
      />

      <LifestyleSleepNutritionBlock value={value} onChange={onChange} />
      <LifestyleExerciseStressBlock value={value} onChange={onChange} />
      <LifestyleWellnessBlock
        wellness={value.wellness_practices}
        onChange={(wellness_practices) => onChange({ ...value, wellness_practices })}
      />
    </section>
  );
}

export function normalizeLifestyleFromIntake(data: Partial<Lifestyle> | undefined): Lifestyle {
  const empty = createEmptyLifestyle();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
