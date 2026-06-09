import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";
import { RbacDeniedError } from "@/lib/auth/require-role";
import type { SessionUser } from "@/lib/session";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/records", () => ({
  patientBelongsToTenant: vi.fn(),
}));

vi.mock("@/lib/protocols", () => ({
  saveNewProtocolVersion: vi.fn(),
  updateProtocolStatus: vi.fn(),
}));

vi.mock("@/lib/analysis", () => ({
  getAnalysisFindings: vi.fn(),
  runProtocolGeneration: vi.fn(),
  insertProtocol: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const coachSession: SessionUser = {
  ...viewerSession,
  role: "coach",
  email: "coach@example.com",
  name: "Coach Test",
};

const patientId = "00000000-0000-0000-0000-000000000010";
const protocolId = "00000000-0000-0000-0000-000000000011";

describe("protocol edit actions RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveProtocolEdits denies viewer before DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { saveProtocolEdits } = await import("./actions");
    const { saveNewProtocolVersion } = await import("@/lib/protocols");

    await expect(
      saveProtocolEdits(patientId, protocolId, "Title", {}, {}),
    ).rejects.toBeInstanceOf(RbacDeniedError);
    expect(saveNewProtocolVersion).not.toHaveBeenCalled();
  });

  it("changeProtocolStatus denies coach finalizing a protocol", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(coachSession);

    const { changeProtocolStatus } = await import("./actions");
    const { updateProtocolStatus } = await import("@/lib/protocols");

    await expect(
      changeProtocolStatus(patientId, protocolId, "finalized"),
    ).rejects.toBeInstanceOf(RbacDeniedError);
    expect(updateProtocolStatus).not.toHaveBeenCalled();
  });

  it("regenerateProtocol denies viewer before DB mutation", async () => {
    const { requireAuth } = await import("@/lib/auth");
    vi.mocked(requireAuth).mockResolvedValue(viewerSession);

    const { regenerateProtocol } = await import("./actions");
    const { withTenant } = await import("@/lib/db");

    await expect(regenerateProtocol(patientId, protocolId)).rejects.toBeInstanceOf(
      RbacDeniedError,
    );
    expect(withTenant).not.toHaveBeenCalled();
  });
});
