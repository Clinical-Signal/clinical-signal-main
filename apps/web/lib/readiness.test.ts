/**
 * FR-11 — table-driven readiness gate tests (PRD §5.4).
 */
import { describe, expect, it } from "vitest";
import { evaluateReadiness, type Check } from "./readiness";

const BASE_CHECKS: Check[] = [
  { key: "intake_step1", weight: "Required", met: true },
  { key: "intake_required_sections", weight: "Required", met: true },
  { key: "triggered_deep_dives", weight: "Required", met: true },
  { key: "safety_flags_reviewed", weight: "Required", met: true },
  { key: "medications_detailed", weight: "High", met: true },
  { key: "labs_present", weight: "High", met: true },
  { key: "transcripts_verified", weight: "Medium", met: true },
  { key: "ai_confirmed", weight: "Required-for-high", met: true },
];

function withPattern(pattern: string): Check[] {
  const marks = [...pattern];
  if (marks.length !== BASE_CHECKS.length) {
    throw new Error(`pattern must be ${BASE_CHECKS.length} chars`);
  }
  return BASE_CHECKS.map((template, i) => ({
    ...template,
    met: marks[i] === "1",
  }));
}

describe("evaluateReadiness (PRD §5.4)", () => {
  it("all checks met with no unconfirmed AI → ready / high / can generate", () => {
    const result = evaluateReadiness(BASE_CHECKS, []);
    expect(result).toEqual({
      can_generate: true,
      readiness: "ready",
      confidence_ceiling: "high",
      blocking_gaps: [],
      non_blocking_gaps: [],
      unconfirmed_ai_fields: [],
    });
  });

  it("required check unmet → insufficient, cannot generate", () => {
    const result = evaluateReadiness(withPattern("01111111"), []);
    expect(result.readiness).toBe("insufficient");
    expect(result.can_generate).toBe(false);
    expect(result.confidence_ceiling).toBe("low");
    expect(result.blocking_gaps).toContain("intake_step1");
  });

  it("partial with High gap → low confidence ceiling", () => {
    const result = evaluateReadiness(withPattern("11110111"), []);
    expect(result.readiness).toBe("partial");
    expect(result.can_generate).toBe(true);
    expect(result.confidence_ceiling).toBe("low");
    expect(result.non_blocking_gaps).toContain("medications_detailed");
  });

  it("partial with Medium gap only → medium confidence ceiling", () => {
    const result = evaluateReadiness(withPattern("11111101"), []);
    expect(result.readiness).toBe("partial");
    expect(result.can_generate).toBe(true);
    expect(result.confidence_ceiling).toBe("medium");
    expect(result.non_blocking_gaps).toEqual(["transcripts_verified"]);
  });

  it("unconfirmed AI forces low ceiling even when other checks pass", () => {
    const result = evaluateReadiness(withPattern("11111110"), []);
    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("returns unconfirmed_ai_fields from input array", () => {
    const fields = ["symptoms.fatigue", "medications.prescriptions[0].dosage"];
    const result = evaluateReadiness(BASE_CHECKS, fields);
    expect(result.unconfirmed_ai_fields).toEqual(fields);
    expect(result.readiness).toBe("ready");
  });

  it("multiple required failures list all blocking gaps", () => {
    const result = evaluateReadiness(withPattern("00011111"), []);
    expect(result.blocking_gaps).toEqual([
      "intake_step1",
      "intake_required_sections",
      "triggered_deep_dives",
    ]);
  });

  it("throws when ai_confirmed check is missing", () => {
    const withoutAi = BASE_CHECKS.filter((c) => c.key !== "ai_confirmed");
    expect(() => evaluateReadiness(withoutAi, [])).toThrow(/ai_confirmed/);
  });

  it("uses custom gap labels when provided", () => {
    const checks: Check[] = [
      ...BASE_CHECKS.slice(0, 4),
      {
        key: "medications_detailed",
        weight: "High",
        met: false,
        gap: "medications_missing_dose_or_duration",
      },
      ...BASE_CHECKS.slice(5),
    ];
    const result = evaluateReadiness(checks, []);
    expect(result.non_blocking_gaps).toContain("medications_missing_dose_or_duration");
  });
});
