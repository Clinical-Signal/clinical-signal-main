import { z } from "zod";

export const SexAtBirthSchema = z.enum(["male", "female", "intersex", ""]);
export type SexAtBirth = z.infer<typeof SexAtBirthSchema>;

/**
 * Draft/storage schema — the single source of truth for the `about_you` section.
 * Used by the autosave route, the composed `IntakeDataSchema`, and client
 * autosave, so it MUST accept an in-progress (or empty) draft. Required-field
 * rules live in {@link AboutYouCompleteSchema}, not here — applying them to the
 * stored record made `createEmptyAboutYou()` fail its own schema and caused the
 * composed-record parse to reject every incomplete intake.
 *
 * Malformed values (wrong type, over-max-length, a non-empty date that isn't
 * YYYY-MM-DD) are still rejected, so the save route returns a clean 400.
 */
export const AboutYouSchema = z.object({
  full_name: z.string().max(200).default(""),
  date_of_birth: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "date_of_birth must be YYYY-MM-DD")
    .default(""),
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

/**
 * Completion schema — strict required-field rules for "this section is done".
 * Derived from {@link AboutYouSchema} so the shape can never drift. Used by the
 * client field-error/step-gating helpers (and available for submit-time
 * enforcement), NOT for storage.
 */
export const AboutYouCompleteSchema = AboutYouSchema.extend({
  full_name: z.string().min(1).max(200),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_of_birth must be YYYY-MM-DD"),
});

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
