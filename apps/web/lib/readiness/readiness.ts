import type { ReadinessCheck, ReadinessResult } from "./readiness.types";

export type { ReadinessCheck, ReadinessResult } from "./readiness.types";

function gapIdentifier(check: ReadinessCheck): string {
  return check.detail ?? check.key;
}

export function readiness(checks: ReadinessCheck[]): ReadinessResult {
  const aiCheck = checks.find((check) => check.key === "ai_confirmed");
  if (!aiCheck) {
    throw new Error(
      "ReadinessCheck invariant violated: ai_confirmed check is required",
    );
  }

  const blocking = checks.filter(
    (check) => check.weight === "Required" && !check.met,
  );
  const highGaps = checks.filter(
    (check) => check.weight === "High" && !check.met,
  );
  const medGaps = checks.filter(
    (check) => check.weight === "Medium" && !check.met,
  );
  const aiUnconfirmed = !aiCheck.met;

  const readinessLevel: ReadinessResult["readiness"] =
    blocking.length > 0
      ? "insufficient"
      : highGaps.length + medGaps.length === 0 && !aiUnconfirmed
        ? "ready"
        : "partial";

  const confidence_ceiling: ReadinessResult["confidence_ceiling"] =
    readinessLevel === "insufficient"
      ? "low"
      : readinessLevel === "ready"
        ? "high"
        : highGaps.length > 0 || aiUnconfirmed
          ? "low"
          : "moderate";

  const can_generate = readinessLevel !== "insufficient";

  const nonBlockingChecks = [
    ...highGaps,
    ...medGaps,
    ...(aiUnconfirmed ? [aiCheck] : []),
  ];

  return {
    readiness: readinessLevel,
    confidence_ceiling,
    blocking_gaps: blocking.map(gapIdentifier),
    non_blocking_gaps: nonBlockingChecks.map(gapIdentifier),
    can_generate,
  };
}
