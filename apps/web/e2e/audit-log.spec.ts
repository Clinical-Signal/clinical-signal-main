import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Audit log", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("audit log page renders with table", async ({ page }) => {
    await page.getByRole("link", { name: "Audit log" }).click();
    await page.waitForURL("**/audit-log**");

    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    // Should have column headers
    await expect(page.getByText("When")).toBeVisible();
    await expect(page.getByText("Action")).toBeVisible();
    await expect(page.getByText("Who")).toBeVisible();
  });

  test("filters work", async ({ page }) => {
    await page.getByRole("link", { name: "Audit log" }).click();
    await page.waitForURL("**/audit-log**");

    // Select an action filter
    const actionFilter = page.locator("select").first();
    await actionFilter.selectOption("login_success");

    // Page should reload with filter applied
    await page.waitForTimeout(500);
    // Clear filters button should appear
    await expect(page.getByText(/clear filter/i)).toBeVisible();
  });
});
