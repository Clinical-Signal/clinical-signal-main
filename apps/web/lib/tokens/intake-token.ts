import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { IntakeTokenStatus } from "@/lib/db/schema/intake-token-status";

export const INTAKE_TOKEN_BYTES = 16;

export const INTAKE_TOKEN_DEFAULTS = {
  ttlDays: 7,
  rateLimitPerMin: 10,
  ipRateLimitPerMin: 10,
  lockoutFailureThreshold: 5,
  lockoutDurationMs: 15 * 60 * 1000,
} as const;

export type IntakeTokenConfig = {
  ttlDays: number;
  rateLimitPerMin: number;
  ipRateLimitPerMin: number;
  lockoutFailureThreshold: number;
  lockoutDurationMs: number;
};

export type IntakeTokenRecord = {
  id: string;
  patientId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  status: IntakeTokenStatus;
  completedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  useCount: number;
};

export type MintIntakeTokenInput = {
  patientId: string;
  tenantId: string;
  createdBy: string;
};

export type MintIntakeTokenResult = {
  token: string;
  tokenId: string;
  expiresAt: Date;
  patientId: string;
  tenantId: string;
};

export type VerifyIntakeTokenInput = {
  rawToken: string;
  clientIp: string;
};

export type VerifyIntakeTokenResult = {
  tokenId: string;
  patientId: string;
  tenantId: string;
};

export type IntakeTokenErrorCode =
  | "invalid_token"
  | "expired"
  | "revoked"
  | "completed"
  | "rate_limited"
  | "locked_out"
  | "active_token_exists";

export type IntakeTokenGateDeniedReason =
  | "invalid"
  | "expired"
  | "revoked"
  | "completed";

export type IntakeTokenGateResult =
  | {
      allowed: true;
      tokenId: string;
      patientId: string;
      tenantId: string;
      status: IntakeTokenStatus;
    }
  | {
      allowed: false;
      reason: IntakeTokenGateDeniedReason;
    };

export class IntakeTokenError extends Error {
  readonly code: IntakeTokenErrorCode;

  constructor(code: IntakeTokenErrorCode, message?: string) {
    super(message ?? code);
    this.name = "IntakeTokenError";
    this.code = code;
  }
}

export type IntakeTokenStore = {
  insert(record: IntakeTokenRecord): Promise<void>;
  findByHash(tokenHash: string): Promise<IntakeTokenRecord | null>;
  findById(tokenId: string): Promise<IntakeTokenRecord | null>;
  findActiveByPatientId(patientId: string): Promise<IntakeTokenRecord | null>;
  update(record: IntakeTokenRecord): Promise<void>;
};

export type IntakeTokenRateLimiter = {
  isLockedOut(clientIp: string, tokenId: string | null, now: Date): Promise<boolean>;
  recordFailure(clientIp: string, tokenId: string | null, now: Date): Promise<void>;
  clearFailures(clientIp: string, tokenId: string | null): Promise<void>;
  checkAndRecordSuccess(
    clientIp: string,
    tokenId: string,
    config: Pick<IntakeTokenConfig, "rateLimitPerMin" | "ipRateLimitPerMin">,
    now: Date,
  ): Promise<void>;
};

export type IntakeTokenDependencies = {
  now?: () => Date;
  randomToken?: () => string;
};

export function generateRawIntakeToken(random = randomBytes): string {
  return random(INTAKE_TOKEN_BYTES).toString("base64url");
}

export function hashIntakeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function constantTimeHashMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function createTokenId(): string {
  return randomUUID();
}

export class InMemoryIntakeTokenRateLimiter implements IntakeTokenRateLimiter {
  private readonly failures = new Map<string, { count: number; lockedUntil: Date | null }>();
  private readonly successEvents = new Map<string, number[]>();

  constructor(
    private readonly lockoutConfig: Pick<
      IntakeTokenConfig,
      "lockoutFailureThreshold" | "lockoutDurationMs"
    > = { ...INTAKE_TOKEN_DEFAULTS },
  ) {}

  async isLockedOut(clientIp: string, tokenId: string | null, now: Date): Promise<boolean> {
    return (
      this.isKeyLockedOut(`ip:${clientIp}`, now) ||
      (tokenId ? this.isKeyLockedOut(`token:${tokenId}`, now) : false)
    );
  }

  async recordFailure(clientIp: string, tokenId: string | null, now: Date): Promise<void> {
    this.incrementFailures(`ip:${clientIp}`, now);
    if (tokenId) {
      this.incrementFailures(`token:${tokenId}`, now);
    }
  }

