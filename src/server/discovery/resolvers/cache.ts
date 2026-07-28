/**
 * Cache resolver (L0)
 *
 * In-memory cache for recently resolved identities
 * TTL: 24 hours
 */

import type { IdentityResolver, ResolvedCandidate } from "../types";

interface CacheEntry {
  candidates: ResolvedCandidate[];
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cache resolver
 */
export class CacheResolver implements IdentityResolver {
  name = "cache";
  private cache = new Map<string, CacheEntry>();

  /**
   * Resolve from cache
   */
  async resolve(input: string, opts?: { limit?: number }): Promise<ResolvedCandidate[]> {
    const key = this.getCacheKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      return [];
    }

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return [];
    }

    // Return cached results
    const limit = opts?.limit || 10;
    return entry.candidates.slice(0, limit);
  }

  /**
   * Store in cache
   */
  store(input: string, candidates: ResolvedCandidate[]): void {
    const key = this.getCacheKey(input);
    this.cache.set(key, {
      candidates,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats(): {
    size: number;
    entries: Array<{ key: string; candidates: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      candidates: entry.candidates.length,
      age: now - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    return true; // Cache is always healthy
  }

  /**
   * Get cache key
   */
  private getCacheKey(input: string): string {
    return input.toLowerCase().trim();
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}

/**
 * Global cache resolver instance
 */
let globalCache: CacheResolver | null = null;

/**
 * Get global cache resolver
 */
export function getCacheResolver(): CacheResolver {
  if (!globalCache) {
    globalCache = new CacheResolver();
    // Clean expired entries every minute
    setInterval(() => globalCache?.cleanExpired(), 60 * 1000);
  }
  return globalCache;
}
