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
