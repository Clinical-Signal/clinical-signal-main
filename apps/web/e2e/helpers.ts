import { authenticator } from "otplib";
import { type Page, expect } from "@playwright/test";

// Seed dev credentials (from 0003_seed_dev.sql).
export const DEV_EMAIL = "dev@example.com";
export const DEV_PASSWORD = "devpassword12!";

async function completeMfaChallenge(page: Page) {
  if (page.url().includes("/mfa/enroll")) {
    const secret = await page.getByTestId("mfa-secret").textContent();
    if (!secret) {
      throw new Error("MFA enroll page missing secret");
    }
    const code = authenticator.generate(secret.trim());
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Confirm enrollment" }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });
    return;
  }

  if (page.url().includes("/mfa/verify")) {
    const code = process.env.E2E_MFA_TOTP_CODE;
    if (!code) {
      throw new Error(
        "Set E2E_MFA_TOTP_CODE for verify-only MFA e2e, or enroll the dev user first",
      );
    }
    await page.getByLabel("Authentication code").fill(code);
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await page.waitForURL("**/dashboard**", { timeout: 15_000 });
  }
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEV_EMAIL);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/mfa\/(enroll|verify)/, { timeout: 15_000 });
  await completeMfaChallenge(page);
  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible({
    timeout: 10_000,
  });
}

export async function ensureLoggedIn(page: Page) {
  await page.goto("/dashboard");
  // If redirected to login, log in.
  if (page.url().includes("/login")) {
    await login(page);
  }
  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible({ timeout: 10_000 });
}
