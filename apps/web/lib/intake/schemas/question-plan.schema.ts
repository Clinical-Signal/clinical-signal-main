import { z } from "zod";

import { SCHEMA_LIMITS } from "../constants";

/** Closed module set (design doc §4.1) — must match deterministic-triggers + question-banks. */
export const MODULE_KEYS = [
  "gut_deep_dive",
  "hormone_deep_dive",
  "immune_deep_dive",
  "medication_followups",
  "sleep_deep_dive",
  "stress_deep_dive",
  "skin_deep_dive",
  "metabolism_deep_dive",
  "wellness_practice",
  "previous_labs_followups",
] as const;

export const ModuleKey = z.enum(MODULE_KEYS);
export type ModuleKey = z.infer<typeof ModuleKey>;

export const SignalSource = z.enum([
  "symptom",
  "medication",
  "lifestyle",
  "history",
]);
export type SignalSource = z.infer<typeof SignalSource>;

export const QuestionPriority = z.enum(["must_have", "nice_to_have"]);
export type QuestionPriority = z.infer<typeof QuestionPriority>;

const QUESTION_ID_MESSAGE =
  "id must be lowercase snake_case, start with a letter, 3–64 chars";

const ChipsControl = z.object({
  kind: z.literal("chips"),
  multi: z.boolean(),
  options: z
    .array(
      z.object({
        value: z.string().min(1).max(48),
        label: z.string().min(1).max(80),
      }),
    )
    .min(2)
    .max(12),
});

const SliderControl = z
  .object({
    kind: z.literal("slider"),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    unit: z.string().max(16).optional(),
    default_value: z.number().optional(),
  })
  .refine((slider) => slider.max > slider.min, {
    message: "max must be greater than min",
  });

const FreeTextControl = z.object({
  kind: z.literal("free_text"),
  multiline: z.boolean(),
  max_chars: z.number().int().min(20).max(2000),
  placeholder: z.string().max(120).optional(),
});

const BristolControl = z.object({
  kind: z.literal("bristol"),
});

const YesNoControl = z.object({
  kind: z.literal("yes_no"),
});

const NumericControl = z.object({
  kind: z.literal("numeric"),
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().max(16).optional(),
});

export const Control = z.discriminatedUnion("kind", [
  ChipsControl,
  SliderControl,
  FreeTextControl,
  BristolControl,
  YesNoControl,
  NumericControl,
]);
export type Control = z.infer<typeof Control>;

export const Question = z.object({
  id: z
    .string()
    .regex(SCHEMA_LIMITS.question_id_pattern, QUESTION_ID_MESSAGE),
  prompt: z
    .string()
    .min(3)
    .max(SCHEMA_LIMITS.question_prompt_max_chars),
  help_text: z.string().max(SCHEMA_LIMITS.question_prompt_max_chars).optional(),
  control: Control,
  priority: QuestionPriority,
  required: z.boolean(),
});
export type Question = z.infer<typeof Question>;

export const IdentifiedIssue = z.object({
  id: z.string().regex(SCHEMA_LIMITS.question_id_pattern, QUESTION_ID_MESSAGE),
  label: z.string().min(3).max(120),
  signal_source: SignalSource,
  red_flag: z.boolean(),
});
export type IdentifiedIssue = z.infer<typeof IdentifiedIssue>;

/** LLM output for `intake_issue_identification_v1` (Step-1 analyze, issues only). */
const IntakeIssueIdentificationOutputBase = z.object({
  identified_issues: z
    .array(IdentifiedIssue)
    .min(0)
    .max(SCHEMA_LIMITS.max_identified_issues),
});

export const IntakeIssueIdentificationOutput =
  IntakeIssueIdentificationOutputBase.superRefine((output, ctx) => {
    const issueIds = output.identified_issues.map((issue) => issue.id);
    const duplicateIssueIds = issueIds.filter(
      (id, index) => issueIds.indexOf(id) !== index,
    );
    if (duplicateIssueIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["identified_issues"],
        message: `duplicate identified-issue id: ${duplicateIssueIds.join(", ")}`,
      });
    }
  });
export type IntakeIssueIdentificationOutput = z.infer<
  typeof IntakeIssueIdentificationOutput
>;

export const ModulePlanLLM = z.object({
  module_key: ModuleKey,
  rationale: z
    .string()
    .min(3)
    .max(SCHEMA_LIMITS.question_prompt_max_chars),
  questions: z
    .array(Question)
    .min(0)
    .max(SCHEMA_LIMITS.max_questions_per_module_hard_ceiling),
});
export type ModulePlanLLM = z.infer<typeof ModulePlanLLM>;

