import { env } from "@/lib/env";

import { DrizzleIntakeTokenStore } from "./drizzle-token-store";
import {
  createIntakeTokenService,
  INTAKE_TOKEN_DEFAULTS,
  type IntakeTokenService,
} from "./intake-token";
import { PostgresIntakeTokenRateLimiter } from "./postgres-intake-token-rate-limiter";

let cachedService: IntakeTokenService | undefined;

export function getIntakeTokenService(): IntakeTokenService {
  if (cachedService) {
    return cachedService;
  }

  cachedService = createIntakeTokenService(
    new DrizzleIntakeTokenStore(),
    new PostgresIntakeTokenRateLimiter({
      lockoutFailureThreshold: INTAKE_TOKEN_DEFAULTS.lockoutFailureThreshold,
      lockoutDurationMs: INTAKE_TOKEN_DEFAULTS.lockoutDurationMs,
    }),
    {
      ttlDays: env.INTAKE_TOKEN_TTL_DAYS,
      rateLimitPerMin: env.INTAKE_TOKEN_RATE_LIMIT_PER_MIN,
      ipRateLimitPerMin: env.INTAKE_TOKEN_RATE_LIMIT_PER_MIN,
      lockoutFailureThreshold: INTAKE_TOKEN_DEFAULTS.lockoutFailureThreshold,
      lockoutDurationMs: INTAKE_TOKEN_DEFAULTS.lockoutDurationMs,
    },
  );

  return cachedService;
}
