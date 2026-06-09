"use client";

import { Button } from "@/components/ui/button";
import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";

import type { SynthesisState } from "./clinical-synthesis-types";
import { CopyEmrButton } from "./copy-emr-button";

type ClinicalSynthesisHeaderActionsProps = {
  showGenerateButton: boolean;
  hasSynthesis: boolean;
  state: SynthesisState;
  onGenerate: () => void;
  synthesisForEmr: SynthesisResolved | null;
};

export function ClinicalSynthesisHeaderActions({
  showGenerateButton,
  hasSynthesis,
  state,
  onGenerate,
  synthesisForEmr,
}: ClinicalSynthesisHeaderActionsProps) {
  if (showGenerateButton) {
    return (
      <Button
        type="button"
        variant="primary"
        loading={state === "loading"}
        loadingText="Synthesizing…"
        onClick={() => void onGenerate()}
        disabled={state === "loading"}
      >
        Generate Clinical Draft
      </Button>
    );
  }

  if (!hasSynthesis || !synthesisForEmr) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="primary"
        loading={state === "loading"}
        loadingText="Synthesizing…"
        onClick={() => void onGenerate()}
        disabled={state === "loading"}
      >
        Regenerate draft
      </Button>
      <CopyEmrButton synthesis={synthesisForEmr} />
    </div>
  );
}
