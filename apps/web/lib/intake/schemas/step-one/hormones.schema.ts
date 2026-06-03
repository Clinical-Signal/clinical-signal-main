import { z } from "zod";

export const CycleRegularSchema = z.enum([
  "regular",
  "irregular",
  "no_period",
  "na",
  "",
]);
export const MenopauseStatusSchema = z.enum(["pre", "peri", "post", "na", ""]);

export const HormonesSchema = z.object({
  cycle_regular: CycleRegularSchema.default(""),
  cycle_length_days: z.number().min(0).max(100).nullable().default(null),
  period_length_days: z.number().min(0).max(30).nullable().default(null),
  last_period_date: z.string().max(32).default(""),
  cycle_tracking: z.string().max(500).default(""),
  pms_symptoms: z.array(z.string().max(80)).default([]),
  menopause_status: MenopauseStatusSchema.default(""),
  birth_control: z.string().max(500).default(""),
  hrt_history: z.string().max(500).default(""),
  previous_hormone_testing: z.string().max(2000).default(""),
  pcos_endo_fibroids: z.array(z.string().max(80)).default([]),
  thyroid_diagnosis: z.string().max(500).default(""),
  thyroid_symptoms: z.array(z.string().max(80)).default([]),
  blood_sugar_issues: z.string().max(2000).default(""),
  metabolism_concerns: z.string().max(2000).default(""),
});

export type Hormones = z.infer<typeof HormonesSchema>;

export function createEmptyHormones(): Hormones {
  return {
    cycle_regular: "",
    cycle_length_days: null,
    period_length_days: null,
    last_period_date: "",
    cycle_tracking: "",
    pms_symptoms: [],
    menopause_status: "",
    birth_control: "",
    hrt_history: "",
    previous_hormone_testing: "",
    pcos_endo_fibroids: [],
    thyroid_diagnosis: "",
    thyroid_symptoms: [],
    blood_sugar_issues: "",
    metabolism_concerns: "",
  };
}

export function hormonesTriggerSignal(hormones: Hormones): boolean {
  return (
    hormones.cycle_regular === "irregular" ||
    hormones.cycle_regular === "no_period" ||
    hormones.pms_symptoms.length > 0 ||
    hormones.thyroid_symptoms.length > 0 ||
    hormones.pcos_endo_fibroids.length > 0 ||
    hormones.menopause_status === "peri" ||
    hormones.menopause_status === "post" ||
    hormones.blood_sugar_issues.trim().length > 0 ||
    hormones.metabolism_concerns.trim().length > 0
  );
}
