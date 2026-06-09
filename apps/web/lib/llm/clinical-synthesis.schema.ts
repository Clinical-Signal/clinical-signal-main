import { z } from "zod";

import { SCHEMA_LIMITS } from "@/lib/intake/constants";

const STEP_ID_MESSAGE =
  "id must be lowercase snake_case, start with a letter, 3–64 chars";

export const SuggestedNextStepCategory = z.enum([
  "labs",
  "lifestyle",
  "referral",
  "follow_up",
  "documentation",
  "other",
]);
export type SuggestedNextStepCategory = z.infer<typeof SuggestedNextStepCategory>;

export const SuggestedNextStepPriority = z.enum(["high", "medium", "low"]);
export type SuggestedNextStepPriority = z.infer<typeof SuggestedNextStepPriority>;

export const SuggestedNextStep = z.object({
  id: z
    .string()
    .regex(SCHEMA_LIMITS.question_id_pattern, STEP_ID_MESSAGE),
  label: z.string().min(3).max(200),
  category: SuggestedNextStepCategory,
  priority: SuggestedNextStepPriority,
  rationale: z.string().min(3).max(SCHEMA_LIMITS.question_prompt_max_chars),
});
export type SuggestedNextStep = z.infer<typeof SuggestedNextStep>;

const REQUIRED_HEADINGS = [
  "## Chief Complaint",
  "## History of Present Illness (HPI)",
  "## Review of Systems (ROS)",
] as const;

export const CLINICAL_SUMMARY_MAX_CHARS = 16_000;

export const ClinicalSynthesisOutput = z
  .object({
    clinical_summary: z
      .string()
      .min(1)
      .max(CLINICAL_SUMMARY_MAX_CHARS),
    suggested_next_steps: z.array(SuggestedNextStep).min(3).max(8),
  })
  .superRefine((output, ctx) => {
    for (const heading of REQUIRED_HEADINGS) {
      if (!output.clinical_summary.includes(heading)) {
        ctx.addIssue({
          code: "custom",
          path: ["clinical_summary"],
          message: `clinical_summary must include heading: ${heading}`,
        });
      }
    }

    const ids = output.suggested_next_steps.map((step) => step.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["suggested_next_steps"],
        message: `duplicate step id: ${duplicates.join(", ")}`,
      });
    }
  });

export type ClinicalSynthesisOutput = z.infer<typeof ClinicalSynthesisOutput>;
