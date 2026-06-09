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
  saveLabCorrections: vi.fn(),
}));

describe("saveLabsAction RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies viewer with RbacDeniedError before any DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { saveLabsAction } = await import("./actions");
    const { saveLabCorrections } = await import("@/lib/records");

    await expect(
      saveLabsAction("record-1", [
        {
          test_name: "Glucose",
          value: "95",
          unit: "mg/dL",
          reference_range: "70-99",
          flag: "normal",
        },
      ]),
    ).rejects.toBeInstanceOf(RbacDeniedError);
    expect(saveLabCorrections).not.toHaveBeenCalled();
  });
});
