"use client";

import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

import { SaveIndicator } from "./shared";
import { useStepOneSaveContext } from "./step-one-save-context";
import { STEP_ONE_SCREENS } from "./step-one-screens";

type StepOneChromeProps = {
  stepIndex: number;
  stepLabel: string;
  intakeStatus: IntakeStatus;
  fieldProgressPct: number;
  stepOneComplete: boolean;
  isLastStep: boolean;
  canAdvance: boolean;
  onContinueToStepTwo: () => void;
  onBack: () => void;
  onNext: () => void;
  children: React.ReactNode;
};

export function StepOneChrome({
  stepIndex,
  stepLabel,
  intakeStatus,
  fieldProgressPct,
  stepOneComplete,
  isLastStep,
  canAdvance,
  onContinueToStepTwo,
  onBack,
  onNext,
  children,
}: StepOneChromeProps) {
  const { saveStatus } = useStepOneSaveContext();
  const progressPct = Math.max(0, Math.min(100, fieldProgressPct));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-canvas px-4 py-6">
      <header className="sticky top-0 z-10 -mx-4 mb-6 space-y-3 border-b border-line bg-canvas px-4 pb-4 pt-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Step 1 · {stepIndex + 1} of {STEP_ONE_SCREENS.length}
          </p>
          <SaveIndicator status={saveStatus} />
        </div>
        <h1 className="font-serif text-xl text-ink">{stepLabel}</h1>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Required fields completed"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-ink-subtle">
          {progressPct}% complete · Status: {intakeStatus.replaceAll("_", " ")}
        </p>
      </header>

      <main className="min-w-0 flex-1 pb-8">{children}</main>

      {stepOneComplete ? (
        <div
          className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
          role="status"
        >
          Step 1 is saved.{" "}
          <button
            type="button"
            className="font-medium text-accent underline-offset-2 hover:underline"
            onClick={onContinueToStepTwo}
          >
            Continue to Step 2 follow-up questions
          </button>
          .
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-line bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mb-3 flex justify-end">
          <SaveIndicator status={saveStatus} />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md border border-line-strong bg-surface px-4 text-base font-medium text-ink disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={onBack}
          >
            Back
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md bg-accent px-4 text-base font-medium text-ink-inverse disabled:opacity-40"
            disabled={!canAdvance}
            onClick={onNext}
          >
            {isLastStep ? "Complete step 1" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}
