/**
 * Search factory with provider chain, caching, and fallover
 *
 * Features:
 * - Provider chain from SEARCH_CHAIN env var (default: "searxng,duckduckgo")
 * - In-memory result cache with different TTLs:
 *   - Positive (≥1 result): 7 days
 *   - Negative (0 results): 6 hours
 * - Provider fallover on circuit breaker/quota exhaustion
 * - Tracks failovers and degraded state
 * - searchMany() concurrency: 3
 */

import type { SearchProvider, SearchResponse, SearchResult, FactorySearchResponse } from "./types";
import { SearXNGProvider } from "./providers/searxng";
import { DuckDuckGoProvider } from "./providers/duckduckgo";

const POSITIVE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEGATIVE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const SEARCH_CHAIN_DEFAULT = "searxng,duckduckgo";

interface CacheEntry {
  response: SearchResponse;
  timestamp: number;
  ttl: number;
}

/**
 * Search factory managing provider chain and caching
 */
export class SearchFactory {
  private providers = new Map<string, SearchProvider>();
  private cache = new Map<string, CacheEntry>();
  private chainOrder: string[] = [];

  constructor(customProviders?: Record<string, SearchProvider>, chainOrder?: string[]) {
    // Register default providers
    if (process.env.SEARXNG_URL && process.env.INFRA_TOKEN) {
      this.providers.set(
        "searxng",
        new SearXNGProvider(process.env.SEARXNG_URL, process.env.INFRA_TOKEN)
      );
    }

    this.providers.set("duckduckgo", new DuckDuckGoProvider());

    // Override with custom providers
    if (customProviders) {
      for (const [name, provider] of Object.entries(customProviders)) {
        this.providers.set(name, provider);
      }
    }

    // Set chain order
    this.chainOrder = chainOrder || this.parseChainOrder();

    // Clean expired cache periodically
    setInterval(() => this.cleanCache(), 60 * 1000);
  }

  /**
   * Search with provider chain and caching
   */
  async search(
    query: string,
    opts?: { language?: string; safeSearch?: boolean; reason?: string }
  ): Promise<FactorySearchResponse> {
    const cacheKey = this.getCacheKey(query, opts);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return {
        results: cached.response.results,
        query,
        providersUsed: [cached.response.provider],
        cached: true,
        failovers: 0,
        degraded: false,
        timestamp: Date.now(),
      };
    }

    // Try providers in chain order
    let failovers = 0;
    let degraded = false;
    const providersUsed: string[] = [];

    for (const providerName of this.chainOrder) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      // Check if provider is healthy
      const healthy = await provider.health().catch(() => false);
      if (!healthy) {
        failovers++;
        continue;
      }

      // Check quota if applicable
      if (provider.quotaRemaining) {
        const remaining = await provider.quotaRemaining().catch(() => undefined);
        if (remaining === 0) {
          failovers++;
          continue;
        }
      }

      try {
        const response = await provider.search(query, opts);
        providersUsed.push(providerName);

        // Cache the result
        const ttl = response.results.length > 0 ? POSITIVE_CACHE_TTL : NEGATIVE_CACHE_TTL;
        this.cache.set(cacheKey, {
          response,
          timestamp: Date.now(),
          ttl,
        });

        return {
          results: response.results,
          query,
          providersUsed,
          cached: false,
          failovers,
          degraded: failovers > 0,
          timestamp: Date.now(),
        };
      } catch (error) {
        failovers++;
        degraded = true;
        continue;
      }
    }

    // All providers failed
    return {
      results: [],
      query,
      providersUsed,
      cached: false,
      failovers,
      degraded: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Search multiple queries concurrently (max 3 concurrent)
   */
  async searchMany(
    queries: string[],
    opts?: { language?: string; safeSearch?: boolean; reason?: string }
  ): Promise<FactorySearchResponse[]> {
    const results: FactorySearchResponse[] = [];
    const concurrency = 3;

    for (let i = 0; i < queries.length; i += concurrency) {
      const batch = queries.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((q) => this.search(q, opts)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ query: string; results: number; ttl: number }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      query: key,
      results: entry.response.results.length,
      ttl: entry.ttl,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Get provider chain
   */
  getChain(): string[] {
    return [...this.chainOrder];
  }

  /**
   * Get provider health
   */
  async getProvidersHealth(): Promise<Record<string, { name: string; healthy: boolean }>> {
    const health: Record<string, { name: string; healthy: boolean }> = {};

    for (const [name, provider] of this.providers) {
      const healthy = await provider.health().catch(() => false);
      health[name] = { name: provider.name, healthy };
    }

    return health;
  }

  /**
   * Parse search chain from environment
   */
  private parseChainOrder(): string[] {
    const chain = process.env.SEARCH_CHAIN || SEARCH_CHAIN_DEFAULT;
    return chain.split(",").map((s) => s.trim());
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    query: string,
    opts?: { language?: string; safeSearch?: boolean; reason?: string }
  ): string {
    const parts = [
      query.toLowerCase(),
      opts?.language || "en",
      opts?.safeSearch ? "safe" : "notsafe",
      opts?.reason || "general",
    ];
    return parts.join("|");
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}

/**
 * Global factory instance
 */
let globalFactory: SearchFactory | null = null;

/**
 * Get global search factory instance
 */
export function getSearchFactory(): SearchFactory {
  if (!globalFactory) {
    globalFactory = new SearchFactory();
  }
  return globalFactory;
}

/**
 * Create custom factory (for testing)
 */
export function createSearchFactory(
  providers?: Record<string, SearchProvider>,
  chainOrder?: string[]
): SearchFactory {
  return new SearchFactory(providers, chainOrder);
}
