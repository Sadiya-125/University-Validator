/**
 * Rate limiting with @upstash/ratelimit sliding windows.
 * Per-provider and global rate limits prevent exhausting external APIs.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";
import { CacheKeys } from "./keys";
import { RateLimitError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

// Rate limiters per provider
const limiters = new Map<string, Ratelimit>();

/**
 * Create or get a rate limiter for a provider.
 * Uses Redis behind the scenes (or in-memory fallback).
 */
function getRateLimiter(scope: string): Ratelimit | null {
  if (limiters.has(scope)) {
    return limiters.get(scope)!;
  }

  const env = getServerEnv();
  const hasUpstash =
    env.UPSTASH_REDIS_REST_URL &&
    env.UPSTASH_REDIS_REST_URL.length > 0 &&
    env.UPSTASH_REDIS_REST_TOKEN &&
    env.UPSTASH_REDIS_REST_TOKEN.length > 0;

  if (!hasUpstash) {
    // Return null; in-memory implementation below handles this
    return null;
  }

  const redis = getRedis();
  if (!redis) return null;

  // Create Upstash ratelimiter
  const limiter = new Ratelimit({
    redis: redis as any,
    prefix: scope,
    limiter: Ratelimit.slidingWindow(100, "1h"), // Default: 100/hour
    analytics: false,
  } as any);

  limiters.set(scope, limiter);
  return limiter;
}

/**
 * Check if a request should be rate limited.
 * Uses sliding window: counts requests in a rolling time window.
 *
 * @param scope Limiter scope (e.g., "searxng", "duckduckgo")
 * @param identifier Request identifier (e.g., IP, user ID, hostname)
 * @param limit Max requests in the window
 * @param windowSeconds Window duration in seconds
 * @returns { allowed: boolean, remaining: number, resetIn: number }
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number = 100,
  windowSeconds: number = 3600
): Promise<{
  allowed: boolean;
  remaining: number;
  resetIn: number;
}> {
  const redis = getRedis();

  try {
    // Try to use Upstash ratelimit if available
    const limiter = getRateLimiter(scope);
    if (limiter) {
      const key = `${scope}:${identifier}`;
      const result = await limiter.limit(key);

      const resetIn = result.reset ? Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)) : 0;

      return {
        allowed: result.success,
        remaining: Math.max(0, result.remaining ?? 0),
        resetIn,
      };
    }

    // Fallback: manual sliding window in Redis/in-memory
    const key = CacheKeys.rateLimit(scope, identifier);
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Get all requests in this window
    const requestTimes = (await redis.lrange(key, 0, -1)) as number[];
    const recentRequests = requestTimes.filter((t) => t > windowStart);

    const allowed = recentRequests.length < limit;

    if (allowed) {
      // Record this request
      await redis.lpush(key, now);
      // Trim old entries
      await redis.lrange(key, 0, limit); // Keep only recent entries
      // Set expiry
      await redis.expire(key, windowSeconds);
    }

    const resetIn =
      recentRequests.length > 0
        ? Math.ceil(((recentRequests[0] as any) + windowMs - now) / 1000)
        : 0;

    return {
      allowed,
      remaining: Math.max(0, limit - recentRequests.length),
      resetIn,
    };
  } catch (error) {
    console.error(`Rate limit check failed for ${scope}:${identifier}:`, error);
    // On error, deny to be safe (fail closed)
    return { allowed: false, remaining: 0, resetIn: 60 };
  }
}

/**
 * Enforce a rate limit (throw if exceeded).
 */
export async function enforceRateLimit(
  scope: string,
  identifier: string,
  limit: number = 100,
  windowSeconds: number = 3600
) {
  const result = await checkRateLimit(scope, identifier, limit, windowSeconds);

  if (!result.allowed) {
    throw new RateLimitError(scope, result.resetIn, { scope, identifier });
  }

  return result;
}

/**
 * Provider-specific rate limit configurations.
 */
export const ProviderLimits = {
  SEARXNG: { limit: 30, windowSeconds: 60 }, // 30 per minute
  DUCKDUCKGO: { limit: 60, windowSeconds: 120 }, // 60 per 2 minutes (max 1 req per 2s global)
  GOOGLE_CSE: { limit: 100, windowSeconds: 86400 }, // 100 per day (free tier)
  WIKIDATA: { limit: 500, windowSeconds: 3600 }, // 500 per hour
  WEBSITE_FETCH: { limit: 10, windowSeconds: 60 }, // 10 per minute per domain
  LLM: { limit: 100, windowSeconds: 60 }, // 100 per minute globally
  BROWSER: { limit: 20, windowSeconds: 60 }, // 20 per minute
} as const;

/**
 * Reset rate limit (for testing).
 */
export async function resetRateLimit(scope: string, identifier: string) {
  const redis = getRedis();
  const key = CacheKeys.rateLimit(scope, identifier);
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Failed to reset rate limit ${scope}:${identifier}:`, error);
  }
}

/**
 * Get current rate limit status for monitoring.
 */
export async function getRateLimitStatus(
  scope: string,
  identifier: string,
  windowSeconds: number = 3600
) {
  return checkRateLimit(scope, identifier, 1000, windowSeconds);
}
