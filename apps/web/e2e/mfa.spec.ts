import { authenticator } from "otplib";
import { test, expect } from "@playwright/test";

import { DEV_EMAIL, DEV_PASSWORD } from "./helpers";

test.describe("MFA gate (SEC-2)", () => {
  test("password login without MFA cannot reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_EMAIL);
    await page.getByLabel("Password").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/mfa\/(enroll|verify)/, { timeout: 15_000 });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/mfa\/(enroll|verify)/, { timeout: 10_000 });
  });

  test("completing enrollment reaches dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEV_EMAIL);
    await page.getByLabel("Password").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/mfa\/enroll/, { timeout: 15_000 });

    const secret = await page.getByTestId("mfa-secret").textContent();
    expect(secret).toBeTruthy();

    const code = authenticator.generate(secret!.trim());
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Confirm enrollment" }).click();

    await page.waitForURL("**/dashboard**", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();
  });
});
