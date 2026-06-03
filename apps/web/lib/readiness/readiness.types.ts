export type ReadinessCheck = {
  key: string;
  label: string;
  weight: "Required" | "High" | "Medium" | "Required-for-high";
  met: boolean;
  detail?: string;
};

export type ReadinessResult = {
  readiness: "ready" | "partial" | "insufficient";
  confidence_ceiling: "high" | "moderate" | "low";
  blocking_gaps: string[];
  non_blocking_gaps: string[];
  can_generate: boolean;
};
