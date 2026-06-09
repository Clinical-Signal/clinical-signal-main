"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { IntakeTransitionLoader } from "../intake-transition-loader";

import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

import { STEP_ONE_SCREENS, type StepOneScreenKey } from "./step-one-screens";
import { StepOneChrome } from "./step-one-chrome";
import { computeStepOneFieldProgress } from "./step-one-field-progress";
import { StepOneSaveProvider } from "./step-one-save-context";
import { StepOneScreenRenderer } from "./step-one-screen-renderer";
import {
  canAdvanceStepOneScreen,
  isStepOneDraftValid,
  type StepOneDraftSlice,
} from "./step-one-validators";
import { useStepOneDraft } from "./use-step-one-draft";

export type StepOneFormProps = {
  token: string;
  intakeStatus: IntakeStatus;
  initialIntakeData: IntakeData;
};

const STEP1_READY_STATUSES: IntakeStatus[] = [
  "step1_complete",
  "step2_complete",
  "labs_pending",
  "reviewed",
];

export function StepOneForm({ token, intakeStatus, initialIntakeData }: StepOneFormProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepOneScreenKey>("about_you");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const draft = useStepOneDraft(initialIntakeData);

  const stepIndex = STEP_ONE_SCREENS.findIndex((step) => step.key === currentStep);
  const isLastStep = stepIndex >= STEP_ONE_SCREENS.length - 1;
  const stepLabel =
    STEP_ONE_SCREENS.find((step) => step.key === currentStep)?.label ?? "Step 1";

  const draftSlice: StepOneDraftSlice = {
    aboutYou: draft.aboutYou,
    whyHere: draft.whyHere,
    symptoms: draft.symptoms,
    history: draft.history,
    medications: draft.medications,
    lifestyle: draft.lifestyle,
    hormones: draft.hormones,
    previousLabs: draft.previousLabs,
    wearables: draft.wearables,
    anythingElse: draft.anythingElse,
  };

  const canAdvance = useMemo(
    () => canAdvanceStepOneScreen(currentStep, draftSlice),
    [currentStep, draftSlice],
  );

  const fieldProgressPct = useMemo(
    () => computeStepOneFieldProgress(draftSlice),
    [draftSlice],
  );

  const stepOneComplete =
    STEP1_READY_STATUSES.includes(intakeStatus) || isStepOneDraftValid(draftSlice);

  const stepTwoHref = `/intake/${encodeURIComponent(token)}/step-two`;

  const goBack = () => {
    const previous = STEP_ONE_SCREENS[stepIndex - 1];
    if (previous) {
      setCurrentStep(previous.key);
    }
  };

  const startStepTwoTransition = useCallback(() => {
    if (isTransitioning) {
      return;
    }
    setIsTransitioning(true);
    router.push(stepTwoHref);
  }, [isTransitioning, router, stepTwoHref]);

  const goNext = () => {
    if (isLastStep && canAdvance) {
      startStepTwoTransition();
      return;
    }
    const next = STEP_ONE_SCREENS[stepIndex + 1];
    if (next) {
      setCurrentStep(next.key);
    }
  };

  if (isTransitioning) {
    return <IntakeTransitionLoader />;
  }

  return (
    <StepOneSaveProvider>
      <StepOneChrome
        stepIndex={stepIndex}
        stepLabel={stepLabel}
        intakeStatus={intakeStatus}
        fieldProgressPct={fieldProgressPct}
        stepOneComplete={stepOneComplete}
        isLastStep={isLastStep}
        canAdvance={canAdvance}
        onContinueToStepTwo={startStepTwoTransition}
        onBack={goBack}
        onNext={goNext}
      >
        <StepOneScreenRenderer
          token={token}
          screen={currentStep}
          draft={draft}
          showIntro={currentStep === "about_you" && stepIndex === 0}
        />
      </StepOneChrome>
    </StepOneSaveProvider>
  );
}
