import { describe, expect, it } from "vitest";

import {
  readiness,
  type ReadinessCheck,
  type ReadinessResult,
} from "./readiness";

/** §0.2 check order: R1 R2 R3 H1 H2 M1 AI */
const CHECK_ORDER = [
  {
    key: "step1_complete",
    label: "Step-1 intake complete",
    weight: "Required" as const,
  },
  {
    key: "triggered_deep_dives_answered",
    label: "Triggered deep dives answered",
    weight: "Required" as const,
  },
  {
    key: "safety_flags_reviewed",
    label: "Safety flags reviewed",
    weight: "Required" as const,
  },
  {
    key: "medications_detailed",
    label: "Medications detailed",
    weight: "High" as const,
  },
  {
    key: "labs_present_or_waived",
    label: "Labs present or waived",
    weight: "High" as const,
  },
  {
    key: "transcripts_verified",
    label: "Transcripts verified",
    weight: "Medium" as const,
  },
  {
    key: "ai_confirmed",
    label: "AI-derived fields confirmed",
    weight: "Required-for-high" as const,
  },
] satisfies ReadonlyArray<{
  key: ReadinessCheck["key"];
  label: string;
  weight: ReadinessCheck["weight"];
}>;

/** Builds a `ReadinessCheck[]` from §0.2 notation (`✓` met / `✗` unmet). */
function buildChecks(notation: string): ReadinessCheck[] {
  const symbols = [...notation];
  if (symbols.length !== CHECK_ORDER.length) {
    throw new Error(
      `Expected ${CHECK_ORDER.length} check symbols, got ${symbols.length}`,
    );
  }

  return CHECK_ORDER.map((spec, index) => {
    const symbol = symbols[index];
    if (symbol !== "✓" && symbol !== "✗") {
      throw new Error(`Invalid symbol "${symbol}" at index ${index}`);
    }

    return {
      key: spec.key,
      label: spec.label,
      weight: spec.weight,
      met: symbol === "✓",
    };
  });
}

/** D-RG-3: callers must not consume `confidence_ceiling` when generation is blocked. */
function confidenceCeilingForGeneration(
  result: ReadinessResult,
): ReadinessResult["confidence_ceiling"] | undefined {
  return result.can_generate ? result.confidence_ceiling : undefined;
}

describe("readiness gate (§3 Readiness Gate Matrix)", () => {
  it("RG-01", () => {
    const result = readiness(buildChecks("✓✓✓✓✓✓✓"));

    expect(result.readiness).toBe("ready");
    expect(result.confidence_ceiling).toBe("high");
    expect(result.can_generate).toBe(true);
  });

  it("RG-02", () => {
    const result = readiness(buildChecks("✓✓✓✓✓✓✗"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-03", () => {
    const result = readiness(buildChecks("✓✓✓✓✓✗✓"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("moderate");
    expect(result.can_generate).toBe(true);
  });

  it("RG-04", () => {
    const result = readiness(buildChecks("✓✓✓✓✓✗✗"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-05", () => {
    const result = readiness(buildChecks("✓✓✓✗✓✓✓"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-06", () => {
    const result = readiness(buildChecks("✓✓✓✓✗✓✓"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-07", () => {
    const result = readiness(buildChecks("✓✓✓✗✗✓✓"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-08", () => {
    const result = readiness(buildChecks("✓✓✓✗✓✗✓"));

    expect(result.readiness).toBe("partial");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(true);
  });

  it("RG-09", () => {
    const result = readiness(buildChecks("✗✓✓✓✓✓✓"));

    expect(result.readiness).toBe("insufficient");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(false);
  });

  it("RG-10", () => {
    const result = readiness(buildChecks("✗✓✓✓✓✓✓"));

    expect(result.readiness).toBe("insufficient");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(false);
    expect(result.blocking_gaps).toContain("step1_complete");
  });

  it("RG-11", () => {
    const result = readiness(buildChecks("✓✗✓✓✓✓✓"));

    expect(result.readiness).toBe("insufficient");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(false);
  });

  it("RG-12", () => {
    const result = readiness(buildChecks("✓✓✗✓✓✓✓"));

    expect(result.readiness).toBe("insufficient");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(false);
  });

  it("RG-13", () => {
    const result = readiness(buildChecks("✗✗✗✓✓✓✓"));

    expect(result.readiness).toBe("insufficient");
    expect(result.confidence_ceiling).toBe("low");
    expect(result.can_generate).toBe(false);
    expect(result.blocking_gaps).toHaveLength(3);
  });

  it("RG-14", () => {
    const result = readiness(buildChecks("✗✓✓✗✓✓✓"));

    expect(result.readiness).toBe("insufficient");
  });

  it("RG-15", () => {
    const result = readiness(buildChecks("✗✓✓✗✗✗✗"));

    expect(result.readiness).toBe("insufficient");
  });

  it("RG-16", () => {
    const result = readiness(buildChecks("✓✗✓✓✓✓✗"));

    expect(result.readiness).toBe("insufficient");
  });

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

  it("RG-20", () => {
    const result = readiness(buildChecks("✗✓✓✓✓✓✓"));

    expect(result.can_generate).toBe(false);
    expect(result.confidence_ceiling).toBe("low");
    expect(confidenceCeilingForGeneration(result)).toBeUndefined();
  });

  it("RG-21", () => {
    const checks = buildChecks("✓✓✓✓✓✓✓").filter(
      (check) => check.key !== "ai_confirmed",
    );

    expect(() => readiness(checks)).toThrow();
  });

  it("RG-22", () => {
    const result = readiness(buildChecks("✓✓✓✓✓✓✓"));

    expect(result.readiness).toBe("ready");
    expect(result.confidence_ceiling).toBe("high");
    expect(result.can_generate).toBe(true);
  });

  it("RG-23", () => {
    expect(() => readiness([])).toThrow();
  });

  it("RG-24", () => {
    const checks: ReadinessCheck[] = [
      ...buildChecks("✓✓✓✓✓✓✓").filter(
        (check) => check.key !== "ai_confirmed",
      ),
      {
        key: "ai_confirmed",
        label: "AI-derived fields confirmed (first)",
        weight: "Required-for-high",
        met: true,
      },
      {
        key: "ai_confirmed",
        label: "AI-derived fields confirmed (duplicate)",
        weight: "Required-for-high",
        met: false,
      },
    ];

    const result = readiness(checks);

    expect(result.readiness).toBe("ready");
    expect(result.confidence_ceiling).toBe("high");
    expect(result.can_generate).toBe(true);
  });
});
