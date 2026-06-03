"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalSynthesisOutput } from "@/lib/llm/clinical-synthesis.schema";
import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";

import { CopyEmrButton } from "./copy-emr-button";
import { ClinicalSummaryDisplay } from "./clinical-summary-display";
import { SuggestedStepsList } from "./suggested-steps-list";

type SynthesisState = "idle" | "loading" | "success" | "error";

type SynthesisApiSuccess = {
  synthesis: ClinicalSynthesisOutput;
  modelId: string;
  promptVersion: string;
};

type SynthesisApiError = {
  error?: string;
  message?: string;
};

type ClinicalSynthesisViewProps = {
  token: string;
  savedSynthesis: SynthesisResolved | null;
};

function toApiSuccess(saved: SynthesisResolved): SynthesisApiSuccess {
  return {
    synthesis: {
      clinical_summary: saved.clinical_summary,
      suggested_next_steps: saved.suggested_next_steps,
    },
    modelId: saved.model_id,
    promptVersion: saved.prompt_version,
  };
}

function toSynthesisResolved(
  api: SynthesisApiSuccess,
  saved: SynthesisResolved | null,
): SynthesisResolved {
  return {
    clinical_summary: api.synthesis.clinical_summary,
    suggested_next_steps: api.synthesis.suggested_next_steps,
    model_id: api.modelId,
    prompt_version: api.promptVersion,
    generated_at: saved?.generated_at ?? new Date().toISOString(),
  };
}

export function ClinicalSynthesisView({
  token,
  savedSynthesis,
}: ClinicalSynthesisViewProps) {
  const initialResult = useMemo(
    () => (savedSynthesis ? toApiSuccess(savedSynthesis) : null),
    [savedSynthesis],
  );

  const [state, setState] = useState<SynthesisState>(
    initialResult ? "success" : "idle",
  );
  const [result, setResult] = useState<SynthesisApiSuccess | null>(initialResult);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const generateDraft = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    let response: Response;
    try {
      response = await fetch(
        `/api/clinician/intake/${encodeURIComponent(token)}/synthesize`,
        { method: "POST" },
      );
    } catch {
      setState("error");
      setErrorMessage(
        "Could not reach the server. Check your connection and try again.",
      );
      return;
    }

    let payload: SynthesisApiSuccess | SynthesisApiError;
    try {
      payload = (await response.json()) as SynthesisApiSuccess | SynthesisApiError;
    } catch {
      setState("error");
      setErrorMessage("Received an invalid response from the server.");
      return;
    }

    if (!response.ok) {
      setState("error");
      const err = payload as SynthesisApiError;
      setErrorMessage(
        err.message ??
          "Clinical synthesis failed. The AI service may be unavailable — try again shortly.",
      );
      return;
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !("synthesis" in payload) ||
      !payload.synthesis?.clinical_summary
    ) {
      setState("error");
      setErrorMessage("Synthesis completed but the response was incomplete.");
      return;
    }

    setResult(payload as SynthesisApiSuccess);
    setState("success");
  }, [token]);

  return (
    <section className="mb-10 rounded-lg border border-line bg-surface">
      <header className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="font-serif text-xl text-ink">Clinical synthesis</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            {savedSynthesis
              ? "Saved clinical draft from the last synthesis run."
              : "Generate a draft note (Chief Complaint, HPI, ROS) and suggested next steps from the full intake."}
          </p>
        </div>
        {!result ? (
          <Button
            type="button"
            variant="primary"
            loading={state === "loading"}
            loadingText="Synthesizing…"
            onClick={() => void generateDraft()}
            disabled={state === "loading"}
          >
            Generate Clinical Draft
          </Button>
        ) : null}
      </header>

      <div className="px-5 py-5 sm:px-6">
        {state === "idle" && !result ? (
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
              {savedSynthesis && state !== "loading"
                ? "Saved draft"
                : "Draft generated"}
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

            <div className="flex flex-wrap gap-3 pt-2">
              <CopyEmrButton
                synthesis={toSynthesisResolved(result, savedSynthesis)}
              />
              <Button
                type="button"
                variant="secondary"
                loading={state === "loading"}
                loadingText="Synthesizing…"
                onClick={() => void generateDraft()}
              >
                Regenerate draft
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
