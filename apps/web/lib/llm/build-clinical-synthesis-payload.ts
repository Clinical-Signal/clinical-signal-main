import {
  formatQuestionAnswer,
  UNANSWERED_LABEL,
} from "@/lib/intake/format-question-answer";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { IdentifiedIssue, Question } from "@/lib/intake/schemas/question-plan.schema";
import {
  buildFlatSteps,
  extractStepTwoAnswers,
  extractStepTwoPlan,
  MODULE_LABELS,
} from "@/lib/intake/step-two-storage";

export type ClinicalSynthesisQaPair = {
  question_id: string;
  prompt: string;
  answer: string;
  required: boolean;
};

export type ClinicalSynthesisModule = {
  module_key: string;
  module_label: string;
  rationale: string;
  qa_pairs: ClinicalSynthesisQaPair[];
};

export type ClinicalSynthesisUserPayload = {
  step_one: Pick<
    IntakeData,
    | "about_you"
    | "why_here"
    | "symptoms"
    | "history"
    | "medications"
    | "lifestyle"
    | "hormones"
    | "previous_labs"
    | "wearables"
    | "anything_else"
  >;
  identified_issues: IdentifiedIssue[];
  step_two_modules: ClinicalSynthesisModule[];
  red_flag_screening: ClinicalSynthesisQaPair[];
  analysis_degraded: boolean;
};

function toQaPair(question: Question, answers: Record<string, unknown>): ClinicalSynthesisQaPair {
  const formatted =
    formatQuestionAnswer(question, answers[question.id]) ?? UNANSWERED_LABEL;

  return {
    question_id: question.id,
    prompt: question.prompt,
    answer: formatted,
    required: question.required,
  };
}

export function buildClinicalSynthesisPayload(
  intakeData: IntakeData,
): ClinicalSynthesisUserPayload {
  const plan = extractStepTwoPlan(intakeData.step_two);
  const answers = extractStepTwoAnswers(intakeData.step_two);
  const modules: ClinicalSynthesisModule[] = [];

  if (plan) {
    const flatSteps = buildFlatSteps(plan);
    const byModule = new Map<string, ClinicalSynthesisQaPair[]>();

    for (const step of flatSteps) {
      const pairs = byModule.get(step.moduleKey) ?? [];
      pairs.push(toQaPair(step.question, answers));
      byModule.set(step.moduleKey, pairs);
    }

    for (const module of plan.question_plan) {
      const qa_pairs = byModule.get(module.module_key);
      if (!qa_pairs || qa_pairs.length === 0) {
        continue;
      }

      modules.push({
        module_key: module.module_key,
        module_label: MODULE_LABELS[module.module_key],
        rationale: module.rationale,
        qa_pairs,
      });
    }
  }

  const screening =
    plan?.red_flag_screening?.map((question) => toQaPair(question, answers)) ?? [];

  return {
    step_one: {
      about_you: intakeData.about_you,
      why_here: intakeData.why_here,
      symptoms: intakeData.symptoms,
      history: intakeData.history,
      medications: intakeData.medications,
      lifestyle: intakeData.lifestyle,
      hormones: intakeData.hormones,
      previous_labs: intakeData.previous_labs,
      wearables: intakeData.wearables,
      anything_else: intakeData.anything_else,
    },
    identified_issues: plan?.identified_issues ?? [],
    step_two_modules: modules,
    red_flag_screening: screening,
    analysis_degraded: intakeData._analysis_degraded,
  };
}
