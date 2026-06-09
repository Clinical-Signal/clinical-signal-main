import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({ apiAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/records", () => ({ patientBelongsToTenant: vi.fn() }));
vi.mock("@/lib/protocols", () => ({
  fetchProtocolPdf: vi.fn(),
  protocolBelongsToPatient: vi.fn(),
}));

describe("GET /api/patients/.../export RBAC (SEC-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for viewer before PDF export", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { GET } = await import("./route");
    const { fetchProtocolPdf } = await import("@/lib/protocols");

    const res = await GET(new Request("http://localhost/export"), {
      params: {
        id: "00000000-0000-0000-0000-000000000010",
        protocolId: "00000000-0000-0000-0000-000000000011",
      },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(fetchProtocolPdf).not.toHaveBeenCalled();
  });
});
