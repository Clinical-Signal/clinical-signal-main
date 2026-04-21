import { test, expect } from "@playwright/test";
import { DEV_EMAIL, DEV_PASSWORD, login } from "./helpers";

test.describe("Auth flow", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login with valid credentials reaches dashboard", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_EMAIL);
    await page.getByLabel("Password").fill("wrongpassword123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5_000 });
  });

  test("logout returns to login page", async ({ page }) => {
    await login(page);
    await page.getByText("Sign out").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
