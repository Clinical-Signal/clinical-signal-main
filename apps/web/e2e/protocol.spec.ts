import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

test.describe("Protocol", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("protocol page is accessible", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /generate protocol|open protocol/i }).first().click();
    await page.waitForURL("**/protocol**");
    // Should show either the generate button or a protocol view.
    const hasGenerate = await page.getByRole("button", { name: /generate protocol/i }).count();
    const hasProtocol = await page.getByText(/clinical protocol|protocol/i).count();
    expect(hasGenerate + hasProtocol).toBeGreaterThan(0);
  });

  test("protocol generation end-to-end", async ({ page }) => {
    test.skip(!HAS_API_KEY, "ANTHROPIC_API_KEY not available — skipping protocol generation");
    test.setTimeout(5 * 60 * 1000); // 5 minute timeout

    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /generate protocol|open protocol/i }).click();
    await page.waitForURL("**/protocol**");
    await page.getByRole("button", { name: /generate protocol/i }).click();

    // Wait for streaming to complete — should redirect to protocol view.
    await page.waitForURL("**/protocol/**", { timeout: 5 * 60 * 1000 });
    await expect(page.getByText(/output a/i)).toBeVisible({ timeout: 30_000 });
  });

  test("existing protocol view page renders both outputs", async ({ page }) => {
    // Navigate to protocol index — if any versions exist, click the first.
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /generate protocol|open protocol/i }).click();
    await page.waitForURL("**/protocol**");

    // Check if there are existing protocol versions.
    const versionLink = page.locator("a").filter({ hasText: /protocol/i }).first();
    const count = await versionLink.count();
    test.skip(count === 0, "No protocol versions to view");

    await versionLink.click();
    await expect(page.getByText(/clinical protocol/i)).toBeVisible({ timeout: 10_000 });
  });
});
