import {
  getDeterministicTriggers,
  type DeterministicModuleKey,
} from "./deterministic-triggers";
import {
  QuestionPlanResolved,
  type QuestionPlanResolved as QuestionPlanResolvedType,
} from "./schemas/question-plan.schema";
import {
  StepOneSchema,
  createEmptyStepOne,
  toStepOneTriggerInput,
} from "./schemas/step-one.schema";
import type { IntakeData } from "./schemas/intake-data.schema";
import {
  buildDegradedQuestionPlan,
} from "./build-question-plan";
import { INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION } from "@/lib/llm/analyze-intake";

/** Safe Step-1 parse for trigger extraction (partial Step 1 must not abort analyze). */
export function extractDeterministicKeysFromIntake(
  intakeData: IntakeData,
): DeterministicModuleKey[] {
  const parsed = StepOneSchema.safeParse(intakeData);
  const stepOne = parsed.success ? parsed.data : createEmptyStepOne();
  return getDeterministicTriggers(toStepOneTriggerInput(stepOne));
}

/** Always returns a client-safe resolved plan envelope. */
export function coerceQuestionPlanResolved(
  candidate: unknown,
  deterministicKeys: readonly DeterministicModuleKey[],
): QuestionPlanResolvedType {
  const parsed = QuestionPlanResolved.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  return buildDegradedQuestionPlan(
    deterministicKeys,
    INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
  );
}
