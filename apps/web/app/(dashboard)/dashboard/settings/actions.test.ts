import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";
import { RbacDeniedError } from "@/lib/auth/require-role";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/preferences", () => ({
  addPreference: vi.fn(),
  updatePreference: vi.fn(),
  deletePreference: vi.fn(),
}));

describe("settings actions RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addPreferenceAction denies viewer before DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { addPreferenceAction } = await import("./actions");
    const { addPreference } = await import("@/lib/preferences");

    await expect(
      addPreferenceAction("general", "Always use warm tone"),
    ).rejects.toBeInstanceOf(RbacDeniedError);
    expect(addPreference).not.toHaveBeenCalled();
  });
});
