import { z } from "zod";

import {
  ClinicalSynthesisOutput,
  SuggestedNextStep,
} from "@/lib/llm/clinical-synthesis.schema";

/** Persisted under `intake_data.step_two._synthesis_resolved` (Phase 7). */
export const SynthesisResolved = ClinicalSynthesisOutput.extend({
  model_id: z.string().min(1).max(128),
  prompt_version: z.string().min(1).max(32),
  generated_at: z.string().datetime(),
});

export type SynthesisResolved = z.infer<typeof SynthesisResolved>;

export { SuggestedNextStep };
