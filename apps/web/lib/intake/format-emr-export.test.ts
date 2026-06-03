import { describe, expect, it } from "vitest";

import { SynthesisResolved } from "./schemas/synthesis-resolved.schema";
import { formatForEMR } from "./format-emr-export";

const SAMPLE: SynthesisResolved = SynthesisResolved.parse({
  clinical_summary: [
    "## Chief Complaint",
    "Patient reports **fatigue** and [digestive](https://example.com) discomfort.",
    "",
    "## History of Present Illness (HPI)",
    "- Onset over 3 months",
    "- Worse with stress",
    "",
    "## Review of Systems (ROS)",
    "GI: bloating. Constitutional: low energy.",
  ].join("\n"),
  suggested_next_steps: [
    {
      id: "sleep_hygiene",
      label: "Discuss sleep hygiene",
      category: "lifestyle",
      priority: "medium",
      rationale: "Fatigue may relate to sleep.",
    },
    {
      id: "baseline_labs",
      label: "Order baseline labs",
      category: "labs",
      priority: "high",
      rationale: "Establish objective markers.",
    },
    {
      id: "follow_up",
      label: "Schedule follow-up",
      category: "follow_up",
      priority: "low",
      rationale: "Confirm intake gaps.",
    },
  ],
  model_id: "test-model",
  prompt_version: "v1",
  generated_at: "2026-06-02T15:00:00.000Z",
});

describe("formatForEMR", () => {
  it("produces plain-text sections with clinical headings and ordered next steps", () => {
    const text = formatForEMR(SAMPLE);

    expect(text).toContain("INTAKE CLINICAL SYNTHESIS");
    expect(text).toContain("CHIEF COMPLAINT");
    expect(text).toContain("fatigue");
    expect(text).not.toContain("**");
    expect(text).not.toContain("https://example.com");
    expect(text).toContain("HISTORY OF PRESENT ILLNESS (HPI)");
    expect(text).toContain("• Onset over 3 months");
    expect(text).toContain("REVIEW OF SYSTEMS (ROS)");
    expect(text).toContain("SUGGESTED NEXT STEPS");
    expect(text.indexOf("Order baseline labs")).toBeLessThan(
      text.indexOf("Discuss sleep hygiene"),
    );
    expect(text).toMatch(/1\. Order baseline labs \[High · Labs\]/);
    expect(text).toContain("Rationale: Establish objective markers.");
  });
});