const QuestionPlanLLMOutputBase = z.object({
  identified_issues: z
    .array(IdentifiedIssue)
    .min(0)
    .max(SCHEMA_LIMITS.max_identified_issues),
  question_plan: z.array(ModulePlanLLM).min(0).max(MODULE_KEYS.length),
  red_flag_screening: z
    .array(Question)
    .min(0)
    .max(SCHEMA_LIMITS.max_red_flag_screening)
    .optional(),
});

function applyQuestionPlanLLMRefinements(
  plan: z.infer<typeof QuestionPlanLLMOutputBase>,
  ctx: z.RefinementCtx,
): void {
  const keys = plan.question_plan.map((module) => module.module_key);
  const duplicateModuleKeys = keys.filter(
    (key, index) => keys.indexOf(key) !== index,
  );
  if (duplicateModuleKeys.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["question_plan"],
      message: `duplicate module_key: ${duplicateModuleKeys.join(", ")}`,
    });
  }

  for (const [index, module] of plan.question_plan.entries()) {
    const questionIds = module.questions.map((question) => question.id);
    const duplicateQuestionIds = questionIds.filter(
      (id, questionIndex) => questionIds.indexOf(id) !== questionIndex,
    );
    if (duplicateQuestionIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["question_plan", index, "questions"],
        message: `duplicate question id in module ${module.module_key}: ${duplicateQuestionIds.join(", ")}`,
      });
    }
  }

  if (plan.red_flag_screening) {
    const screeningIds = plan.red_flag_screening.map((question) => question.id);
    const duplicateScreeningIds = screeningIds.filter(
      (id, index) => screeningIds.indexOf(id) !== index,
    );
    if (duplicateScreeningIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["red_flag_screening"],
        message: `duplicate red-flag screening question id: ${duplicateScreeningIds.join(", ")}`,
      });
    }
  }

  const issueIds = plan.identified_issues.map((issue) => issue.id);
  const duplicateIssueIds = issueIds.filter(
    (id, index) => issueIds.indexOf(id) !== index,
  );
  if (duplicateIssueIds.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["identified_issues"],
      message: `duplicate identified-issue id: ${duplicateIssueIds.join(", ")}`,
    });
  }
}

export const QuestionPlanLLMOutput = QuestionPlanLLMOutputBase.superRefine(
  applyQuestionPlanLLMRefinements,
);
export type QuestionPlanLLMOutput = z.infer<typeof QuestionPlanLLMOutput>;

export const ModulePlanResolved = ModulePlanLLM.extend({
  is_deterministic: z.boolean(),
  was_budget_suppressed: z.boolean(),
  questions_trimmed_count: z.number().int().nonnegative(),
});
export type ModulePlanResolved = z.infer<typeof ModulePlanResolved>;

export const FrictionBudgetReport = z.object({
  deterministic_module_count: z.number().int().nonnegative(),
  augmented_module_count: z.number().int().nonnegative(),
  augmented_modules_suppressed: z.array(ModuleKey),
  questions_trimmed: z.array(
    z.object({
      module_key: ModuleKey,
      trimmed_count: z.number().int().nonnegative(),
    }),
  ),
  budget_applied: z.object({
    max_augmented_modules: z.number().int().nonnegative(),
    max_questions_per_module: z.number().int().nonnegative(),
    max_total_augmented_questions: z.number().int().nonnegative(),
  }),
});
export type FrictionBudgetReport = z.infer<typeof FrictionBudgetReport>;

const QuestionPlanResolvedBase = z.object({
  identified_issues: z
    .array(IdentifiedIssue)
    .max(SCHEMA_LIMITS.max_identified_issues),
  question_plan: z.array(ModulePlanResolved),
  red_flag_triggered: z.boolean(),
  red_flag_screening: z
    .array(Question)
    .max(SCHEMA_LIMITS.max_red_flag_screening)
    .optional(),
  friction_budget_report: FrictionBudgetReport,
  analysis_degraded: z.boolean(),
  model_id: z.string().min(1).max(120),
  prompt_version: z.string().min(1).max(40),
});

export const QuestionPlanResolved = QuestionPlanResolvedBase.superRefine(
  (resolved, ctx) => {
    const violators = resolved.question_plan.filter(
      (module) => module.is_deterministic && module.was_budget_suppressed,
    );
    if (violators.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["question_plan"],
        message: `INVARIANT VIOLATION: deterministic modules suppressed by budget: ${violators.map((module) => module.module_key).join(", ")}`,
      });
    }
  },
);
export type QuestionPlanResolved = z.infer<typeof QuestionPlanResolved>;
