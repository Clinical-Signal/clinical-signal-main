import { describe, expect, it } from "vitest";

import {
  createIntakeTokenService,
  generateRawIntakeToken,
  hashIntakeToken,
  InMemoryIntakeTokenRateLimiter,
  InMemoryIntakeTokenStore,
  IntakeTokenError,
  INTAKE_TOKEN_BYTES,
  INTAKE_TOKEN_DEFAULTS,
} from "./intake-token";

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const CREATED_BY = "33333333-3333-3333-3333-333333333333";
const CLIENT_IP = "203.0.113.10";

function createTestHarness(options: {
  now?: () => Date;
  randomToken?: () => string;
} = {}) {
  const config = {
    ...INTAKE_TOKEN_DEFAULTS,
    ttlDays: 7,
    lockoutFailureThreshold: 3,
    lockoutDurationMs: 60_000,
  };
  const store = new InMemoryIntakeTokenStore();
  const rateLimiter = new InMemoryIntakeTokenRateLimiter(config);
  const service = createIntakeTokenService(store, rateLimiter, config, options);

  return { store, rateLimiter, service, config };
}

describe("intake-token service", () => {
  it("mints a 128-bit token and stores only the hash", async () => {
    const rawToken = generateRawIntakeToken();
    const { store, service } = createTestHarness({
      randomToken: () => rawToken,
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    expect(minted.token).toBe(rawToken);
    expect(Buffer.from(minted.token, "base64url")).toHaveLength(
      INTAKE_TOKEN_BYTES,
    );

    const stored = store.snapshot();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashIntakeToken(rawToken));
    expect(JSON.stringify(stored[0])).not.toContain(rawToken);
  });

  it("verifies a freshly minted token", async () => {
    const { service } = createTestHarness();
    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await expect(
      service.verify({ rawToken: minted.token, clientIp: CLIENT_IP }),
    ).resolves.toEqual({
      tokenId: minted.tokenId,
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
    });
  });

  it("rejects expired tokens", async () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    let current = start;
    const { service } = createTestHarness({
      now: () => current,
      randomToken: () => "expired-token-value",
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    current = new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000);

    await expect(
      service.verify({ rawToken: minted.token, clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "expired" satisfies IntakeTokenError["code"] });
  });

  it("rejects revoked tokens", async () => {
    const { service } = createTestHarness({
      randomToken: () => "revoked-token-value",
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await service.revoke(minted.tokenId);

    await expect(
      service.verify({ rawToken: minted.token, clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "revoked" });
  });

  it("rejects wrong tokens", async () => {
    const { service } = createTestHarness({
      randomToken: () => "valid-token-value",
    });

    await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await expect(
      service.verify({ rawToken: "wrong-token-value", clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rate limits successful verifications per token", async () => {
    const config = {
      ...INTAKE_TOKEN_DEFAULTS,
      rateLimitPerMin: 2,
      ipRateLimitPerMin: 100,
      lockoutFailureThreshold: 10,
      lockoutDurationMs: 60_000,
    };
    const store = new InMemoryIntakeTokenStore();
    const rateLimiter = new InMemoryIntakeTokenRateLimiter(config);
    const service = createIntakeTokenService(store, rateLimiter, config, {
      randomToken: () => "rate-limit-token",
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await service.verify({ rawToken: minted.token, clientIp: CLIENT_IP });
    await service.verify({ rawToken: minted.token, clientIp: CLIENT_IP });

    await expect(
      service.verify({ rawToken: minted.token, clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("locks out after the configured failure threshold", async () => {
    const { service } = createTestHarness({
      randomToken: () => "valid-token-value",
    });

    await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.verify({ rawToken: "wrong-token-value", clientIp: CLIENT_IP }),
      ).rejects.toMatchObject({ code: "invalid_token" });
    }

    await expect(
      service.verify({ rawToken: "wrong-token-value", clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "locked_out" });
  });

  it("clears the active slot when revoked so a new token can be minted", async () => {
    const { store, service } = createTestHarness({
      randomToken: () => `token-${store.snapshot().length}`,
    });

    const first = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await service.revoke(first.tokenId);

    expect(await store.findActiveByPatientId(PATIENT_ID)).toBeNull();

    const second = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    expect(second.tokenId).not.toBe(first.tokenId);
    expect(await store.findActiveByPatientId(PATIENT_ID)).not.toBeNull();
  });

  it("rejects completed tokens", async () => {
    const { service } = createTestHarness({
      randomToken: () => "completed-token-value",
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await service.complete(minted.tokenId);

    await expect(
      service.verify({ rawToken: minted.token, clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "completed" });
  });

  it("inspectGate persists expired status when TTL has passed", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const { store, service } = createTestHarness({
      randomToken: () => "gate-expired-token",
      now: () => new Date("2025-01-01T00:00:00.000Z"),
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    const record = await store.findById(minted.tokenId);
    expect(record).not.toBeNull();
    await store.update({
      ...record!,
      expiresAt: past,
    });

    await expect(service.inspectGate(minted.token)).resolves.toEqual({
      allowed: false,
      reason: "expired",
    });

    const updated = await store.findById(minted.tokenId);
    expect(updated?.status).toBe("expired");
  });

  it("inspectGate blocks completed tokens without rate limiting", async () => {
    const { service } = createTestHarness({
      randomToken: () => "gate-completed-token",
    });

    const minted = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    await service.complete(minted.tokenId);

    await expect(service.inspectGate(minted.token)).resolves.toEqual({
      allowed: false,
      reason: "completed",
    });
  });

  it("reissue revokes the active token and mints a replacement", async () => {
    const { store, service } = createTestHarness({
      randomToken: () => `token-${store.snapshot().length}`,
    });

    const first = await service.mint({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    const reissued = await service.reissue({
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
      createdBy: CREATED_BY,
    });

    const firstRecord = await store.findById(first.tokenId);
    expect(firstRecord?.revokedAt).not.toBeNull();
    expect(reissued.tokenId).not.toBe(first.tokenId);

    await expect(
      service.verify({ rawToken: first.token, clientIp: CLIENT_IP }),
    ).rejects.toMatchObject({ code: "revoked" });

    await expect(
      service.verify({ rawToken: reissued.token, clientIp: CLIENT_IP }),
    ).resolves.toEqual({
      tokenId: reissued.tokenId,
      patientId: PATIENT_ID,
      tenantId: TENANT_ID,
    });
  });
});
