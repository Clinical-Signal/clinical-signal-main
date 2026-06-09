import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewerSession } from "@/lib/__tests__/rbac-test-session";

vi.mock("@/lib/auth", () => ({ apiAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/records", () => ({ patientBelongsToTenant: vi.fn() }));
vi.mock("@/lib/intake-documents", () => ({
  insertDocument: vi.fn(),
  insertChunks: vi.fn(),
  chunkText: vi.fn(),
  listIntakeDocs: vi.fn(),
}));
vi.mock("@/lib/upload-validation", () => ({ validateMagicBytes: vi.fn() }));

describe("POST /api/patients/.../intake-docs RBAC (SEC-6)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for viewer before intake document upload", async () => {
    const { apiAuth } = await import("@/lib/auth");
    vi.mocked(apiAuth).mockResolvedValue(viewerSession);

    const { POST } = await import("./route");
    const { insertDocument } = await import("@/lib/intake-documents");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "note", text: "Clinician note body" }),
    });

    const res = await POST(req, {
      params: { id: "00000000-0000-0000-0000-000000000010" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(insertDocument).not.toHaveBeenCalled();
  });
});
