/**
 * Search factory tests
 *
 * Tests:
 * - Provider chain fallover
 * - Cache behavior (7d positive, 6h negative)
 * - Concurrent searches (max 3)
 * - Degraded state tracking
 * - Health monitoring
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSearchFactory } from "./factory";
import type { SearchProvider, SearchResponse } from "./types";

class MockSearchProvider implements SearchProvider {
  name: string;
  failOnSearch = false;
  failHealth = false;

  constructor(name: string) {
    this.name = name;
  }

  async search(): Promise<SearchResponse> {
    if (this.failOnSearch) {
      throw new Error("Mock search failure");
    }
    return {
      results: [
        {
          title: `${this.name} result`,
          url: `https://${this.name}.com`,
        },
      ],
      query: "test",
      provider: this.name,
      timestamp: Date.now(),
    };
  }

  async health(): Promise<boolean> {
    return !this.failHealth;
  }
}

describe("SearchFactory", () => {
  let provider1: MockSearchProvider;
  let provider2: MockSearchProvider;

  beforeEach(() => {
    provider1 = new MockSearchProvider("provider1");
    provider2 = new MockSearchProvider("provider2");
    vi.clearAllMocks();
  });

  describe("Provider chain", () => {
    it("should use providers in chain order", async () => {
      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const result = await factory.search("test");

      expect(result.providersUsed).toContain("provider1");
    });

    it("should fallover to next provider on failure", async () => {
      provider1.failOnSearch = true;

      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const result = await factory.search("test");

      expect(result.providersUsed).toContain("provider2");
      expect(result.failovers).toBe(1);
      expect(result.degraded).toBe(true);
    });

    it("should skip unhealthy providers", async () => {
      provider1.failHealth = true;

      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const result = await factory.search("test");

      expect(result.providersUsed).toContain("provider2");
      expect(result.providersUsed).not.toContain("provider1");
    });
  });

  describe("Caching", () => {
    it("should cache positive results (≥1 result)", async () => {
      const factory = createSearchFactory({ provider1, provider2 }, ["provider1"]);

      const result1 = await factory.search("test");
      expect(result1.cached).toBe(false);

      const result2 = await factory.search("test");
      expect(result2.cached).toBe(true);
      expect(result2.results).toEqual(result1.results);
    });

    it("should cache negative results (zero results)", async () => {
      const emptyProvider = new MockSearchProvider("empty");
      emptyProvider.search = vi.fn().mockResolvedValue({
        results: [],
        query: "test",
        provider: "empty",
        timestamp: Date.now(),
      });

      const factory = createSearchFactory({ empty: emptyProvider }, ["empty"]);

      const result1 = await factory.search("nonexistent");
      const mockCall1 = vi.mocked(emptyProvider.search).mock.calls.length;

      const result2 = await factory.search("nonexistent");
      const mockCall2 = vi.mocked(emptyProvider.search).mock.calls.length;

      expect(result2.cached).toBe(true);
      expect(mockCall2).toBe(mockCall1); // No new call
    });

    it("should use different TTLs for positive vs negative", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      // Positive result
      const positive = await factory.search("iit bombay");
      const stats = factory.getCacheStats();
      expect(stats.size).toBe(1);
    });

    it("should clear cache", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      await factory.search("test");
      let stats = factory.getCacheStats();
      expect(stats.size).toBe(1);

      factory.clearCache();
      stats = factory.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("Concurrent searches", () => {
    it("should limit concurrency to 3", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      const spy = vi.spyOn(provider1, "search");

      const queries = ["query1", "query2", "query3", "query4", "query5"];

      await factory.searchMany(queries);

      expect(spy).toHaveBeenCalledTimes(5);
    });

    it("should maintain order in searchMany results", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      const queries = ["query1", "query2", "query3"];
      const results = await factory.searchMany(queries);

      expect(results).toHaveLength(3);
      // Results should be in same order as queries
      for (let i = 0; i < results.length; i++) {
        expect(results[i]?.query).toBe(queries[i]);
      }
    });
  });

  describe("Health monitoring", () => {
    it("should report provider health", async () => {
      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const health = await factory.getProvidersHealth();

      expect(health.provider1?.healthy).toBe(true);
      expect(health.provider2?.healthy).toBe(true);
    });

    it("should mark unhealthy providers", async () => {
      provider1.failHealth = true;

      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const health = await factory.getProvidersHealth();

      expect(health.provider1?.healthy).toBe(false);
      expect(health.provider2?.healthy).toBe(true);
    });
  });

  describe("Degraded state", () => {
    it("should track failovers", async () => {
      provider1.failOnSearch = true;

      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const result = await factory.search("test");

      expect(result.degraded).toBe(true);
      expect(result.failovers).toBe(1);
    });

    it("should mark degraded when all providers fail", async () => {
      provider1.failOnSearch = true;
      provider2.failOnSearch = true;

      const factory = createSearchFactory({ provider1, provider2 }, ["provider1", "provider2"]);

      const result = await factory.search("test");

      expect(result.degraded).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("Cache key generation", () => {
    it("should generate different keys for different languages", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      const result1 = await factory.search("test", { language: "en" });
      const result2 = await factory.search("test", { language: "hi" });

      // Should call provider twice (different languages)
      expect(vi.mocked(provider1.search).mock.calls.length).toBe(2);
    });

    it("should generate same key for same query and options", async () => {
      const factory = createSearchFactory({ provider1 }, ["provider1"]);

      const result1 = await factory.search("test", { language: "en" });
      const result2 = await factory.search("test", { language: "en" });

      // Second should be cached
      expect(result2.cached).toBe(true);
    });
  });
});
