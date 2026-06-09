import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({
  apiAuth: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/records", () => ({
  patientBelongsToTenant: vi.fn(),
}));

vi.mock("@/lib/protocols", () => ({
  getProtocol: vi.fn(),
  getOriginalProtocol: vi.fn(),
  approveProtocol: vi.fn(),
}));

vi.mock("@/lib/protocol-outputs", () => ({
  generateDerivativeOutputs: vi.fn(),
}));

vi.mock("@/lib/timeline", () => ({
  recordProtocolApproved: vi.fn(),
}));

vi.mock("@/lib/protocol-edits", () => ({
  computeProtocolDiff: vi.fn(),
  storeProtocolEdits: vi.fn(),
}));

vi.mock("@/lib/pattern-recognition", () => ({
  runPatternRecognition: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

describe("POST /api/patients/.../approve RBAC (SEC-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for viewer before protocol mutation", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { POST } = await import("./route");
    const { approveProtocol } = await import("@/lib/protocols");

    const res = await POST(new Request("http://localhost"), {
      params: {
        id: "00000000-0000-0000-0000-000000000010",
        protocolId: "00000000-0000-0000-0000-000000000011",
      },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(approveProtocol).not.toHaveBeenCalled();
  });
});
