import { test, expect } from "@playwright/test";

test.describe("API routes", () => {
  test("unauthenticated API call returns 401 JSON", async ({ request }) => {
    const res = await request.get("/api/patients/fake-id/intake-docs");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("unauthenticated protocol export returns 401 or redirect", async ({ request }) => {
    const res = await request.get(
      "/api/patients/fake-id/protocol/fake-id/export?audience=clinical",
    );
    // Should be 401 (not a 500 or raw HTML error page).
    expect([401, 307]).toContain(res.status());
  });
});
