import { Spinner } from "@/components/ui/button";

/** Shown while Step 1 hands off to Step 2 and the chat interviewer boots. */
export const INTAKE_STEP_TRANSITION_MESSAGE =
  "Thanks for your intake. We're processing it now. Stand by.";

export function IntakeTransitionLoader() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas px-6 py-10"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-auto w-full max-w-md space-y-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          Clinical Signal
        </p>
        <div className="space-y-5 rounded-lg border border-line bg-surface p-6 shadow-sm">
          <Spinner className="mx-auto h-7 w-7 text-accent" />
          <p className="text-base font-medium leading-relaxed text-ink">
            {INTAKE_STEP_TRANSITION_MESSAGE}
          </p>
        </div>
      </div>
    </div>
  );
}