  async clearFailures(clientIp: string, tokenId: string | null): Promise<void> {
    this.failures.delete(`ip:${clientIp}`);
    if (tokenId) {
      this.failures.delete(`token:${tokenId}`);
    }
  }

  async checkAndRecordSuccess(
    clientIp: string,
    tokenId: string,
    config: Pick<IntakeTokenConfig, "rateLimitPerMin" | "ipRateLimitPerMin">,
    now: Date,
  ): Promise<void> {
    this.assertUnderLimit(`ip:${clientIp}`, config.ipRateLimitPerMin, now);
    this.assertUnderLimit(`token:${tokenId}`, config.rateLimitPerMin, now);
    this.recordEvent(`ip:${clientIp}`, now);
    this.recordEvent(`token:${tokenId}`, now);
  }

  private isKeyLockedOut(key: string, now: Date): boolean {
    const state = this.failures.get(key);
    if (!state?.lockedUntil) {
      return false;
    }

    if (state.lockedUntil.getTime() <= now.getTime()) {
      this.failures.delete(key);
      return false;
    }

    return true;
  }

  private incrementFailures(key: string, now: Date): void {
    const current = this.failures.get(key) ?? { count: 0, lockedUntil: null };
    const nextCount = current.count + 1;
    const lockedUntil =
      nextCount >= this.lockoutConfig.lockoutFailureThreshold
        ? new Date(now.getTime() + this.lockoutConfig.lockoutDurationMs)
        : current.lockedUntil;

    this.failures.set(key, {
      count: nextCount,
      lockedUntil,
    });
  }

  private assertUnderLimit(key: string, limit: number, now: Date): void {
    const windowStart = now.getTime() - 60_000;
    const events = (this.successEvents.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );

    if (events.length >= limit) {
      throw new IntakeTokenError("rate_limited");
    }
  }

  private recordEvent(key: string, now: Date): void {
    const windowStart = now.getTime() - 60_000;
    const events = (this.successEvents.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );
    events.push(now.getTime());
    this.successEvents.set(key, events);
  }
}

export class InMemoryIntakeTokenStore implements IntakeTokenStore {
  private readonly records = new Map<string, IntakeTokenRecord>();

  async insert(record: IntakeTokenRecord): Promise<void> {
    const active = await this.findActiveByPatientId(record.patientId);
    if (active) {
      throw new IntakeTokenError(
        "active_token_exists",
        "patient already has an active intake token",
      );
    }

    this.records.set(record.id, record);
  }

  async findByHash(tokenHash: string): Promise<IntakeTokenRecord | null> {
    for (const record of this.records.values()) {
      if (constantTimeHashMatch(record.tokenHash, tokenHash)) {
        return record;
      }
    }

    return null;
  }

  async findById(tokenId: string): Promise<IntakeTokenRecord | null> {
    return this.records.get(tokenId) ?? null;
  }

  async findActiveByPatientId(patientId: string): Promise<IntakeTokenRecord | null> {
    for (const record of this.records.values()) {
      if (
        record.patientId === patientId &&
        record.revokedAt === null &&
        record.status === "pending"
      ) {
        return record;
      }
    }

    return null;
  }

  async update(record: IntakeTokenRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  snapshot(): IntakeTokenRecord[] {
    return [...this.records.values()];
  }
}

export class IntakeTokenService {
  private readonly now: () => Date;
  private readonly randomToken: () => string;

  constructor(
    private readonly store: IntakeTokenStore,
    private readonly rateLimiter: IntakeTokenRateLimiter,
    private readonly config: IntakeTokenConfig = { ...INTAKE_TOKEN_DEFAULTS },
    dependencies: IntakeTokenDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.randomToken = dependencies.randomToken ?? (() => generateRawIntakeToken());
  }

  async mint(input: MintIntakeTokenInput): Promise<MintIntakeTokenResult> {
    const createdAt = this.now();
    const rawToken = this.randomToken();
    const record: IntakeTokenRecord = {
      id: createTokenId(),
      patientId: input.patientId,
      tenantId: input.tenantId,
      tokenHash: hashIntakeToken(rawToken),
      expiresAt: addDays(createdAt, this.config.ttlDays),
      revokedAt: null,
      status: "pending",
      completedAt: null,
      createdBy: input.createdBy,
      createdAt,
      lastUsedAt: null,
      useCount: 0,
    };

    await this.store.insert(record);

    return {
      token: rawToken,
      tokenId: record.id,
      expiresAt: record.expiresAt,
      patientId: record.patientId,
      tenantId: record.tenantId,
    };
  }

