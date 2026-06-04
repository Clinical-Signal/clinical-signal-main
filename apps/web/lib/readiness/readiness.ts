import type { ReadinessCheck, ReadinessResult } from "./readiness.types";

export type { ReadinessCheck, ReadinessResult } from "./readiness.types";

/**
 * Pure Protocol Readiness Gate (PRD §5.1, ADR-001 §5).
 * Caller must always include an `ai_confirmed` check (met when no AI fields exist).
 */
export function readiness(checks: ReadinessCheck[]): ReadinessResult {
  const aiCheck = checks.find((c) => c.key === "ai_confirmed");
  if (aiCheck === undefined) {
    throw new Error("readiness: missing required ai_confirmed check");
  }

  const blocking = checks.filter((c) => c.weight === "Required" && !c.met);
  const highGaps = checks.filter((c) => c.weight === "High" && !c.met);
  const medGaps = checks.filter((c) => c.weight === "Medium" && !c.met);
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

  const blocking_gaps = blocking.map((c) => c.key);
  const non_blocking_gaps = checks
    .filter(
      (c) =>
        !c.met &&
        (c.weight === "High" ||
          c.weight === "Medium" ||
          c.weight === "Required-for-high"),
    )
    .map((c) => c.key);

  return {
    readiness: readinessLevel,
    confidence_ceiling,
    blocking_gaps,
    non_blocking_gaps,
    can_generate,
  };
}
