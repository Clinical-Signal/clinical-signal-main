import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

test.describe("Patient workflow", () => {
  test.beforeEach(async ({ page }) => {
    await ensureLoggedIn(page);
  });

  test("dashboard shows seeded patients", async ({ page }) => {
    // The dev seed creates 3 patients: Sarah Chen, Marcus Alvarez, Priya Natarajan
    await expect(page.getByText("Sarah Chen")).toBeVisible();
  });

  test("create a new patient", async ({ page }) => {
    await page.getByRole("link", { name: "New patient" }).click();
    await page.waitForURL("**/patients/new**");

    const testName = "E2E Test Patient " + Date.now();
    await page.getByLabel("Full name").fill(testName);
    await page.getByLabel("Date of birth").fill("1990-01-15");
    await page.getByRole("button", { name: "Create patient" }).click();

    // Should redirect to dashboard and show the new patient.
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });
    await expect(page.getByText(testName)).toBeVisible();
  });

  test("patient detail hub shows intake, documents, protocol cards", async ({ page }) => {
    await page.getByText("Sarah Chen").click();
    await page.waitForURL("**/patients/**");
    await expect(page.getByRole("heading", { name: "Intake" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Protocol" })).toBeVisible();
  });
});
