import { type Page, expect } from "@playwright/test";

// Seed dev credentials (from 0003_seed_dev.sql).
export const DEV_EMAIL = "dev@example.com";
export const DEV_PASSWORD = "devpassword12!";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEV_EMAIL);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

export async function ensureLoggedIn(page: Page) {
  await page.goto("/dashboard");
  // If redirected to login, log in.
  if (page.url().includes("/login")) {
    await login(page);
  }
  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible({ timeout: 10_000 });
}
