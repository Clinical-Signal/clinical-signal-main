"use client";

import {
  HormonesSchema,
  createEmptyHormones,
  type Hormones,
} from "@/lib/intake/schemas/step-one.schema";

import { HormonesHistoryThyroidBlock } from "./hormones-history-thyroid";
import { HormonesMenstrualBlock } from "./hormones-menstrual";
import { ScreenHeader, useSectionBlurSave } from "./shared";

type HormonesScreenProps = {
  token: string;
  value: Hormones;
  onChange: (next: Hormones) => void;
  onIntakeDataSynced: (hormones: Hormones) => void;
};

export function HormonesScreen({
  token,
  value,
  onChange,
  onIntakeDataSynced,
}: HormonesScreenProps) {
  const { saveStatus, saveOnBlur } = useSectionBlurSave({
    token,
    section: "hormones",
    value,
    schema: HormonesSchema,
    onSynced: onIntakeDataSynced,
  });

  const patch = (partial: Partial<Hormones>) => onChange({ ...value, ...partial });

  const toggleMulti = (
    field: "pms_symptoms" | "thyroid_symptoms" | "pcos_endo_fibroids",
    option: string,
  ) => {
    const current = value[field];
    patch({
      [field]: current.includes(option)
        ? current.filter((entry) => entry !== option)
        : [...current, option],
    });
  };

  return (
    <section className="flex flex-col gap-5" onBlur={() => void saveOnBlur()}>
      <ScreenHeader
        title="Hormones & cycle"
        description="Required for all patients — your cycle is a vital sign."
        saveStatus={saveStatus}
      />

      <HormonesMenstrualBlock value={value} onChange={onChange} toggleMulti={toggleMulti} />
      <HormonesHistoryThyroidBlock
        value={value}
        onChange={onChange}
        toggleMulti={toggleMulti}
      />
    </section>
  );
}

export function normalizeHormonesFromIntake(data: Partial<Hormones> | undefined): Hormones {
  const empty = createEmptyHormones();
  if (!data) {
    return empty;
  }
  return { ...empty, ...data };
}
