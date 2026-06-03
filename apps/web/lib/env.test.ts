import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws synchronously when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    vi.stubEnv("S3_BUCKET", "test-bucket");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-5");

    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/i);
  });
});
