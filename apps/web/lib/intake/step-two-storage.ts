import {
  QuestionPlanResolved,
  type ModuleKey,
  type Question,
  type QuestionPlanResolved as QuestionPlanResolvedType,
} from "./schemas/question-plan.schema";
import {
  SynthesisResolved,
  type SynthesisResolved as SynthesisResolvedType,
} from "./schemas/synthesis-resolved.schema";

export const STEP_TWO_PLAN_KEY = "_question_plan_resolved";
export const STEP_TWO_ANSWERS_KEY = "answers";
export const STEP_TWO_SYNTHESIS_KEY = "_synthesis_resolved";

const RESERVED_STEP_TWO_KEYS = new Set([
  STEP_TWO_PLAN_KEY,
  STEP_TWO_ANSWERS_KEY,
  STEP_TWO_SYNTHESIS_KEY,
]);

export const MODULE_LABELS: Record<ModuleKey, string> = {
  gut_deep_dive: "Digestive deep dive",
  hormone_deep_dive: "Hormone deep dive",
  immune_deep_dive: "Immune deep dive",
  medication_followups: "Medications",
  sleep_deep_dive: "Sleep deep dive",
  stress_deep_dive: "Stress deep dive",
  skin_deep_dive: "Skin deep dive",
  metabolism_deep_dive: "Weight & metabolism deep dive",
  wellness_practice: "Wellness practices",
  previous_labs_followups: "Prior labs",
};

export type StepTwoFlatStep = {
  moduleKey: ModuleKey;
  moduleLabel: string;
  moduleRationale: string;
  questionIndexInModule: number;
  questionsInModule: number;
  question: Question;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractStepTwoPlan(
  stepTwo: Record<string, unknown> | undefined,
): QuestionPlanResolvedType | null {
  if (!stepTwo) {
    return null;
  }

  const raw = stepTwo[STEP_TWO_PLAN_KEY];
  const parsed = QuestionPlanResolved.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function extractSynthesisResolved(
  stepTwo: Record<string, unknown> | undefined,
): SynthesisResolvedType | null {
  if (!stepTwo) {
    return null;
  }

  const raw = stepTwo[STEP_TWO_SYNTHESIS_KEY];
  const parsed = SynthesisResolved.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function extractStepTwoAnswers(
  stepTwo: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!stepTwo) {
    return {};
  }

  const nested = stepTwo[STEP_TWO_ANSWERS_KEY];
  if (isPlainObject(nested)) {
    return { ...nested };
  }

  const legacy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stepTwo)) {
    if (!RESERVED_STEP_TWO_KEYS.has(key)) {
      legacy[key] = value;
    }
  }
  return legacy;
}

export function buildFlatSteps(plan: QuestionPlanResolvedType): StepTwoFlatStep[] {
  const steps: StepTwoFlatStep[] = [];

  for (const module of plan.question_plan) {
    if (module.questions.length === 0) {
      continue;
    }

    const moduleLabel = MODULE_LABELS[module.module_key];
    module.questions.forEach((question, index) => {
      steps.push({
        moduleKey: module.module_key,
        moduleLabel,
        moduleRationale: module.rationale,
        questionIndexInModule: index,
        questionsInModule: module.questions.length,
        question,
      });
    });
  }

  return steps;
}

export function priorStepTwoForAnalyzeMerge(
  stepTwo: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const answers = extractStepTwoAnswers(stepTwo);
  if (Object.keys(answers).length === 0) {
    return {};
  }
  return { [STEP_TWO_ANSWERS_KEY]: answers };
}
