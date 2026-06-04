import { z } from "zod";

/**
 * Application environment contract (PRD §1.3).
 * Validates synchronously at import — missing required vars throw immediately.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_REGION: z.string().min(1, "S3_REGION is required"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-sonnet-4"),
  OPENROUTER_HTTP_REFERER: z.string().url().optional(),
  OPENROUTER_APP_TITLE: z.string().min(1).optional(),
  /** Legacy clinician/dashboard LLM paths (optional during OpenRouter migration). */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  INTAKE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  INTAKE_TOKEN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  WHISPER_SERVICE_URL: z.string().url().default("http://whisper:9000"),
  TEXTRACT_REGION: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}

/** Validated environment — throws on first import if required variables are missing. */
export const env = loadEnv();
