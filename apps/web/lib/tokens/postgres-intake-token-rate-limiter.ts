import { withSystem } from "@cs/db";

import {
  INTAKE_TOKEN_DEFAULTS,
  IntakeTokenError,
  type IntakeTokenConfig,
  type IntakeTokenRateLimiter,
} from "./intake-token";

type RateLimitRow = {
  bucket_key: string;
  failure_count: number;
  locked_until: Date | null;
  success_events: number[];
};

function parseSuccessEvents(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is number => typeof entry === "number");
}

function pruneSuccessEvents(events: number[], now: Date): number[] {
  const windowStart = now.getTime() - 60_000;
  return events.filter((timestamp) => timestamp > windowStart);
}

export class PostgresIntakeTokenRateLimiter implements IntakeTokenRateLimiter {
  constructor(
    private readonly lockoutConfig: Pick<
      IntakeTokenConfig,
      "lockoutFailureThreshold" | "lockoutDurationMs"
    > = { ...INTAKE_TOKEN_DEFAULTS },
  ) {}

  private async withBucket<T>(
    bucketKey: string,
    now: Date,
    fn: (row: RateLimitRow) => Promise<T>,
  ): Promise<T> {
    return withSystem({ reason: "intake_token_rate_limit_bucket" }, async (client) => {
      await client.query("BEGIN");
      try {
        const { rows } = await client.query<RateLimitRow>(
          `SELECT bucket_key, failure_count, locked_until, success_events
             FROM intake_token_rate_limits
            WHERE bucket_key = $1
            FOR UPDATE`,
          [bucketKey],
        );

        const existing = rows[0];
        const row: RateLimitRow = existing ?? {
          bucket_key: bucketKey,
          failure_count: 0,
          locked_until: null,
          success_events: [],
        };

        row.success_events = pruneSuccessEvents(parseSuccessEvents(row.success_events), now);

        if (row.locked_until && row.locked_until.getTime() <= now.getTime()) {
          row.locked_until = null;
          row.failure_count = 0;
        }

        const result = await fn(row);

        await client.query(
          `INSERT INTO intake_token_rate_limits (bucket_key, failure_count, locked_until, success_events, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, now())
           ON CONFLICT (bucket_key) DO UPDATE
             SET failure_count = EXCLUDED.failure_count,
                 locked_until = EXCLUDED.locked_until,
                 success_events = EXCLUDED.success_events,
                 updated_at = now()`,
          [
            bucketKey,
            row.failure_count,
            row.locked_until,
            JSON.stringify(row.success_events),
          ],
        );

        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private isRowLockedOut(row: RateLimitRow, now: Date): boolean {
    return row.locked_until !== null && row.locked_until.getTime() > now.getTime();
  }

  async isLockedOut(clientIp: string, tokenId: string | null, now: Date): Promise<boolean> {
    const ipLocked = await this.withBucket(`ip:${clientIp}`, now, async (row) =>
      this.isRowLockedOut(row, now),
    );

    if (ipLocked) {
      return true;
    }

    if (!tokenId) {
      return false;
    }

    return this.withBucket(`token:${tokenId}`, now, async (row) =>
      this.isRowLockedOut(row, now),
    );
  }

  async recordFailure(clientIp: string, tokenId: string | null, now: Date): Promise<void> {
    await this.incrementFailures(`ip:${clientIp}`, now);
    if (tokenId) {
      await this.incrementFailures(`token:${tokenId}`, now);
    }
  }

  private async incrementFailures(bucketKey: string, now: Date): Promise<void> {
    await this.withBucket(bucketKey, now, async (row) => {
      const nextCount = row.failure_count + 1;
      row.failure_count = nextCount;
      if (nextCount >= this.lockoutConfig.lockoutFailureThreshold) {
        row.locked_until = new Date(now.getTime() + this.lockoutConfig.lockoutDurationMs);
      }
      return undefined;
    });
  }

  async clearFailures(clientIp: string, tokenId: string | null): Promise<void> {
    await this.resetBucket(`ip:${clientIp}`);
    if (tokenId) {
      await this.resetBucket(`token:${tokenId}`);
    }
  }

  private async resetBucket(bucketKey: string): Promise<void> {
    await withSystem({ reason: "intake_token_rate_limit_reset" }, async (client) => {
      await client.query("DELETE FROM intake_token_rate_limits WHERE bucket_key = $1", [
        bucketKey,
      ]);
    });
  }

  async checkAndRecordSuccess(
    clientIp: string,
    tokenId: string,
    config: Pick<IntakeTokenConfig, "rateLimitPerMin" | "ipRateLimitPerMin">,
    now: Date,
  ): Promise<void> {
    await this.assertUnderLimit(`ip:${clientIp}`, config.ipRateLimitPerMin, now);
    await this.assertUnderLimit(`token:${tokenId}`, config.rateLimitPerMin, now);
    await this.recordSuccess(`ip:${clientIp}`, now);
    await this.recordSuccess(`token:${tokenId}`, now);
  }

  private async assertUnderLimit(
    bucketKey: string,
    limit: number,
    now: Date,
  ): Promise<void> {
    await this.withBucket(bucketKey, now, async (row) => {
      if (row.success_events.length >= limit) {
        throw new IntakeTokenError("rate_limited");
      }
      return undefined;
    });
  }

  private async recordSuccess(bucketKey: string, now: Date): Promise<void> {
    await this.withBucket(bucketKey, now, async (row) => {
      row.success_events.push(now.getTime());
      return undefined;
    });
  }
}
