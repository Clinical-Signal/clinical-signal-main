import { describe, expect, it } from "vitest";

import { ClinicalSynthesisOutput } from "./clinical-synthesis.schema";

const VALID = {
  clinical_summary: [
    "## Chief Complaint",
    "Patient reports fatigue.",
    "",
    "## History of Present Illness (HPI)",
    "Gradual onset over months.",
    "",
    "## Review of Systems (ROS)",
    "- Constitutional: Low energy reported.",
  ].join("\n"),
  suggested_next_steps: [
    {
      id: "visit_review",
      label: "Review intake at initial visit",
      category: "follow_up",
      priority: "high",
      rationale: "Baseline intake completed; confirm narrative with patient.",
    },
    {
      id: "consider_labs",
      label: "Consider foundational labs",
      category: "labs",
      priority: "medium",
      rationale: "Broad symptoms warrant objective baseline markers.",
    },
    {
      id: "sleep_foundations",
      label: "Discuss sleep foundations",
      category: "lifestyle",
      priority: "low",
      rationale: "Fatigue may relate to sleep patterns noted in intake.",
    },
  ],
};

describe("ClinicalSynthesisOutput", () => {
  it("accepts a well-formed synthesis object", () => {
    const parsed = ClinicalSynthesisOutput.parse(VALID);
    expect(parsed.suggested_next_steps).toHaveLength(3);
    expect(parsed.clinical_summary).toContain("## Chief Complaint");
  });

  it("rejects clinical_summary missing required headings", () => {
    expect(() =>
      ClinicalSynthesisOutput.parse({
        ...VALID,
        clinical_summary: "Unstructured note without section headings.",
      }),
    ).toThrow(/clinical_summary must include heading/);
  });

  it("rejects fewer than three suggested_next_steps", () => {
    expect(() =>
      ClinicalSynthesisOutput.parse({
        ...VALID,
        suggested_next_steps: VALID.suggested_next_steps.slice(0, 2),
      }),
    ).toThrow();
  });

  it("rejects duplicate suggested_next_steps ids", () => {
    expect(() =>
      ClinicalSynthesisOutput.parse({
        ...VALID,
        suggested_next_steps: [
          ...VALID.suggested_next_steps,
          { ...VALID.suggested_next_steps[0] },
        ],
      }),
    ).toThrow(/duplicate step id/);
  });
});
