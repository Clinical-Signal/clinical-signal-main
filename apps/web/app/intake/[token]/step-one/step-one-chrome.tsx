"use client";

import type { IntakeStatus } from "@/lib/db/schema/patients-intake";

import { STEP_ONE_SCREENS } from "./step-one-screens";

type StepOneChromeProps = {
  stepIndex: number;
  stepLabel: string;
  intakeStatus: IntakeStatus;
  stepOneComplete: boolean;
  isLastStep: boolean;
  canAdvance: boolean;
  stepTwoHref: string;
  onBack: () => void;
  onNext: () => void;
  children: React.ReactNode;
};

export function StepOneChrome({
  stepIndex,
  stepLabel,
  intakeStatus,
  stepOneComplete,
  isLastStep,
  canAdvance,
  stepTwoHref,
  onBack,
  onNext,
  children,
}: StepOneChromeProps) {
  const progressPct = ((stepIndex + 1) / STEP_ONE_SCREENS.length) * 100;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-canvas px-4 py-6">
      <header className="mb-6 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Step 1 · {stepIndex + 1} of {STEP_ONE_SCREENS.length}
        </p>
        <h1 className="font-serif text-xl text-ink">{stepLabel}</h1>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEP_ONE_SCREENS.length}
          aria-label="Step 1 progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-ink-subtle">Status: {intakeStatus.replaceAll("_", " ")}</p>
      </header>

      <main className="min-w-0 flex-1 pb-8">{children}</main>

      {stepOneComplete ? (
        <div
          className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
          role="status"
        >
          Step 1 is saved.{" "}
          <a
            href={stepTwoHref}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Continue to Step 2 follow-up questions
          </a>
          .
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-line bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
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
