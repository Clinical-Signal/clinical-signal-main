/**
 * Readiness Gate — Phase 2 TDD scaffold.
 * Matrix: docs/architecture/phase-2-test-matrix.md §3 (RG-01–RG-24), inputs §0.2.
 */
import { describe, expect, it } from "vitest";
import type { ReadinessCheck, ReadinessResult } from "./readiness.types";
import { readiness } from "./readiness";

/** §0.2 order: R1 R2 R3 H1 H2 M1 AI */
const CHECK_ORDER: ReadinessCheck[] = [
  {
    key: "step1_complete",
    label: "Step 1 complete",
    weight: "Required",
    met: true,
  },
  {
    key: "triggered_deep_dives_answered",
    label: "Triggered deep dives answered",
    weight: "Required",
    met: true,
  },
  {
    key: "safety_flags_reviewed",
    label: "Safety flags reviewed",
    weight: "Required",
    met: true,
  },
  {
    key: "medications_detailed",
    label: "Medications detailed",
    weight: "High",
    met: true,
  },
  {
    key: "labs_present_or_waived",
    label: "Labs present or waived",
    weight: "High",
    met: true,
  },
  {
    key: "transcripts_verified",
    label: "Transcripts verified",
    weight: "Medium",
    met: true,
  },
  {
    key: "ai_confirmed",
    label: "AI fields confirmed",
    weight: "Required-for-high",
    met: true,
  },
];

/** Pattern: seven chars, `✓` met / `✗` unmet (§0.2). */
function buildChecks(pattern: string): ReadinessCheck[] {
  const marks = [...pattern];
  if (marks.length !== CHECK_ORDER.length) {
    throw new Error(`pattern must be ${CHECK_ORDER.length} chars, got ${pattern}`);
  }
  return CHECK_ORDER.map((template, i) => ({
    ...template,
    met: marks[i] === "✓",
  }));
}

/** D-RG-3: callers must not consume ceiling when generation is blocked. */
function confidenceCeilingForGeneration(
  result: ReadinessResult,
): ReadinessResult["confidence_ceiling"] | undefined {
  if (!result.can_generate) {
    return undefined;
  }
  return result.confidence_ceiling;
}

function assertTriple(
  result: ReadinessResult,
  expected: {
    readiness: ReadinessResult["readiness"];
    confidence_ceiling: ReadinessResult["confidence_ceiling"];
    can_generate: boolean;
  },
): void {
  expect(result.readiness).toBe(expected.readiness);
  expect(result.confidence_ceiling).toBe(expected.confidence_ceiling);
  expect(result.can_generate).toBe(expected.can_generate);
}

