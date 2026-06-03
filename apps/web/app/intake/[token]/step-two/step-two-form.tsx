"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildFlatSteps,
  type StepTwoFlatStep,
} from "@/lib/intake/step-two-storage";
import type { QuestionPlanResolved } from "@/lib/intake/schemas/question-plan.schema";

import { QuestionControl } from "./controls/question-control";
import { useStepTwoAutosave } from "./use-step-two-autosave";

export type StepTwoFormProps = {
  token: string;
  plan: QuestionPlanResolved;
  initialAnswers: Record<string, unknown>;
};

function isAnswered(value: unknown, required: boolean): boolean {
  if (!required) {
    return true;
  }
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function saveStatusLabel(status: string): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Could not save — try again";
    default:
      return "";
  }
}

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
  const progressPct = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;
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

  const handleAutoAdvance = useCallback(() => {
    const step = flatSteps[stepIndex];
    if (!step) {
      return;
    }

    const value = answersRef.current[step.question.id];
    if (!isAnswered(value, step.question.required)) {
      return;
    }

    commitAnswers();

    if (stepIndex >= totalSteps - 1) {
      setComplete(true);
      return;
    }

    setStepIndex((index) => Math.min(totalSteps - 1, index + 1));
  }, [commitAnswers, flatSteps, stepIndex, totalSteps]);

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

  const currentValue = answers[current.question.id];
  const canAdvance = isAnswered(currentValue, current.question.required);

  const showModuleHeader = current.questionIndexInModule === 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-canvas px-4 py-6">
      <header className="mb-6 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Step 2 · {stepIndex + 1} of {totalSteps}
        </p>
        {showModuleHeader ? (
          <div className="space-y-1">
            <h1 className="font-serif text-xl text-ink">{current.moduleLabel}</h1>
            <p className="text-sm text-ink-muted">{current.moduleRationale}</p>
          </div>
        ) : (
          <h1 className="font-serif text-xl text-ink">{current.moduleLabel}</h1>
        )}
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label="Step 2 progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {saveStatusLabel(saveStatus) ? (
          <p className="text-xs text-ink-subtle" role="status">
            {saveStatusLabel(saveStatus)}
          </p>
        ) : null}
      </header>

      <main className="flex-1 pb-8">
        <fieldset className="space-y-4">
          <legend className="text-base font-medium text-ink">{current.question.prompt}</legend>
          {current.question.help_text ? (
            <p className="text-sm text-ink-muted">{current.question.help_text}</p>
          ) : null}
          <QuestionControl
            question={current.question}
            value={currentValue}
            onValueChange={setAnswer}
            onCommit={commitAnswers}
            onAutoAdvance={handleAutoAdvance}
          />
        </fieldset>
      </main>

      {complete ? (
        <div
          className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
          role="status"
        >
          {submitError ? (
            <p className="text-warn">{submitError}</p>
          ) : (
            <p>
              Thank you — your intake is complete. You can close this tab; this link will no
              longer work.
            </p>
          )}
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-line bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md border border-line-strong bg-surface px-4 text-base font-medium text-ink disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          >
            Back
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md bg-accent px-4 text-base font-medium text-ink-inverse disabled:opacity-40"
            disabled={!canAdvance || (complete && isLastStep)}
            onClick={() => {
              commitAnswers();
              if (isLastStep) {
                setComplete(true);
                return;
              }
              setStepIndex((index) => Math.min(totalSteps - 1, index + 1));
            }}
          >
            {isLastStep ? "Complete step 2" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}
