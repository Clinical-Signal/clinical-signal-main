import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Foundational checklist", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("foundations page loads with all 8 topic cards", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /assign checklist|view checklist/i }).click();
    await page.waitForURL("**/foundations**");

    await expect(page.getByText("Foundational checklist")).toBeVisible();
    await expect(page.getByText("Sleep")).toBeVisible();
    await expect(page.getByText("Hydration")).toBeVisible();
    await expect(page.getByText("Nutrition")).toBeVisible();
    await expect(page.getByText("Stress Management")).toBeVisible();
    await expect(page.getByText("Movement")).toBeVisible();
    await expect(page.getByText("Environment")).toBeVisible();
    await expect(page.getByText("Mindset")).toBeVisible();
    await expect(page.getByText("Digestion")).toBeVisible();
  });

  test("can toggle items on and off", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /assign checklist|view checklist/i }).click();
    await page.waitForURL("**/foundations**");

    // Start with all 8 selected
    await expect(page.getByText("8 of 8 selected")).toBeVisible();

    // Deselect one
    await page.getByLabel("Include Sleep hygiene foundations").uncheck();
    await expect(page.getByText("7 of 8 selected")).toBeVisible();

    // Deselect all via button
    await page.getByText("Deselect all").click();
    await expect(page.getByText("0 of 8 selected")).toBeVisible();
    await expect(page.getByText("Select at least one topic")).toBeVisible();
  });

  test("expand card shows description and notes field", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await page.getByRole("link", { name: /assign checklist|view checklist/i }).click();
    await page.waitForURL("**/foundations**");

    // Expand the Sleep card
    await page.getByRole("button", { name: "Expand" }).first().click();

    // Should show description content
    await expect(page.getByText(/consistent sleep\/wake times/i)).toBeVisible();
    // Should show notes textarea
    await expect(page.getByPlaceholder(/personalized guidance/i)).toBeVisible();
  });

  test("patient detail shows foundations card", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");

    await expect(page.getByRole("heading", { name: "Foundations" })).toBeVisible();
  });
});
