/**
 * Persisted intake aggregate (PRD §4.1 / Phase 2.3): Step-1 + metadata for provenance,
 * AI confirmations, and degraded-analysis flag.
 */
import { z } from "zod";

import { migrateLegacyStepOne } from "../migrate-legacy-step-one";
import {
  AboutYouSchema,
  AnythingElseSchema,
  HistorySchema,
  HormonesSchema,
  LifestyleSchema,
  MedicationsSchema,
  PreviousLabsSchema,
  StepOneSchema,
  SymptomsSchema,
  WearablesSchema,
  WhyHereSchema,
  createEmptyStepOne,
} from "./step-one.schema";

export const ProvenanceSource = z.enum(["patient", "clinician", "ai"]);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

export const AiConfirmationSlot = z.object({
  value: z.unknown(),
  confirmed: z.boolean(),
  by: z.string().uuid().optional(),
  at: z.string().datetime().optional(),
});
export type AiConfirmationSlot = z.infer<typeof AiConfirmationSlot>;

export const IntakeDataSchema = StepOneSchema.extend({
  /** Module answers plus `_question_plan_resolved` and `_synthesis_resolved` (Phase 7). */
  step_two: z.record(z.string(), z.unknown()).optional(),
  /** Patient email for magic-link dispatch (not collected on intake forms). */
  contact_email: z.string().email().optional(),
  _provenance: z.record(z.string(), ProvenanceSource),
  _ai_confirmations: z.record(z.string(), AiConfirmationSlot),
  _analysis_degraded: z.boolean(),
});

export type IntakeData = z.infer<typeof IntakeDataSchema>;

export const INTAKE_DATA_METADATA_KEYS = [
  "_provenance",
  "_ai_confirmations",
  "_analysis_degraded",
] as const;

export type IntakeDataMetadataKey = (typeof INTAKE_DATA_METADATA_KEYS)[number];

/** Default aggregate persisted before any Step-1 autosave. */
export function createEmptyIntakeData(): IntakeData {
  return {
    ...createEmptyStepOne(),
    _provenance: {},
    _ai_confirmations: {},
    _analysis_degraded: false,
  };
}

function normalizeRawIntake(raw: unknown): IntakeData {
  const migrated = migrateLegacyStepOne(raw);
  const withMeta = isPlainObject(raw)
    ? {
        ...migrated,
        step_two: raw.step_two,
        contact_email:
          typeof raw.contact_email === "string" ? raw.contact_email : undefined,
        _provenance: raw._provenance ?? {},
        _ai_confirmations: raw._ai_confirmations ?? {},
        _analysis_degraded: raw._analysis_degraded === true,
      }
    : {
        ...migrated,
        _provenance: {},
        _ai_confirmations: {},
        _analysis_degraded: false,
      };

  const parsed = IntakeDataSchema.safeParse(withMeta);
  const base = parsed.success ? parsed.data : createEmptyIntakeData();
  const contactEmail = readRawContactEmail(raw);
  return contactEmail ? { ...base, contact_email: contactEmail } : base;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRawContactEmail(raw: unknown): string | undefined {
  if (!isPlainObject(raw) || typeof raw.contact_email !== "string") {
    return undefined;
  }
  const trimmed = raw.contact_email.trim();
  return z.string().email().safeParse(trimmed).success ? trimmed : undefined;
}

/** Used when loading intake from the database. */
export function normalizeIntakeData(raw: unknown): IntakeData {
  return normalizeRawIntake(raw);
}

export {
  AboutYouSchema,
  AnythingElseSchema,
  HistorySchema,
  HormonesSchema,
  LifestyleSchema,
  MedicationsSchema,
  PreviousLabsSchema,
  SymptomsSchema,
  StepOneSchema,
  WearablesSchema,
  WhyHereSchema,
  createEmptyStepOne,
};

export { createEmptyMsqScores } from "./step-one/msq";
