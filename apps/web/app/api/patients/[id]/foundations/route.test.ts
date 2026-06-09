import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({ apiAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/records", () => ({ patientBelongsToTenant: vi.fn() }));
vi.mock("@/lib/db", () => ({ withTenant: vi.fn() }));

describe("POST /api/patients/.../foundations RBAC (SEC-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for viewer before plan mutation", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { POST } = await import("./route");
    const { withTenant } = await import("@/lib/db");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ id: "sleep", title: "Sleep" }] }),
    });

    const res = await POST(req, {
      params: { id: "00000000-0000-0000-0000-000000000010" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(withTenant).not.toHaveBeenCalled();
  });
});
