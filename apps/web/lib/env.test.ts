import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function stubRequiredEnvExcept(databaseUrl: string) {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("S3_BUCKET", "test-bucket");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("AWS_REGION", "us-east-1");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("SMTP_SERVER", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "smtp-user");
    vi.stubEnv("SMTP_PASSWORD", "smtp-pass");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "intake@example.com");
  }

  it("throws synchronously when DATABASE_URL is missing", async () => {
    stubRequiredEnvExcept("");
    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/i);
  });

  it("parses when all required variables are present", async () => {
    stubRequiredEnvExcept("postgresql://localhost:5432/clinical_signal");
    const { env } = await import("./env");
    expect(env.DATABASE_URL).toBe("postgresql://localhost:5432/clinical_signal");
    expect(env.AWS_REGION).toBe("us-east-1");
  });
});
