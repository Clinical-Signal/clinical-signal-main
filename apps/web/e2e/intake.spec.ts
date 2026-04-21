import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Intake", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("intake form loads and shows sections", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    // Navigate to intake form.
    await page.getByRole("link", { name: /continue intake|review intake/i }).click();
    await page.waitForURL("**/intake**");
    await expect(page.getByText("Current symptoms")).toBeVisible({ timeout: 10_000 });
  });

  test("intake hub lets you paste a transcript", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /intake hub/i }).click();
    await page.waitForURL("**/intake-hub**");

    // Click "Paste transcript" tab.
    await page.getByRole("button", { name: "Paste transcript" }).click();
    const textarea = page.locator("textarea").first();
    await textarea.fill("This is a test call transcript for E2E testing purposes.");
    await page.getByRole("button", { name: "Add transcript" }).click();

    await expect(page.getByText(/chunks processed/i)).toBeVisible({ timeout: 15_000 });
  });

  test("intake hub lets you save a practitioner note", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /intake hub/i }).click();
    await page.waitForURL("**/intake-hub**");

    await page.getByRole("button", { name: "Practitioner notes" }).click();
    const textarea = page.locator("textarea").first();
    await textarea.fill("E2E test clinical note: patient presents with fatigue.");
    await page.getByRole("button", { name: "Save note" }).click();

    await expect(page.getByText("Note saved")).toBeVisible({ timeout: 10_000 });
  });
});
