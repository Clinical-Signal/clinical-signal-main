import { z } from "zod";

export const SleepQualitySchema = z.enum(["poor", "fair", "good", "excellent", ""]);
export const WakeRestedSchema = z.enum(["never", "sometimes", "usually", "always", ""]);
export const DietTypeSchema = z.enum([
  "standard",
  "paleo",
  "keto",
  "carnivore",
  "vegan",
  "vegetarian",
  "mediterranean",
  "none",
  "other",
  "",
]);
export const ExerciseIntensitySchema = z.enum(["low", "moderate", "high", ""]);

export const WellnessPracticesSchema = z.object({
  sauna: z.boolean().nullable().default(null),
  sauna_details: z.string().max(500).default(""),
  cold_exposure: z.boolean().nullable().default(null),
  cold_exposure_details: z.string().max(500).default(""),
  meditation_breathwork: z.boolean().nullable().default(null),
  meditation_details: z.string().max(500).default(""),
  journaling: z.boolean().nullable().default(null),
  other: z.string().max(1000).default(""),
});

export const LifestyleSchema = z.object({
  sleep: z.object({
    average_hours: z.number().min(0).max(24).nullable().default(null),
    quality: SleepQualitySchema.default(""),
    wake_feeling_rested: WakeRestedSchema.default(""),
    issues: z.string().max(2000).default(""),
  }),
  nutrition: z.object({
    diet_type: DietTypeSchema.default(""),
    water_oz_per_day: z.number().min(0).nullable().default(null),
    restrictions: z.string().max(2000).default(""),
    sensitivities: z.string().max(2000).default(""),
    food_relationship: z.string().max(2000).default(""),
  }),
  exercise: z.object({
    type: z.string().max(200).default(""),
    frequency_per_week: z.number().min(0).max(21).nullable().default(null),
    intensity: ExerciseIntensitySchema.default(""),
  }),
  stress: z.object({
    level: z.number().int().min(1).max(10).nullable().default(null),
    sources: z.string().max(2000).default(""),
    management: z.string().max(2000).default(""),
  }),
  wellness_practices: WellnessPracticesSchema,
});

export type Lifestyle = z.infer<typeof LifestyleSchema>;

export function createEmptyLifestyle(): Lifestyle {
  return {
    sleep: {
      average_hours: null,
      quality: "",
      wake_feeling_rested: "",
      issues: "",
    },
    nutrition: {
      diet_type: "",
      water_oz_per_day: null,
      restrictions: "",
      sensitivities: "",
      food_relationship: "",
    },
    exercise: { type: "", frequency_per_week: null, intensity: "" },
    stress: { level: null, sources: "", management: "" },
    wellness_practices: {
      sauna: null,
      sauna_details: "",
      cold_exposure: null,
      cold_exposure_details: "",
      meditation_breathwork: null,
      meditation_details: "",
      journaling: null,
      other: "",
    },
  };
}
