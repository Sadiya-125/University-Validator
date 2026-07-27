/**
 * Redis client singleton with lazy initialization.
 * Supports Upstash Redis (REST) with in-memory fallback for tests and offline dev.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are missing,
 * falls back to an in-memory LRU cache so tests and offline dev work.
 */

import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";

// In-memory cache for testing and offline dev
class InMemoryCache {
  private data = new Map<string, { value: unknown; expiresAt?: number }>();
  private lruAccess = new Map<string, number>();
  private accessCounter = 0;
  private maxEntries = 10000;

  async get(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }

    this.lruAccess.set(key, this.accessCounter++);
    return entry.value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    // Evict LRU entry if we're at capacity
    if (this.data.size >= this.maxEntries) {
      let lruKey = "";
      let lruTime = Infinity;
      for (const [k, time] of this.lruAccess) {
        if (time < lruTime) {
          lruKey = k;
          lruTime = time;
        }
      }
      if (lruKey) {
        this.data.delete(lruKey);
        this.lruAccess.delete(lruKey);
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
    this.lruAccess.set(key, this.accessCounter++);
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.data.has(key)) {
        this.data.delete(key);
        this.lruAccess.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.data.has(key)) {
        count++;
      }
    }
    return count;
  }

  async incr(key: string): Promise<number> {
    const current = (await this.get(key)) as number | null;
    const next = ((current ?? 0) as number) + 1;
    await this.set(key, next);
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.data.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.data.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return Math.max(remaining, 0);
  }

  async mget(...keys: string[]): Promise<unknown[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async mset(...args: any[]): Promise<void> {
    for (let i = 0; i < args.length; i += 2) {
      await this.set(args[i], args[i + 1]);
    }
  }

  async lpush(key: string, ...values: unknown[]): Promise<number> {
    const list = (await this.get(key)) as unknown[] | null;
    const newList = [...values, ...(list || [])];
    await this.set(key, newList);
    return newList.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<unknown[]> {
    const list = (await this.get(key)) as unknown[] | null;
    if (!list) return [];
    return list.slice(start, stop + 1);
  }

  async llen(key: string): Promise<number> {
    const list = (await this.get(key)) as unknown[] | null;
    return (list || []).length;
  }

  async hset(key: string, field: string, value: unknown): Promise<number> {
    const hash = (await this.get(key)) as Record<string, unknown> | null;
    const newHash = { ...hash, [field]: value };
    await this.set(key, newHash);
    return hash && hash[field] !== undefined ? 0 : 1;
  }

  async hget(key: string, field: string): Promise<unknown> {
    const hash = (await this.get(key)) as Record<string, unknown> | null;
    return hash?.[field] ?? null;
  }

  async hgetall(key: string): Promise<Record<string, unknown>> {
    return ((await this.get(key)) as Record<string, unknown> | null) || {};
  }

  async flushdb(): Promise<void> {
    this.data.clear();
    this.lruAccess.clear();
  }
}

type RedisClient = Redis | InMemoryCache;

let redisClient: RedisClient | null = null;

/**
 * Get or initialize the Redis client.
 * Returns Upstash Redis if credentials available, otherwise in-memory cache.
 */
export function getRedis(): RedisClient {
  if (redisClient) {
    return redisClient;
  }

  const env = getServerEnv();

  const hasUpstashCreds =
    env.UPSTASH_REDIS_REST_URL &&
    env.UPSTASH_REDIS_REST_URL.length > 0 &&
    env.UPSTASH_REDIS_REST_TOKEN &&
    env.UPSTASH_REDIS_REST_TOKEN.length > 0;

  if (hasUpstashCreds) {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("✓ Redis: Using Upstash REST client");
  } else {
    redisClient = new InMemoryCache();
    console.log("⚠ Redis: Upstash credentials not found, using in-memory cache");
  }

  return redisClient;
}

/**
 * Reset Redis client (for testing).
 */
export function resetRedis() {
  redisClient = null;
}

// Export convenience alias
export const redis = getRedis();

export type { RedisClient };
