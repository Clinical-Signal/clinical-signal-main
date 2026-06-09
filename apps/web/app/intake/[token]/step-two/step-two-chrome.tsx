"use client";

import type { StepTwoFlatStep } from "@/lib/intake/step-two-storage";

import { stepTwoSaveStatusLabel } from "./step-two-utils";

type StepTwoChromeProps = {
  stepIndex: number;
  totalSteps: number;
  current: StepTwoFlatStep;
  saveStatus: string;
  complete: boolean;
  submitError: string | null;
  canAdvance: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  children: React.ReactNode;
};

export function StepTwoChrome({
  stepIndex,
  totalSteps,
  current,
  saveStatus,
  complete,
  submitError,
  canAdvance,
  isLastStep,
  onBack,
  onNext,
  children,
}: StepTwoChromeProps) {
  const progressPct = totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;
  const showModuleHeader = current.questionIndexInModule === 0;
  const statusLabel = stepTwoSaveStatusLabel(saveStatus);

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
            className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {statusLabel ? (
          <p className="text-xs text-ink-subtle" role="status">
            {statusLabel}
          </p>
        ) : null}
      </header>

      <main className="min-w-0 flex-1 pb-8">{children}</main>

      {complete ? (
        <div
          className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
          role="status"
        >
          {submitError ? (
            <p className="text-warning">{submitError}</p>
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
            onClick={onBack}
          >
            Back
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-md bg-accent px-4 text-base font-medium text-ink-inverse disabled:opacity-40"
            disabled={!canAdvance || (complete && isLastStep)}
            onClick={onNext}
          >
            {isLastStep ? "Complete step 2" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}
