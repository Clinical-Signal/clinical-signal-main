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
  acceptLabUpload: vi.fn(),
  patientBelongsToTenant: vi.fn(),
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("uploadLabAction RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies viewer with RbacDeniedError before any DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { uploadLabAction } = await import("./actions");
    const { acceptLabUpload } = await import("@/lib/records");

    const fd = new FormData();
    fd.set("patientId", "00000000-0000-0000-0000-000000000010");
    fd.set("file", new File(["%PDF-1.4"], "lab.pdf", { type: "application/pdf" }));

    await expect(uploadLabAction(undefined, fd)).rejects.toBeInstanceOf(RbacDeniedError);
    expect(acceptLabUpload).not.toHaveBeenCalled();
  });
});
