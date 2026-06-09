import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";
import { RbacDeniedError } from "@/lib/auth/require-role";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/patients", () => ({
  createPatient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("createPatientAction RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies viewer with RbacDeniedError before any DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { createPatientAction } = await import("./actions");
    const { createPatient } = await import("@/lib/patients");

    const fd = new FormData();
    fd.set("name", "Test Patient");

    await expect(createPatientAction(undefined, fd)).rejects.toBeInstanceOf(
      RbacDeniedError,
    );
    expect(createPatient).not.toHaveBeenCalled();
  });
});
