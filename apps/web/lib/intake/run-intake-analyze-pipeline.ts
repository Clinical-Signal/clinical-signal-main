import type { IntakeData } from "./schemas/intake-data.schema";
import type { QuestionPlanLLMOutput, QuestionPlanResolved } from "./schemas/question-plan.schema";
import type { DeterministicModuleKey } from "./deterministic-triggers";
import {
  buildDegradedQuestionPlan,
  buildSuccessQuestionPlan,
} from "./build-question-plan";
import { extractDeterministicKeysFromIntake } from "./analyze-pipeline-helpers";
import { mergeIntakeData } from "./merge-intake";
import {
  getPatientIntakeState,
  savePatientIntakeData,
} from "./patient-intake-store";
import {
  STEP_TWO_ANSWERS_KEY,
  STEP_TWO_PLAN_KEY,
  extractStepTwoAnswers,
  priorStepTwoForAnalyzeMerge,
} from "./step-two-storage";
import {
  analyzeIntake,
  INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
} from "@/lib/llm/analyze-intake";
import { writeAudit } from "@/lib/audit/write-audit";

const LOG = "[intake/analyze-pipeline]";

function logStage(stage: string, detail?: Record<string, unknown>): void {
  console.error(LOG, stage, detail ?? "");
}

function logFailure(stage: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(LOG, stage, error.message);
    if (error.stack) {
      console.error(LOG, `${stage}_stack`, error.stack);
    }
    return;
  }
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

function llmOutputToPlan(
  llmResult: NonNullable<Awaited<ReturnType<typeof analyzeIntake>>>,
): QuestionPlanLLMOutput {
  return {
    identified_issues: llmResult.output.identified_issues,
    question_plan: [],
  };
}

function attachResolvedPlanToIntake(
  existing: IntakeData,
  resolved: QuestionPlanResolved,
): IntakeData {
  const merged = mergeIntakeData(
    existing,
    { _analysis_degraded: resolved.analysis_degraded },
    "ai",
  );

  const priorAnswers = extractStepTwoAnswers(existing.step_two);
  merged.step_two = {
    ...priorStepTwoForAnalyzeMerge(existing.step_two),
    [STEP_TWO_PLAN_KEY]: structuredClone(resolved),
    ...(Object.keys(priorAnswers).length > 0
      ? { [STEP_TWO_ANSWERS_KEY]: priorAnswers }
      : {}),
  };

  return merged;
}

function buildResolvedPlan(
  deterministicKeys: DeterministicModuleKey[],
  llmResult: Awaited<ReturnType<typeof analyzeIntake>>,
): QuestionPlanResolved {
  if (llmResult === null) {
    logStage("build_degraded_plan");
    return buildDegradedQuestionPlan(
      deterministicKeys,
      INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
    );
  }

  try {
    logStage("build_success_plan");
    return buildSuccessQuestionPlan(
      deterministicKeys,
      llmOutputToPlan(llmResult),
      llmResult.modelId,
      llmResult.promptVersion,
    );
  } catch (error) {
    logFailure("build_success_plan_failed", error);
    return buildDegradedQuestionPlan(
      deterministicKeys,
      INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
    );
  }
}

/**
 * API-3 unified pipeline: deterministic triggers → LLM (or degraded banks) → friction budget → persist.
 * Never throws after patient load — failures degrade to static question banks.
 */
export async function runIntakeAnalyzePipeline(
  input: RunIntakeAnalyzeInput,
): Promise<RunIntakeAnalyzeResult> {
  logStage("load_patient_state", { tokenId: input.tokenId });

  const existing = await getPatientIntakeState(input.tenantId, input.patientId);
  if (!existing) {
    throw new Error("Patient not found");
  }

  let deterministicKeys: DeterministicModuleKey[] = [];

  try {
    logStage("trigger_extraction_start");
    deterministicKeys = extractDeterministicKeysFromIntake(existing.intakeData);
    logStage("trigger_extraction_complete", {
      deterministicModuleCount: deterministicKeys.length,
    });

    logStage("llm_execution_start");
    const llmResult = await safeAnalyzeLlm(existing.intakeData);
    const analysisDegraded = llmResult === null;
    logStage("llm_execution_complete", { analysisDegraded });

    const resolved = buildResolvedPlan(deterministicKeys, llmResult);
    logStage("build_resolved_plan_complete", {
      moduleCount: resolved.question_plan.length,
      analysisDegraded: resolved.analysis_degraded,
    });

    let persistenceSaved = false;
    try {
      logStage("persistence_start");
      const merged = attachResolvedPlanToIntake(existing.intakeData, resolved);
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
  } catch (error) {
    logFailure("pipeline_degraded_fallback", error);

    const resolved = buildDegradedQuestionPlan(
      deterministicKeys,
      INTAKE_ISSUE_IDENTIFICATION_PROMPT_VERSION,
    );

    let persistenceSaved = false;
    try {
      logStage("persistence_fallback_start");
      const merged = attachResolvedPlanToIntake(existing.intakeData, resolved);
      await savePatientIntakeData(input.tenantId, input.patientId, merged);
      persistenceSaved = true;
      logStage("persistence_fallback_complete");
    } catch (persistError) {
      logFailure("persistence_fallback_failed", persistError);
    }

    try {
      await writeAudit({
        tenantId: input.tenantId,
        actorId: null,
        action: "intake_analysis_degraded",
        entity: "patient",
        entityId: input.patientId,
        payload: auditPayload(input.tokenId, resolved),
      });
    } catch (auditError) {
      logFailure("audit_fallback_non_fatal", auditError);
    }

    return { resolved, persistenceSaved };
  }
}