  async inspectGate(rawToken: string): Promise<IntakeTokenGateResult> {
    const now = this.now();
    const tokenHash = hashIntakeToken(rawToken);
    const record = await this.store.findByHash(tokenHash);
    return resolveIntakeTokenGateFromRecord(record, tokenHash, now);
  }

  async verify(input: VerifyIntakeTokenInput): Promise<VerifyIntakeTokenResult> {
    const now = this.now();
    const tokenHash = hashIntakeToken(input.rawToken);
    const record = await this.store.findByHash(tokenHash);

    if (await this.rateLimiter.isLockedOut(input.clientIp, record?.id ?? null, now)) {
      throw new IntakeTokenError("locked_out");
    }

    if (!record) {
      await this.rateLimiter.recordFailure(input.clientIp, null, now);
      throw new IntakeTokenError("invalid_token");
    }

    if (record.revokedAt !== null) {
      await this.rateLimiter.recordFailure(input.clientIp, record.id, now);
      throw new IntakeTokenError("revoked");
    }

    if (record.status === "completed") {
      await this.rateLimiter.recordFailure(input.clientIp, record.id, now);
      throw new IntakeTokenError("completed");
    }

    if (record.status === "expired") {
      await this.rateLimiter.recordFailure(input.clientIp, record.id, now);
      throw new IntakeTokenError("expired");
    }

    if (record.expiresAt.getTime() <= now.getTime()) {
      await this.rateLimiter.recordFailure(input.clientIp, record.id, now);
      throw new IntakeTokenError("expired");
    }

    if (!constantTimeHashMatch(record.tokenHash, tokenHash)) {
      await this.rateLimiter.recordFailure(input.clientIp, record.id, now);
      throw new IntakeTokenError("invalid_token");
    }

    await this.rateLimiter.checkAndRecordSuccess(
      input.clientIp,
      record.id,
      this.config,
      now,
    );
    await this.rateLimiter.clearFailures(input.clientIp, record.id);

    const updated: IntakeTokenRecord = {
      ...record,
      lastUsedAt: now,
      useCount: record.useCount + 1,
    };
    await this.store.update(updated);

    return {
      tokenId: record.id,
      patientId: record.patientId,
      tenantId: record.tenantId,
    };
  }

  async revoke(tokenId: string): Promise<IntakeTokenRecord> {
    const record = await this.store.findById(tokenId);
    if (!record) {
      throw new IntakeTokenError("invalid_token", "token not found");
    }

    if (record.revokedAt !== null) {
      return record;
    }

    const revoked: IntakeTokenRecord = {
      ...record,
      revokedAt: this.now(),
    };
    await this.store.update(revoked);
    return revoked;
  }

  async reissue(input: MintIntakeTokenInput): Promise<MintIntakeTokenResult> {
    const active = await this.store.findActiveByPatientId(input.patientId);
    if (active) {
      await this.revoke(active.id);
    }

    return this.mint(input);
  }

  async complete(tokenId: string): Promise<IntakeTokenRecord> {
    const record = await this.store.findById(tokenId);
    if (!record) {
      throw new IntakeTokenError("invalid_token", "token not found");
    }

    if (record.status === "completed") {
      return record;
    }

    const completed: IntakeTokenRecord = {
      ...record,
      status: "completed",
      completedAt: this.now(),
    };
    await this.store.update(completed);
    return completed;
  }
}

function resolveIntakeTokenGateFromRecord(
  record: IntakeTokenRecord | null,
  tokenHash: string,
  now: Date,
): IntakeTokenGateResult {
  if (!record || !constantTimeHashMatch(record.tokenHash, tokenHash)) {
    return { allowed: false, reason: "invalid" };
  }

  if (record.revokedAt !== null) {
    return { allowed: false, reason: "revoked" };
  }

  if (record.status === "completed") {
    return { allowed: false, reason: "completed" };
  }

  if (record.status === "expired" || record.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: "expired" };
  }

  return {
    allowed: true,
    tokenId: record.id,
    patientId: record.patientId,
    tenantId: record.tenantId,
    status: record.status,
  };
}

export function createIntakeTokenService(
  store: IntakeTokenStore,
  rateLimiter: IntakeTokenRateLimiter,
  config: IntakeTokenConfig = { ...INTAKE_TOKEN_DEFAULTS },
  dependencies: IntakeTokenDependencies = {},
): IntakeTokenService {
  return new IntakeTokenService(store, rateLimiter, config, dependencies);
}
