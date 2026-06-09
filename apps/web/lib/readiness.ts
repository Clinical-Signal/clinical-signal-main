/**
 * FR-11 / FR-18 / FR-19 — Protocol readiness gate (PRD §5.4).
 * Pure, deterministic evaluator — no DB, no fetch.
 */

export type CheckWeight = "Required" | "High" | "Medium" | "Required-for-high";

export type Check = {
  key: string;
  weight: CheckWeight;
  met: boolean;
  gap?: string;
};

export type ReadinessResult = {
  can_generate: boolean;
  readiness: "ready" | "partial" | "insufficient";
  confidence_ceiling: "low" | "medium" | "high";
  blocking_gaps: string[];
  non_blocking_gaps: string[];
  unconfirmed_ai_fields: string[];
};

export function evaluateReadiness(
  checks: Check[],
  unconfirmedAi: string[],
): ReadinessResult {
  const aiCheck = checks.find((c) => c.key === "ai_confirmed");
  if (!aiCheck) {
    throw new Error("evaluateReadiness: missing required ai_confirmed check");
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
          : "medium";

  return {
    can_generate: readinessLevel !== "insufficient",
    readiness: readinessLevel,
    confidence_ceiling,
    blocking_gaps: blocking.map((c) => c.gap ?? c.key),
    non_blocking_gaps: [...highGaps, ...medGaps].map((c) => c.gap ?? c.key),
    unconfirmed_ai_fields: [...unconfirmedAi],
  };
}
