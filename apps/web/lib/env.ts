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
  /** Bedrock runtime region (e.g. us-east-1). */
  AWS_REGION: z.string().min(1).default("us-east-1"),
  /** Legacy — Step 2 intake chat uses Bedrock; omit in production. */
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_HTTP_REFERER: z.string().url().optional(),
  OPENROUTER_APP_TITLE: z.string().min(1).optional(),
  /** Legacy clinician/dashboard LLM paths (optional). */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  ASSEMBLYAI_API_KEY: z.string().optional(),
  INTAKE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  INTAKE_TOKEN_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  WHISPER_SERVICE_URL: z.string().url().default("http://whisper:9000"),
  TEXTRACT_REGION: z.string().optional(),
  /** Public app origin for patient magic links (no trailing slash). */
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SMTP_SERVER: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  EMAIL_FROM_ADDRESS: z.string().email(),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  return envSchema.parse(process.env);
}

/** Validated environment — throws on first import if required variables are missing. */
export const env = loadEnv();
