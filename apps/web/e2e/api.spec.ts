import { test, expect } from "@playwright/test";

test.describe("API routes — auth guards", () => {
  const routes = [
    { method: "GET", path: "/api/patients/fake-id/intake-docs" },
    { method: "GET", path: "/api/patients/fake-id/foundations" },
    { method: "POST", path: "/api/patients/fake-id/foundations" },
    { method: "POST", path: "/api/patients/fake-id/analyze" },
    { method: "POST", path: "/api/patients/fake-id/generate-protocol" },
    { method: "GET", path: "/api/patients/fake-id/prep-brief" },
    { method: "GET", path: "/api/patients/fake-id/records" },
    { method: "GET", path: "/api/patients/fake-id/protocols" },
    { method: "GET", path: "/api/audit-logs" },
    { method: "GET", path: "/api/patients/fake-id/protocol/fake-id/export?audience=clinical" },
    { method: "POST", path: "/api/patients/fake-id/protocol/fake-id/approve" },
    { method: "GET", path: "/api/patients/fake-id/protocol/fake-id/dialogue" },
  ];

  for (const { method, path } of routes) {
    test(`${method} ${path} returns 401 when unauthenticated`, async ({ request }) => {
      const res = method === "POST"
        ? await request.post(path, { data: {} })
        : await request.get(path);
      // Accept 401 or 307 (redirect to login) — never 500.
      expect([401, 307]).toContain(res.status());
      if (res.status() === 401) {
        const body = await res.json();
        expect(body.error).toBeDefined();
      }
    });
  }
});

test.describe("API routes — validation", () => {
  test("unauthenticated POST to foundations doesn't 500", async ({ request }) => {
    const res = await request.post("/api/patients/fake-id/foundations", {
      data: { items: [] },
    });
    expect(res.status()).not.toBe(500);
  });
});
