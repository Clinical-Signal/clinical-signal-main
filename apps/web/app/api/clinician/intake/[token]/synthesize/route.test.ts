import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({ apiAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/write-audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/intake/load-clinician-intake", () => ({
  resolveClinicianIntakeByToken: vi.fn(),
  ClinicianIntakeAccessError: class ClinicianIntakeAccessError extends Error {},
}));
vi.mock("@/lib/intake/save-patient-synthesis", () => ({
  savePatientSynthesisResolved: vi.fn(),
}));
vi.mock("@/lib/llm/synthesize-note", () => ({ synthesizeNote: vi.fn() }));
vi.mock("@/lib/tokens/intake-token-api", () => ({
  extractClientIp: vi.fn(() => "127.0.0.1"),
  tokenErrorResponse: vi.fn(),
}));

describe("POST /api/clinician/intake/.../synthesize RBAC (SEC-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for viewer before synthesis", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { POST } = await import("./route");
    const { resolveClinicianIntakeByToken } = await import(
      "@/lib/intake/load-clinician-intake"
    );

    const res = await POST(new Request("http://localhost"), {
      params: { token: "test-token-value" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(resolveClinicianIntakeByToken).not.toHaveBeenCalled();
  });
});
