import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/auth/require-auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns a typed Session in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { requireAuth } = await import("./require-auth");
    const session = await requireAuth();

    expect(session.userId).toEqual(expect.any(String));
    expect(session.tenantId).toEqual(expect.any(String));
    expect(["owner", "practitioner", "viewer", "coach"]).toContain(session.role);
  });
});
