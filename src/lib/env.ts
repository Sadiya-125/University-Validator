import { z } from "zod";

/**
 * Zod-validated environment schema.
 * Validates all environment variables at boot time.
 * Fails fast with readable error messages if any required variable is missing.
 */

const serverEnvSchema = z.object({
  // Application
  APP_ENV: z.enum(["development", "preview", "production"]),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),
  DATABASE_POOLED_URL: z
    .string()
    .url("DATABASE_POOLED_URL must be a valid PostgreSQL connection string"),

  // Redis (Upstash REST, optional for offline dev)
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal("")),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal("")),

  // Inngest
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: z.string(),
  INNGEST_DEV: z.coerce.boolean().default(true),

  // Self-hosted Infrastructure
  INFRA_TOKEN: z.string(),
  SEARXNG_URL: z.string().url(),
  BROWSER_SERVICE_URL: z.string().url(),
  EMBEDDINGS_URL: z.string().url(),

  // Search
  SEARCH_CHAIN: z.string().default("searxng,duckduckgo"),

  // LLM
  LLM_PROVIDER: z.enum(["gemini", "openai-compatible"]),
  GEMINI_API_KEY: z.string().optional().or(z.literal("")),
  LLM_MODEL: z.string(),
  LLM_BASE_URL: z.string().url().optional().or(z.literal("")),
  LLM_API_KEY: z.string().optional().or(z.literal("")),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(2048),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  LLM_VERIFY_SSL: z.coerce.boolean().default(true),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RUN_COST_USD: z.coerce.number().positive().default(0.05),

  // Storage / Observability
  BLOB_READ_WRITE_TOKEN: z.string().optional().or(z.literal("")),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal("")),
  METRICS_TOKEN: z.string().optional().or(z.literal("")),

  // Feature Flags
  USE_BROWSER: z.coerce.boolean().default(true),
  USE_LLM_REASONING: z.coerce.boolean().default(true),
  USE_LIVE_AUTHORITIES: z.coerce.boolean().default(true),
  USE_VECTOR_SEARCH: z.coerce.boolean().default(true),
  USE_WIKIDATA: z.coerce.boolean().default(true),
  STRICT_ROBOTS: z.coerce.boolean().default(true),
  READ_ONLY_MODE: z.coerce.boolean().default(false),

  // Crawler Identity
  CRAWLER_USER_AGENT: z.string().default(
    "UniversityValidationBot/1.0 (+https://your-domain.tld/about-bot)"
  ),
  CRAWLER_CONTACT_EMAIL: z.string().email().default("you@your-domain.tld"),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;
type ClientEnv = z.infer<typeof clientEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedClientEnv: ClientEnv | null = null;

/**
 * Validate and return server-side environment variables.
 * Validates at first call and caches the result.
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  try {
    cachedServerEnv = serverEnvSchema.parse(process.env);
    return cachedServerEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(
        `Invalid or missing environment variables:\n${missingVars}\n\n` +
          `See .env.example for all required variables.`
      );
    }
    throw error;
  }
}

/**
 * Validate and return client-side environment variables.
 * Only includes variables prefixed with NEXT_PUBLIC_.
 */
export function getClientEnv(): ClientEnv {
  if (cachedClientEnv) {
    return cachedClientEnv;
  }

  try {
    cachedClientEnv = clientEnvSchema.parse({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
    return cachedClientEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(
        `Invalid or missing client environment variables:\n${missingVars}\n\n` +
          `See .env.example for all required variables.`
      );
    }
    throw error;
  }
}

/**
 * Export types for use in application code
 */
export type { ServerEnv, ClientEnv };
