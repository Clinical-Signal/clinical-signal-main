import type { DeterministicModuleKey } from "./deterministic-triggers";
import { FRICTION_BUDGET_DEFAULTS } from "./constants";
import { applyFrictionBudget, type FrictionBudgetResult } from "./friction-budget";
import { getFallbackQuestions } from "./question-banks";
import {
  ModuleKey,
  QuestionPlanResolved,
  type ModuleKey as ModuleKeyType,
  type ModulePlanLLM,
  type Question,
  type QuestionPlanLLMOutput,
  type QuestionPlanResolved as QuestionPlanResolvedType,
} from "./schemas/question-plan.schema";

const DETERMINISTIC_RATIONALES: Record<DeterministicModuleKey, string> = {
  gut_deep_dive: "Digestive symptoms require structured follow-up.",
  hormone_deep_dive: "Hormonal symptoms require structured follow-up.",
  immune_deep_dive: "Autoimmune or immune-related symptoms require follow-up.",
  medication_followups: "Listed medications need dose and timing detail.",
  wellness_practice: "Active wellness practices warrant brief follow-up.",
  previous_labs_followups: "Prior labs should be reviewed or uploaded.",
};

const DEGRADED_MODEL_ID = "static-fallback";

type ModuleDraft = {
  module_key: ModuleKeyType;
  rationale: string;
  questions: Question[];
  is_deterministic: boolean;
};

export type BuildResolvedQuestionPlanInput = {
  deterministicKeys: readonly DeterministicModuleKey[];
  llmPlan: QuestionPlanLLMOutput | null;
  analysisDegraded: boolean;
  modelId: string;
  promptVersion: string;
};

function moduleFromBank(key: DeterministicModuleKey): ModuleDraft {
  return {
    module_key: key,
    rationale: DETERMINISTIC_RATIONALES[key],
    questions: [...getFallbackQuestions(key)],
    is_deterministic: true,
  };
}

function findLlmModule(
  plan: QuestionPlanLLMOutput,
  key: ModuleKeyType,
): ModulePlanLLM | undefined {
  return plan.question_plan.find((module) => module.module_key === key);
}

function buildModuleDrafts(input: BuildResolvedQuestionPlanInput): ModuleDraft[] {
  const drafts: ModuleDraft[] = [];
  const deterministicSet = new Set<string>(input.deterministicKeys);

  for (const key of input.deterministicKeys) {
    if (input.analysisDegraded || input.llmPlan === null) {
      drafts.push(moduleFromBank(key));
      continue;
    }

    const llmModule = findLlmModule(input.llmPlan, key);
    if (llmModule) {
      drafts.push({
        module_key: key,
        rationale: llmModule.rationale,
        questions: [...llmModule.questions],
        is_deterministic: true,
      });
    } else {
      drafts.push(moduleFromBank(key));
    }
  }

  if (!input.analysisDegraded && input.llmPlan) {
    for (const llmModule of input.llmPlan.question_plan) {
      if (deterministicSet.has(llmModule.module_key)) {
        continue;
      }
      if (drafts.some((draft) => draft.module_key === llmModule.module_key)) {
        continue;
      }
      drafts.push({
        module_key: llmModule.module_key,
        rationale: llmModule.rationale,
        questions: [...llmModule.questions],
        is_deterministic: false,
      });
    }
  }

  return drafts;
}

function resolveModulesAfterBudget(
  drafts: ModuleDraft[],
  budgetResult: FrictionBudgetResult,
): QuestionPlanResolvedType["question_plan"] {
  const byKey = new Map(drafts.map((draft) => [draft.module_key, draft]));
  const resolved: QuestionPlanResolvedType["question_plan"] = [];

  for (const output of budgetResult.modules) {
    if (output.was_budget_suppressed) {
      continue;
    }

    const source = byKey.get(output.module_key as ModuleKeyType);
    if (!source) {
      continue;
    }

    const questionById = new Map(
      source.questions.map((question) => [question.id, question]),
    );
    const keptQuestions: Question[] = [];
    for (const ref of output.questions) {
      const full = questionById.get(ref.id);
      if (full) {
        keptQuestions.push(full);
      }
    }

    resolved.push({
      module_key: source.module_key,
      rationale: source.rationale,
      questions: keptQuestions,
      is_deterministic: output.is_deterministic,
      was_budget_suppressed: false,
      questions_trimmed_count: output.questions_trimmed_count,
    });
  }

  return resolved;
}

function parseSuppressedModuleKeys(
  suppressed: string[],
): QuestionPlanResolvedType["friction_budget_report"]["augmented_modules_suppressed"] {
  const keys: ModuleKeyType[] = [];
  for (const key of suppressed) {
    const parsed = ModuleKey.safeParse(key);
    if (parsed.success) {
      keys.push(parsed.data);
    }
  }
  return keys;
}

function parseTrimmedModuleKeys(
  trimmed: FrictionBudgetResult["trimmed"],
): QuestionPlanResolvedType["friction_budget_report"]["questions_trimmed"] {
  const entries: QuestionPlanResolvedType["friction_budget_report"]["questions_trimmed"] =
    [];
  for (const entry of trimmed) {
    const parsed = ModuleKey.safeParse(entry.module_key);
    if (parsed.success) {
      entries.push({
        module_key: parsed.data,
        trimmed_count: entry.trimmed_count,
      });
    }
  }
  return entries;
}

/** Merges deterministic triggers, LLM or fallback banks, and friction budget into a resolved plan. */
export function buildResolvedQuestionPlan(
  input: BuildResolvedQuestionPlanInput,
): QuestionPlanResolvedType {
  const drafts = buildModuleDrafts(input);
  const budgetResult = applyFrictionBudget(
    drafts.map((draft) => ({
      module_key: draft.module_key,
      is_deterministic: draft.is_deterministic,
      questions: draft.questions.map((question) => ({
        id: question.id,
        priority: question.priority,
      })),
    })),
    FRICTION_BUDGET_DEFAULTS,
  );

  const questionPlan = resolveModulesAfterBudget(drafts, budgetResult);
  const llmPlan = input.llmPlan;
  const identifiedIssues =
    input.analysisDegraded || llmPlan === null
      ? []
      : llmPlan.identified_issues;

  const redFlagScreening =
    input.analysisDegraded || llmPlan === null
      ? undefined
      : llmPlan.red_flag_screening;

  const redFlagTriggered =
    identifiedIssues.some((issue) => issue.red_flag) ||
    (redFlagScreening?.length ?? 0) > 0;

  const envelope: QuestionPlanResolvedType = {
    identified_issues: identifiedIssues,
    question_plan: questionPlan,
    red_flag_triggered: redFlagTriggered,
    friction_budget_report: {
      deterministic_module_count: budgetResult.deterministic_count,
      augmented_module_count: budgetResult.augmented_count,
      augmented_modules_suppressed: parseSuppressedModuleKeys(
        budgetResult.suppressed,
      ),
      questions_trimmed: parseTrimmedModuleKeys(budgetResult.trimmed),
      budget_applied: { ...FRICTION_BUDGET_DEFAULTS },
    },
    analysis_degraded: input.analysisDegraded,
    model_id: input.analysisDegraded ? DEGRADED_MODEL_ID : input.modelId,
    prompt_version: input.promptVersion,
  };

  if (redFlagScreening && redFlagScreening.length > 0) {
    envelope.red_flag_screening = redFlagScreening;
  }

  return QuestionPlanResolved.parse(envelope);
}

export { DEGRADED_MODEL_ID };
