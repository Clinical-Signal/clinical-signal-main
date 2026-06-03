import { z } from "zod";

export const SexAtBirthSchema = z.enum(["male", "female", "intersex", ""]);
export type SexAtBirth = z.infer<typeof SexAtBirthSchema>;

export const AboutYouSchema = z.object({
  full_name: z.string().min(1).max(200),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_of_birth must be YYYY-MM-DD"),
  sex_at_birth: SexAtBirthSchema.default(""),
  gender_identity: z.string().max(120).default(""),
  height_inches: z.number().min(0).max(120).nullable().default(null),
  weight_lbs: z.number().min(0).max(1000).nullable().default(null),
  state: z.string().max(2).default(""),
  emergency_contact_name: z.string().max(200).default(""),
  emergency_contact_relationship: z.string().max(120).default(""),
  emergency_contact_phone: z.string().max(40).default(""),
});

export type AboutYou = z.infer<typeof AboutYouSchema>;

export function createEmptyAboutYou(): AboutYou {
  return {
    full_name: "",
    date_of_birth: "",
    sex_at_birth: "",
    gender_identity: "",
    height_inches: null,
    weight_lbs: null,
    state: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
  };
}
