"use client";

import { useMemo } from "react";

import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";

import { ClinicalSummaryDisplay } from "./clinical-summary-display";
import { ClinicalSynthesisHeaderActions } from "./clinical-synthesis-header-actions";
import { toApiSuccess, toSynthesisResolved } from "./clinical-synthesis-types";
import { SuggestedStepsList } from "./suggested-steps-list";
import { useClinicalSynthesisGenerate } from "./use-clinical-synthesis-generate";

type ClinicalSynthesisViewProps = {
  token: string;
  savedSynthesis: SynthesisResolved | null;
};

export function ClinicalSynthesisView({
  token,
  savedSynthesis,
}: ClinicalSynthesisViewProps) {
  const initialResult = useMemo(
    () => (savedSynthesis ? toApiSuccess(savedSynthesis) : null),
    [savedSynthesis],
  );

  const { state, result, errorMessage, generateDraft } = useClinicalSynthesisGenerate(
    token,
    initialResult,
  );

  const hasSynthesis = Boolean(savedSynthesis ?? result);
  const showGenerateButton = !hasSynthesis;
  const synthesisForEmr =
    result != null ? toSynthesisResolved(result, savedSynthesis) : null;

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="font-serif text-xl text-ink">Clinical synthesis</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            {savedSynthesis
              ? "Saved clinical draft from the last synthesis run."
              : result
                ? "Clinical draft generated and saved to this patient record."
                : "Generate a draft note (Chief Complaint, HPI, ROS) and suggested next steps from the full intake."}
          </p>
        </div>
        <ClinicalSynthesisHeaderActions
          showGenerateButton={showGenerateButton}
          hasSynthesis={hasSynthesis}
          state={state}
          onGenerate={generateDraft}
          synthesisForEmr={synthesisForEmr}
        />
      </header>

      <div className="px-5 py-5 sm:px-6">
        {state === "loading" ? (
          <p className="text-sm text-ink-muted" aria-live="polite">
            Synthesizing intake into a clinical draft… This may take up to a minute.
          </p>
        ) : null}

        {showGenerateButton && state === "idle" ? (
          <p className="text-sm text-ink-muted">
            Click the button above when you are ready to synthesize Step 1 and Step 2
            into a clinician-facing draft.
          </p>
        ) : null}

        {state === "error" && errorMessage ? (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {errorMessage}
          </p>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-8">
            <p className="text-xs text-ink-subtle">
              {savedSynthesis ? "Saved draft" : "Draft generated"}
              {" · "}
              model {result.modelId} · prompt {result.promptVersion}
              {savedSynthesis?.generated_at
                ? ` · saved ${new Date(savedSynthesis.generated_at).toLocaleString()}`
                : null}
            </p>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                Clinical note
              </h3>
              <ClinicalSummaryDisplay
                clinicalSummary={result.synthesis.clinical_summary}
              />
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                Suggested next steps
              </h3>
              <SuggestedStepsList steps={result.synthesis.suggested_next_steps} />
            </div>

          </div>
        ) : null}
      </div>
    </section>
  );
}
