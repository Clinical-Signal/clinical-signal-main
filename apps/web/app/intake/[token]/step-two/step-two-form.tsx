"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildFlatSteps,
  type StepTwoFlatStep,
} from "@/lib/intake/step-two-storage";
import type { QuestionPlanResolved } from "@/lib/intake/schemas/question-plan.schema";

import { StepTwoChrome } from "./step-two-chrome";
import { StepTwoQuestionPanel } from "./step-two-question-panel";
import { isStepTwoAnswered } from "./step-two-utils";
import { useStepTwoAutosave } from "./use-step-two-autosave";

export type StepTwoFormProps = {
  token: string;
  plan: QuestionPlanResolved;
  initialAnswers: Record<string, unknown>;
};

export function StepTwoForm({ token, plan, initialAnswers }: StepTwoFormProps) {
  const flatSteps = useMemo(() => buildFlatSteps(plan), [plan]);
  const [stepIndex, setStepIndex] = useState(0);
  const answersRef = useRef<Record<string, unknown>>({ ...initialAnswers });
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => ({
    ...initialAnswers,
  }));
  const [complete, setComplete] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitStartedRef = useRef(false);

  const { saveStatus, saveAnswers } = useStepTwoAutosave(token, (synced) => {
    answersRef.current = synced;
    setAnswers(synced);
  });

  const current: StepTwoFlatStep | undefined = flatSteps[stepIndex];
  const totalSteps = flatSteps.length;
  const isLastStep = stepIndex >= totalSteps - 1;

  const commitAnswers = useCallback(() => {
    void saveAnswers({ ...answersRef.current });
  }, [saveAnswers]);

  const finalizeIntake = useCallback(async () => {
    if (submitStartedRef.current) {
      return;
    }
    submitStartedRef.current = true;
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/intake/${encodeURIComponent(token)}/submit`,
        { method: "POST" },
      );
      if (!response.ok) {
        setSubmitError("Could not finalize intake. This link may no longer be valid.");
        submitStartedRef.current = false;
      }
    } catch {
      setSubmitError("Could not finalize intake. Check your connection and try again.");
      submitStartedRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (complete) {
      void finalizeIntake();
    }
  }, [complete, finalizeIntake]);

  /** Advances after 1-tap controls (300ms delay) or Enter on text/number fields. */
  const handleAutoAdvance = useCallback(() => {
    setStepIndex((index) => {
      const step = flatSteps[index];
      if (!step) {
        return index;
      }

      const value = answersRef.current[step.question.id];
      if (!isStepTwoAnswered(value, step.question.required)) {
        return index;
      }

      void saveAnswers({ ...answersRef.current });

      if (index >= flatSteps.length - 1) {
        setComplete(true);
        return index;
      }

      return index + 1;
    });
  }, [flatSteps, saveAnswers]);

  const setAnswer = useCallback(
    (questionId: string, next: unknown, persistImmediately = false) => {
      const merged = { ...answersRef.current, [questionId]: next };
      answersRef.current = merged;
      setAnswers(merged);
      if (persistImmediately) {
        void saveAnswers(merged);
      }
    },
    [saveAnswers],
  );

  if (totalSteps === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-canvas px-4 py-8 text-center">
        <p className="text-base text-ink-muted">
          No follow-up questions are needed right now. You can close this tab.
        </p>
      </div>
    );
  }

  if (!current) {
    return null;
  }

  const canAdvance = isStepTwoAnswered(
    answers[current.question.id],
    current.question.required,
  );

  return (
    <StepTwoChrome
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      current={current}
      saveStatus={saveStatus}
      complete={complete}
      submitError={submitError}
      canAdvance={canAdvance}
      isLastStep={isLastStep}
      onBack={() => setStepIndex((index) => Math.max(0, index - 1))}
      onNext={() => {
        commitAnswers();
        if (isLastStep) {
          setComplete(true);
          return;
        }
        setStepIndex((index) => Math.min(totalSteps - 1, index + 1));
      }}
    >
      <StepTwoQuestionPanel
        step={current}
        value={answers[current.question.id]}
        onValueChange={setAnswer}
        onCommit={commitAnswers}
        onAutoAdvance={handleAutoAdvance}
      />
    </StepTwoChrome>
  );
}
