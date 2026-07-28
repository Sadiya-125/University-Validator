/**
 * Feature flags with database storage and Redis caching.
 * Runtime values live in the DB, cached in Redis 60s, env only as defaults.
 *
 * Usage:
 *   const browserEnabled = await isEnabled("USE_BROWSER");
 *   if (browserEnabled) { ... }
 */

import { getDb } from "@/server/db/client";
import { getRedis } from "./redis";
import { CacheKeys, CacheTTL } from "./keys";
import { featureFlags } from "@/server/db/schema";
import { getServerEnv } from "@/lib/env";
import { eq } from "drizzle-orm";

/**
 * All available feature flags with their environment variable defaults.
 */
const DefaultFlags = {
  USE_BROWSER: true,
  USE_LLM_REASONING: true,
  USE_LIVE_AUTHORITIES: true,
  USE_VECTOR_SEARCH: true,
  USE_WIKIDATA: true,
  STRICT_ROBOTS: true,
  READ_ONLY_MODE: false,
} as const;

export type FeatureFlagKey = keyof typeof DefaultFlags;

/**
 * Check if a feature flag is enabled.
 * Reads from: Redis cache → Database → Environment → Default
 *
 * @param flag Flag key
 * @returns boolean value of the flag
 */
export async function isEnabled(flag: FeatureFlagKey): Promise<boolean> {
  // Try to get from cache first
  const cached = await getCachedFlags();

  if (cached && flag in cached) {
    return Boolean(cached[flag]);
  }

  // Fall back to direct DB query (and update cache)
  const dbResult = await getFromDatabaseSingle(flag);
  if (dbResult !== null) {
    return dbResult;
  }

  // Fall back to environment
  const env = getServerEnv();
  const envKey = `${flag}` as keyof typeof env;
  if (envKey in env) {
    return Boolean((env[envKey]));
  }

  // Fall back to default
  return DefaultFlags[flag];
}

/**
 * Set a feature flag value (in database).
 * Also invalidates cache.
 *
 * @param flag Flag key
 * @param value Flag value
 */
export async function setFlag(flag: FeatureFlagKey, value: boolean) {
  const db = getDb()!;

  try {
    // Upsert into database
    // First try to update
    const result = await db
      .update(featureFlags)
      .set({ value: value ? 1 : 0, updated_at: new Date() })
      .where(eq(featureFlags.key, flag));

    // If no rows updated, insert
    if (!result) {
      await db.insert(featureFlags).values({
        key: flag,
        value: value ? 1 : 0,
        description: `Feature flag: ${flag}`,
      });
    }

    // Invalidate cache
    await invalidateFlagsCache();
  } catch (error) {
    console.error(`Failed to set flag ${flag}:`, error);
    throw error;
  }
}

/**
 * Get all feature flags at once.
 * Useful for dashboard or bulk operations.
 *
 * @returns Map of flag -> value
 */
export async function getAllFlags(): Promise<Map<FeatureFlagKey, boolean>> {
  const cached = await getCachedFlags();
  if (cached) {
    return new Map(Object.entries(cached) as Array<[FeatureFlagKey, boolean]>);
  }

  return await getFromDatabaseAll();
}

/**
 * Get cached flags (from Redis).
 */
async function getCachedFlags(): Promise<Record<string, boolean> | null> {
  const redis = getRedis();
  const cacheKey = CacheKeys.featureFlags();

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string) as Record<string, boolean>;
    }
  } catch (error) {
    console.error("Failed to get cached flags:", error);
  }

  return null;
}

/**
 * Get a single flag from database.
 */
async function getFromDatabaseSingle(
  flag: FeatureFlagKey
): Promise<boolean | null> {
  const db = getDb()!;

  try {
    const rows = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.key, flag));

    const row = rows[0];
    if (!row) return null;
    return Boolean(row.value);
  } catch (error) {
    console.error("Failed to get flag from database:", error);
    return null;
  }
}

/**
 * Get all flags from database and update cache.
 */
async function getFromDatabaseAll(): Promise<Map<FeatureFlagKey, boolean>> {
  const db = getDb()!;
  const redis = getRedis();
  const cacheKey = CacheKeys.featureFlags();

  try {
    const rows = await db.select().from(featureFlags);

    // Build flags map
    const flagMap = new Map<FeatureFlagKey, boolean>();
    for (const row of rows) {
      flagMap.set(row.key as FeatureFlagKey, Boolean(row.value));
    }

    // Cache for 60 seconds
    const cacheData = Object.fromEntries(flagMap);
    await redis.set(cacheKey, JSON.stringify(cacheData), CacheTTL.FEATURE_FLAGS);

    return flagMap;
  } catch (error) {
    console.error("Failed to get flags from database:", error);
    return new Map();
  }
}

/**
 * Invalidate flags cache (call after any flag update).
 */
export async function invalidateFlagsCache() {
  const redis = getRedis();
  const cacheKey = CacheKeys.featureFlags();

  try {
    await redis.del(cacheKey);
  } catch (error) {
    console.error("Failed to invalidate flags cache:", error);
  }
}

/**
 * Initialize flags in database if they don't exist (idempotent).
 * Call this at startup.
 */
export async function initializeFlags() {
  const db = getDb()!;

  for (const [key, defaultValue] of Object.entries(DefaultFlags)) {
    try {
      // Check if exists
      const existing = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, key as FeatureFlagKey))
        .limit(1);

      if (existing.length === 0) {
        // Insert default
        await db.insert(featureFlags).values({
          key: key as FeatureFlagKey,
          value: defaultValue ? 1 : 0,
          description: `Feature flag: ${key}`,
        });
      }
    } catch (error) {
      console.error(`Failed to initialize flag ${key}:`, error);
    }
  }

  // Invalidate cache so it re-loads from DB
  await invalidateFlagsCache();
}

/**
 * Reset all flags to defaults.
 */
export async function resetFlags() {
  const db = getDb()!;

  for (const [key, defaultValue] of Object.entries(DefaultFlags)) {
    try {
      await db
        .update(featureFlags)
        .set({ value: defaultValue ? 1 : 0 })
        .where(eq(featureFlags.key, key as FeatureFlagKey));
    } catch (error) {
      console.error(`Failed to reset flag ${key}:`, error);
    }
  }

  await invalidateFlagsCache();
}