describe("readiness gate (PRD §5.1)", () => {
  describe("§3.1 nine logical states", () => {
    it("RG-01", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✓✓✓")), {
        readiness: "ready",
        confidence_ceiling: "high",
        can_generate: true,
      });
    });

    it("RG-02", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✓✓✗")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-03", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✓✗✓")), {
        readiness: "partial",
        confidence_ceiling: "moderate",
        can_generate: true,
      });
    });

    it("RG-04", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✓✗✗")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-05", () => {
      assertTriple(readiness(buildChecks("✓✓✓✗✓✓✓")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-06", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✗✓✓")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-07", () => {
      assertTriple(readiness(buildChecks("✓✓✓✗✗✓✓")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-08", () => {
      assertTriple(readiness(buildChecks("✓✓✓✗✓✗✓")), {
        readiness: "partial",
        confidence_ceiling: "low",
        can_generate: true,
      });
    });

    it("RG-09", () => {
      assertTriple(readiness(buildChecks("✗✓✓✓✓✓✓")), {
        readiness: "insufficient",
        confidence_ceiling: "low",
        can_generate: false,
      });
    });
  });

  describe("§3.2 required-check isolation", () => {
    it("RG-10", () => {
      const result = readiness(buildChecks("✗✓✓✓✓✓✓"));
      assertTriple(result, {
        readiness: "insufficient",
        confidence_ceiling: "low",
        can_generate: false,
      });
      expect(result.blocking_gaps).toContain("step1_complete");
    });

    it("RG-11", () => {
      assertTriple(readiness(buildChecks("✓✗✓✓✓✓✓")), {
        readiness: "insufficient",
        confidence_ceiling: "low",
        can_generate: false,
      });
    });

    it("RG-12", () => {
      assertTriple(readiness(buildChecks("✓✓✗✓✓✓✓")), {
        readiness: "insufficient",
        confidence_ceiling: "low",
        can_generate: false,
      });
    });

    it("RG-13", () => {
      const result = readiness(buildChecks("✗✗✗✓✓✓✓"));
      assertTriple(result, {
        readiness: "insufficient",
        confidence_ceiling: "low",
        can_generate: false,
      });
      expect(result.blocking_gaps).toHaveLength(3);
    });
  });

  describe("§3.3 required dominates", () => {
    it("RG-14", () => {
      const result = readiness(buildChecks("✗✓✓✗✓✓✓"));
      expect(result.readiness).toBe("insufficient");
      expect(result.can_generate).toBe(false);
      expect(confidenceCeilingForGeneration(result)).toBeUndefined();
    });

    it("RG-15", () => {
      const result = readiness(buildChecks("✗✓✓✗✗✗✗"));
      expect(result.readiness).toBe("insufficient");
      expect(result.can_generate).toBe(false);
    });

    it("RG-16", () => {
      const result = readiness(buildChecks("✓✗✓✓✓✓✗"));
      expect(result.readiness).toBe("insufficient");
      expect(result.can_generate).toBe(false);
    });
  });

  describe("§3.4 gap-list content", () => {
    it("RG-17", () => {
      const result = readiness(buildChecks("✓✓✓✗✓✗✓"));
      expect(result.blocking_gaps).toEqual([]);
      expect(result.non_blocking_gaps).toEqual([
        "medications_detailed",
        "transcripts_verified",
      ]);
    });

    it("RG-18", () => {
      const result = readiness(buildChecks("✗✓✓✗✓✗✓"));
      expect(result.blocking_gaps).toEqual(["step1_complete"]);
      expect(result.non_blocking_gaps).toEqual([
        "medications_detailed",
        "transcripts_verified",
      ]);
    });

    it("RG-19", () => {
      const result = readiness(buildChecks("✓✓✓✓✓✓✗"));
      expect(result.blocking_gaps).toEqual([]);
      expect(result.non_blocking_gaps).toEqual(["ai_confirmed"]);
    });
  });

  describe("§3.5 invariants and architectural assertions", () => {
    it("RG-20", () => {
      const result = readiness(buildChecks("✗✓✓✓✓✓✓"));
      expect(result.can_generate).toBe(false);
      expect(confidenceCeilingForGeneration(result)).toBeUndefined();
    });

    it("RG-21", () => {
      const withoutAi = buildChecks("✓✓✓✓✓✓✓").filter(
        (c) => c.key !== "ai_confirmed",
      );
      expect(() => readiness(withoutAi)).toThrow();
    });

    it("RG-22", () => {
      assertTriple(readiness(buildChecks("✓✓✓✓✓✓✓")), {
        readiness: "ready",
        confidence_ceiling: "high",
        can_generate: true,
      });
    });

    it("RG-23", () => {
      expect(() => readiness([])).toThrow();
    });

    it("RG-24", () => {
      const base = buildChecks("✓✓✓✓✓✓✓").filter(
        (c) => c.key !== "ai_confirmed",
      );
      const checks: ReadinessCheck[] = [
        ...base,
        {
          key: "ai_confirmed",
          label: "AI (first)",
          weight: "Required-for-high",
          met: true,
        },
        {
          key: "ai_confirmed",
          label: "AI (duplicate)",
          weight: "Required-for-high",
          met: false,
        },
      ];
      assertTriple(readiness(checks), {
        readiness: "ready",
        confidence_ceiling: "high",
        can_generate: true,
      });
    });
  });
});
