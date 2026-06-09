import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";
import { RbacDeniedError } from "@/lib/auth/require-role";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/records", () => ({
  patientBelongsToTenant: vi.fn(),
}));

vi.mock("@/lib/analysis", () => ({
  analyzeAndGenerate: vi.fn(),
}));

vi.mock("@/lib/readiness/protocol-generation-gate", () => {
  class ProtocolReadinessBlockedError extends Error {
    readonly result: {
      can_generate: boolean;
      readiness: "ready" | "partial" | "insufficient";
      confidence_ceiling: "low" | "medium" | "high";
      blocking_gaps: string[];
      non_blocking_gaps: string[];
      unconfirmed_ai_fields: string[];
    };

    constructor(result: ProtocolReadinessBlockedError["result"]) {
      super(`Readiness gate failed: ${result.blocking_gaps.join(", ")}`);
      this.name = "ProtocolReadinessBlockedError";
      this.result = result;
    }
  }

  return {
    assertProtocolReadinessForGeneration: vi.fn(),
    ProtocolReadinessBlockedError,
  };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("generateProtocolAction RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies viewer with RbacDeniedError before any DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { generateProtocolAction } = await import("./actions");
    const { analyzeAndGenerate } = await import("@/lib/analysis");

    await expect(
      generateProtocolAction("00000000-0000-0000-0000-000000000010"),
    ).rejects.toBeInstanceOf(RbacDeniedError);
    expect(analyzeAndGenerate).not.toHaveBeenCalled();
  });
});

describe("generateProtocolAction readiness gate (FR-18, FR-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks generation when can_generate is false", async () => {
    const { requireAuth } = await import("@/lib/auth");
    const { patientBelongsToTenant } = await import("@/lib/records");
    const { assertProtocolReadinessForGeneration, ProtocolReadinessBlockedError } =
      await import("@/lib/readiness/protocol-generation-gate");
    const { analyzeAndGenerate } = await import("@/lib/analysis");

    vi.mocked(requireAuth).mockResolvedValue({
      tenantId: "00000000-0000-0000-0000-000000000001",
      practitionerId: "00000000-0000-0000-0000-000000000099",
      sessionId: "00000000-0000-0000-0000-000000000097",
      role: "practitioner",
      lifecycleStatus: "active",
      email: "practitioner@example.com",
      name: "Practitioner Test",
    });
    vi.mocked(patientBelongsToTenant).mockResolvedValue(true);
    vi.mocked(assertProtocolReadinessForGeneration).mockRejectedValue(
      new ProtocolReadinessBlockedError({
        can_generate: false,
        readiness: "insufficient",
        confidence_ceiling: "low",
        blocking_gaps: ["intake_step1_not_submitted"],
        non_blocking_gaps: [],
        unconfirmed_ai_fields: [],
      }),
    );

    const { generateProtocolAction } = await import("./actions");
    const result = await generateProtocolAction("00000000-0000-0000-0000-000000000010");

    expect(result).toEqual({
      ok: false,
      error: "Readiness gate failed: intake_step1_not_submitted",
    });
    expect(analyzeAndGenerate).not.toHaveBeenCalled();
  });

  it("passes confidence_ceiling into analyzeAndGenerate when gate passes", async () => {
    const { requireAuth } = await import("@/lib/auth");
    const { patientBelongsToTenant } = await import("@/lib/records");
    const { assertProtocolReadinessForGeneration } = await import(
      "@/lib/readiness/protocol-generation-gate"
    );
    const { analyzeAndGenerate } = await import("@/lib/analysis");
    const { redirect } = await import("next/navigation");

    vi.mocked(requireAuth).mockResolvedValue({
      tenantId: "00000000-0000-0000-0000-000000000001",
      practitionerId: "00000000-0000-0000-0000-000000000099",
      sessionId: "00000000-0000-0000-0000-000000000097",
      role: "practitioner",
      lifecycleStatus: "active",
      email: "practitioner@example.com",
      name: "Practitioner Test",
    });
    vi.mocked(patientBelongsToTenant).mockResolvedValue(true);
    vi.mocked(assertProtocolReadinessForGeneration).mockResolvedValue({
      can_generate: true,
      readiness: "partial",
      confidence_ceiling: "medium",
      blocking_gaps: [],
      non_blocking_gaps: ["transcripts_not_verified"],
      unconfirmed_ai_fields: [],
    });
    vi.mocked(analyzeAndGenerate).mockResolvedValue({
      analysisId: "analysis-1",
      protocolId: "protocol-1",
    });

    const { generateProtocolAction } = await import("./actions");
    await generateProtocolAction("00000000-0000-0000-0000-000000000010");

    expect(analyzeAndGenerate).toHaveBeenCalledWith({
      tenantId: "00000000-0000-0000-0000-000000000001",
      patientId: "00000000-0000-0000-0000-000000000010",
      practitionerId: "00000000-0000-0000-0000-000000000099",
      confidenceCeiling: "medium",
    });
    expect(redirect).toHaveBeenCalledWith(
      "/dashboard/patients/00000000-0000-0000-0000-000000000010/protocol/protocol-1",
    );
  });
});
