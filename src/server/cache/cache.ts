/**
 * Cache layer with stale-while-revalidate and single-flight locking.
 *
 * Pattern:
 * 1. Check cache (L0 Redis)
 * 2. If hit and fresh, return immediately (even if stale)
 * 3. If stale, enqueue background refresh
 * 4. If miss, acquire lock to prevent thundering herd
 * 5. Call loader function (only one caller per key)
 * 6. Store result in cache with TTL
 */

import { getRedis } from "./redis";
import { CacheTTL } from "./keys";
import { withLock } from "./locks";

export interface CacheOptions {
  ttl?: number; // seconds
  staleTtl?: number; // seconds, how long to serve stale data
  maxSize?: number; // bytes, skip caching if larger
}

interface CachedValue<T> {
  data: T;
  timestamp: number;
}

/**
 * Track cache hits/misses per layer (L0=Redis, L1=DB, L2=Mirror, L3=Web).
 */
export const cacheMetrics = {
  L0: { hits: 0, misses: 0 },
  L1: { hits: 0, misses: 0 },
  L2: { hits: 0, misses: 0 },
  L3: { hits: 0, misses: 0 },
};

/**
 * Attempt to get value from cache, serving stale data if needed.
 * If stale and loader provided, enqueue background refresh.
 *
 * @param key Cache key
 * @param ttl Cache TTL (seconds)
 * @param loader Function to load fresh data if cache miss
 * @param options Additional options
 */
export async function cached<T>(
  key: string,
  ttl: number = CacheTTL.INSTITUTION,
  loader?: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T | null> {
  const redis = getRedis();
  const { staleTtl = ttl, maxSize = 200 * 1024 } = options; // 200KB default max

  try {
    // Try to get from cache
    const cached = await redis.get(key);

    if (cached) {
      try {
        const parsed = JSON.parse(cached as string) as CachedValue<T>;
        const now = Date.now();
        const age = now - parsed.timestamp;
        const ttlMs = ttl * 1000;
        const staleTtlMs = staleTtl * 1000;

        // Hit: return immediately
        if (age < ttlMs) {
          cacheMetrics.L0.hits++;
          return parsed.data;
        }

        // Stale: return but enqueue refresh
        if (age < staleTtlMs && loader) {
          cacheMetrics.L0.hits++;
          // Fire-and-forget refresh
          refreshCacheAsync(key, ttl, loader, maxSize).catch((e) => {
            console.error(`Cache refresh failed for ${key}:`, e);
          });
          return parsed.data;
        }

        // Expired: treat as miss
        cacheMetrics.L0.misses++;
      } catch (e) {
        // Parse error, treat as miss
        cacheMetrics.L0.misses++;
      }
    } else {
      cacheMetrics.L0.misses++;
    }
  } catch (redisError) {
    // Redis error, fall through to loader
    console.error(`Cache get failed for ${key}:`, redisError);
    cacheMetrics.L0.misses++;
  }

  // Cache miss: call loader with single-flight lock
  if (!loader) {
    return null;
  }

  return await loadWithSingleFlight(key, ttl, loader, maxSize);
}

/**
 * Load fresh data with single-flight locking.
 * Multiple concurrent requests for the same key only call loader once.
 */
async function loadWithSingleFlight<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  maxSize: number
): Promise<T | null> {
  const redis = getRedis();
  const lockKey = `${key}:lock`;

  try {
    // Try to acquire lock (60s timeout, auto-extend)
    const acquired = await withLock(lockKey, 60000, async () => {
      // We have the lock. Double-check cache in case another waiter just filled it.
      const rechecked = await redis.get(key);
      if (rechecked) {
        try {
          const parsed = JSON.parse(rechecked as string) as CachedValue<T>;
          return parsed.data;
        } catch {
          // Parse error, continue loading
        }
      }

      // Load fresh data
      const data = await loader();

      // Cache if not too large
      const serialized = JSON.stringify({ data, timestamp: Date.now() });
      if (serialized.length <= maxSize) {
        await redis.set(key, serialized, ttl);
      }

      return data;
    });

    return acquired;
  } catch (error) {
    // Lock timeout or load error, return null
    console.error(`Single-flight load failed for ${key}:`, error);
    return null;
  }
}

/**
 * Refresh cache in the background (fire-and-forget).
 */
async function refreshCacheAsync<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  maxSize: number
) {
  const redis = getRedis();

  try {
    const data = await loader();
    const serialized = JSON.stringify({ data, timestamp: Date.now() });
    if (serialized.length <= maxSize) {
      await redis.set(key, serialized, ttl);
    }
  } catch (error) {
    // Silently fail on refresh (stale data is still good enough)
    console.debug(`Async cache refresh failed for ${key}:`, error);
  }
}

/**
 * Invalidate a cache key (delete).
 */
export async function invalidateCache(key: string) {
  const redis = getRedis();
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache invalidation failed for ${key}:`, error);
  }
}

/**
 * Invalidate multiple cache keys at once.
 */
export async function invalidateCacheBatch(keys: string[]) {
  if (keys.length === 0) return;

  const redis = getRedis();
  try {
    await redis.del(...keys);
  } catch (error) {
    console.error(`Batch cache invalidation failed:`, error);
  }
}

/**
 * Get cache metrics.
 */
export function getCacheMetrics() {
  return {
    L0: {
      ...cacheMetrics.L0,
      hitRate: cacheMetrics.L0.hits / (cacheMetrics.L0.hits + cacheMetrics.L0.misses) || 0,
    },
  };
}

/**
 * Clear all metrics (for testing).
 */
export function resetCacheMetrics() {
  cacheMetrics.L0.hits = 0;
  cacheMetrics.L0.misses = 0;
  cacheMetrics.L1.hits = 0;
  cacheMetrics.L1.misses = 0;
  cacheMetrics.L2.hits = 0;
  cacheMetrics.L2.misses = 0;
  cacheMetrics.L3.hits = 0;
  cacheMetrics.L3.misses = 0;
}
