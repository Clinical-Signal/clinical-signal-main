import { describe, expect, it } from "vitest";

import { SynthesisResolved } from "./schemas/synthesis-resolved.schema";
import {
  STEP_TWO_SYNTHESIS_KEY,
  extractSynthesisResolved,
} from "./step-two-storage";

describe("extractSynthesisResolved", () => {
  it("returns parsed synthesis from step_two", () => {
    const payload = SynthesisResolved.parse({
      clinical_summary: "## Chief Complaint\n\nx\n\n## History of Present Illness (HPI)\n\nx\n\n## Review of Systems (ROS)\n\nx",
      suggested_next_steps: [
        {
          id: "step_one",
          label: "Order baseline labs",
          category: "labs",
          priority: "high",
          rationale: "Establish baseline markers before protocol work.",
        },
        {
          id: "step_two",
          label: "Review sleep hygiene",
          category: "lifestyle",
          priority: "medium",
          rationale: "Sleep data suggests circadian disruption.",
        },
        {
          id: "step_three",
          label: "Schedule follow-up",
          category: "follow_up",
          priority: "medium",
          rationale: "Confirm intake gaps on the next visit.",
        },
      ],
      model_id: "claude-test",
      prompt_version: "v1",
      generated_at: "2026-06-02T12:00:00.000Z",
    });

    const extracted = extractSynthesisResolved({
      [STEP_TWO_SYNTHESIS_KEY]: payload,
      answers: {},
    });

    expect(extracted).toEqual(payload);
  });

  it("returns null when synthesis is missing or invalid", () => {
    expect(extractSynthesisResolved(undefined)).toBeNull();
    expect(extractSynthesisResolved({ [STEP_TWO_SYNTHESIS_KEY]: {} })).toBeNull();
  });
});
