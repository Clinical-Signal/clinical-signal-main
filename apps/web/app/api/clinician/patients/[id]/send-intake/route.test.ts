import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({ apiAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/write-audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/records", () => ({ patientBelongsToTenant: vi.fn() }));
vi.mock("@/lib/tokens/intake-token-service", () => ({
  getIntakeTokenService: vi.fn(),
}));
vi.mock("@/lib/intake/build-intake-url", () => ({
  buildPatientIntakeUrl: vi.fn(),
}));
vi.mock("@/lib/intake/dispatch-intake-email", () => ({
  dispatchIntakeEmail: vi.fn(),
}));
vi.mock("@/lib/intake/patient-intake-store", () => ({
  getPatientIntakeState: vi.fn(),
}));
vi.mock("@/lib/intake/resolve-patient-intake-email", () => ({
  resolvePatientIntakeEmail: vi.fn(),
}));
vi.mock("@/lib/log-safe", () => ({ logSafeError: vi.fn() }));

describe("POST /api/clinician/patients/.../send-intake RBAC (SEC-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for viewer before token mint", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { POST } = await import("./route");
    const { getIntakeTokenService } = await import("@/lib/tokens/intake-token-service");

    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: { id: "00000000-0000-0000-0000-000000000010" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(getIntakeTokenService).not.toHaveBeenCalled();
  });
});
