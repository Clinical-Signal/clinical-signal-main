import type { IntakeData } from "./schemas/intake-data.schema";
import {
  StepOneSchema,
  toStepOneTriggerInput,
} from "./schemas/step-one.schema";
import type { QuestionPlanResolved } from "./schemas/question-plan.schema";
import {
  getDeterministicTriggers,
  type DeterministicModuleKey,
} from "./deterministic-triggers";
import { buildResolvedQuestionPlan } from "./build-question-plan";
import { mergeIntakeData } from "./merge-intake";
import {
  getPatientIntakeState,
  savePatientIntakeData,
} from "./patient-intake-store";
import {
  STEP_TWO_PLAN_KEY,
  priorStepTwoForAnalyzeMerge,
} from "./step-two-storage";
import {
  analyzeIntake,
  INTAKE_DYNAMIC_QUESTIONS_PROMPT_VERSION,
} from "@/lib/llm/analyze-intake";
import { writeAudit } from "@/lib/audit/write-audit";

const LOG = "[intake/analyze]";

function logStage(stage: string, detail?: Record<string, unknown>): void {
  console.error(LOG, stage, detail ?? "");
}

function logFailure(stage: string, error: unknown): void {
  console.error(LOG, stage, error);
}

function auditPayload(
  tokenId: string,
  plan: QuestionPlanResolved,
): Record<string, unknown> {
  return {
    tokenId,
    analysisDegraded: plan.analysis_degraded,
    deterministicModuleCount:
      plan.friction_budget_report.deterministic_module_count,
    augmentedModuleCount: plan.friction_budget_report.augmented_module_count,
    moduleCount: plan.question_plan.length,
    identifiedIssueCount: plan.identified_issues.length,
    redFlagTriggered: plan.red_flag_triggered,
  };
}

export type RunIntakeAnalyzeInput = {
  tenantId: string;
  patientId: string;
  tokenId: string;
};

export type RunIntakeAnalyzeResult = {
  resolved: QuestionPlanResolved;
  persistenceSaved: boolean;
};

async function safeAnalyzeLlm(
  intakeData: IntakeData,
): Promise<Awaited<ReturnType<typeof analyzeIntake>>> {
  try {
    return await analyzeIntake(intakeData);
  } catch (error) {
    logFailure("llm_execution_unhandled", error);
    return null;
  }
}

export async function runIntakeAnalyzePipeline(
  input: RunIntakeAnalyzeInput,
): Promise<RunIntakeAnalyzeResult> {
  logStage("load_patient_state", {
    patientId: input.patientId,
    tenantId: input.tenantId,
  });

  const existing = await getPatientIntakeState(input.tenantId, input.patientId);
  if (!existing) {
    throw new Error("Patient not found");
  }

  logStage("trigger_extraction_start");
  const stepOne = StepOneSchema.parse(existing.intakeData);
  const deterministicKeys: DeterministicModuleKey[] = getDeterministicTriggers(
    toStepOneTriggerInput(stepOne),
  );
  logStage("trigger_extraction_complete", {
    deterministicModuleCount: deterministicKeys.length,
    modules: deterministicKeys,
  });

  logStage("llm_execution_start");
  const llmResult = await safeAnalyzeLlm(existing.intakeData);
  const analysisDegraded = llmResult === null;
  logStage("llm_execution_complete", {
    analysisDegraded,
    hasLlmPlan: llmResult !== null,
  });

  logStage("build_resolved_plan_start", { analysisDegraded });
  let resolved: QuestionPlanResolved;
  try {
    resolved = buildResolvedQuestionPlan({
      deterministicKeys,
      llmPlan: llmResult?.plan ?? null,
      analysisDegraded,
      modelId: llmResult?.modelId ?? "",
      promptVersion: INTAKE_DYNAMIC_QUESTIONS_PROMPT_VERSION,
    });
  } catch (error) {
    logFailure("build_resolved_plan_failed", error);
    resolved = buildResolvedQuestionPlan({
      deterministicKeys,
      llmPlan: null,
      analysisDegraded: true,
      modelId: "",
      promptVersion: INTAKE_DYNAMIC_QUESTIONS_PROMPT_VERSION,
    });
  }
  logStage("build_resolved_plan_complete", {
    moduleCount: resolved.question_plan.length,
    analysisDegraded: resolved.analysis_degraded,
  });

  let persistenceSaved = false;
  try {
    logStage("persistence_start");
    const merged = mergeIntakeData(
      existing.intakeData,
      {
        _analysis_degraded: resolved.analysis_degraded,
        step_two: {
          ...priorStepTwoForAnalyzeMerge(existing.intakeData.step_two),
          [STEP_TWO_PLAN_KEY]: resolved,
        },
      },
      "ai",
    );

    await savePatientIntakeData(input.tenantId, input.patientId, merged);
    persistenceSaved = true;
    logStage("persistence_complete");
  } catch (error) {
    logFailure("persistence_failed", error);
  }

  try {
    await writeAudit({
      tenantId: input.tenantId,
      actorId: null,
      action: resolved.analysis_degraded
        ? "intake_analysis_degraded"
        : "intake_analysis_completed",
      entity: "patient",
      entityId: input.patientId,
      payload: auditPayload(input.tokenId, resolved),
    });
  } catch (error) {
    logFailure("audit_non_fatal", error);
  }

  return { resolved, persistenceSaved };
}
