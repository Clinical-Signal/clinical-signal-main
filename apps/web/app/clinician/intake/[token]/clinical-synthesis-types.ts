import type { ClinicalSynthesisOutput } from "@/lib/llm/clinical-synthesis.schema";
import type { SynthesisResolved } from "@/lib/intake/schemas/synthesis-resolved.schema";

export type SynthesisState = "idle" | "loading" | "success" | "error";

export type SynthesisApiSuccess = {
  synthesis: ClinicalSynthesisOutput;
  modelId: string;
  promptVersion: string;
};

export type SynthesisApiError = {
  error?: string;
  message?: string;
  degraded?: boolean;
};

export function toApiSuccess(saved: SynthesisResolved): SynthesisApiSuccess {
  return {
    synthesis: {
      clinical_summary: saved.clinical_summary,
      suggested_next_steps: saved.suggested_next_steps,
    },
    modelId: saved.model_id,
    promptVersion: saved.prompt_version,
  };
}

export function toSynthesisResolved(
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
