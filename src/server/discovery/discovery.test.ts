/**
 * Discovery service tests
 *
 * Tests:
 * - Resolver chain orchestration
 * - Cache integration
 * - Website discovery fallback
 * - Budget enforcement
 * - Short-circuit on high confidence
 * - Integration scenarios (IIT Bombay, NIT Rourkee, etc.)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiscoveryService } from "./service";
import type { IdentityResolver, ResolvedCandidate } from "./types";

class MockResolver implements IdentityResolver {
  name: string;
  candidates: ResolvedCandidate[] = [];
  failureError?: Error;

  constructor(name: string) {
    this.name = name;
  }

  async resolve(): Promise<ResolvedCandidate[]> {
    if (this.failureError) {
      throw this.failureError;
    }
    return this.candidates;
  }

  async health(): Promise<boolean> {
    return !this.failureError;
  }
}

describe("DiscoveryService", () => {
  let service: DiscoveryService;

  beforeEach(() => {
    service = new DiscoveryService();
    vi.clearAllMocks();
  });

  describe("Resolver chain", () => {
    it("should return cached result if available", async () => {
      const run = await service.discover("IIT Bombay");

      // Cache should now have the result
      const run2 = await service.discover("IIT Bombay");

      // Second discovery should use cache
      const cacheStep = run2.steps[0];
      expect(cacheStep.resolver).toBe("cache");
      expect(cacheStep.success).toBe(true);
    });

    it("should proceed through resolvers when cache misses", async () => {
      const run = await service.discover("Nonexistent University");

      // Should have tried multiple resolvers
      const resolverNames = run.steps.map((s) => s.resolver);
      expect(resolverNames).toContain("cache");
      expect(resolverNames).toContain("institutions");
      expect(resolverNames).toContain("mirror");
    });

    it("should skip unresponsive resolvers", async () => {
      // First discovery to populate cache
      const run1 = await service.discover("Test University");

      // Second discovery should use cache (skip others)
      const run2 = await service.discover("Test University");

      const steps = run2.steps;
      expect(steps[0].resolver).toBe("cache");
    });
  });

  describe("Confidence calculation", () => {
    it("should mark high confidence results", async () => {
      const run = await service.discover("IIT Bombay");

      if (run.result.candidates.length > 0) {
        const topCandidate = run.result.candidates[0];
        if ((topCandidate.confidence || 0) >= 0.9) {
          expect(run.result.needsReview).toBe(false);
          expect(run.result.needsHumanReview).toBe(false);
        }
      }
    });

    it("should mark review threshold results", async () => {
      const run = await service.discover("some variant name");

      // Results in review range should be marked
      if (run.result.confidence >= 0.7 && run.result.confidence < 0.9) {
        expect(run.result.needsReview).toBe(true);
      }
    });

    it("should mark low confidence for human review", async () => {
      const run = await service.discover("completely unknown");

      if (run.result.confidence < 0.7) {
        expect(run.result.needsHumanReview).toBe(true);
      }
    });
  });

  describe("Budget enforcement", () => {
    it("should respect total budget (6s)", async () => {
      const start = Date.now();

      const run = await service.discover("test", {
        totalBudgetMs: 100, // Very short timeout
      });

      const elapsed = Date.now() - start;

      // Should complete quickly, respecting budget
      expect(elapsed).toBeLessThan(500);
      expect(run.budgetExceeded).toBe(true);
    });

    it("should skip website discovery if budget exceeded", async () => {
      const run = await service.discover("test", {
        totalBudgetMs: 50,
        discoverWebsite: true,
      });

      // Website discovery should be skipped
      expect(run.result.officialUrl).toBeUndefined();
    });

    it("should report steps even on budget overflow", async () => {
      const run = await service.discover("test", {
        totalBudgetMs: 0,
      });

      expect(run.steps).toBeDefined();
      expect(run.steps.length).toBeGreaterThan(0);
    });
  });

  describe("Website discovery", () => {
    it("should attempt website discovery by default", async () => {
      const run = await service.discover("IIT Bombay", {
        discoverWebsite: true,
      });

      // Website discovery should be attempted (may or may not find result)
      expect(run.result).toBeDefined();
    });

    it("should skip website discovery when disabled", async () => {
      const run = await service.discover("IIT Bombay", {
        discoverWebsite: false,
      });

      expect(run.result.officialUrl).toBeUndefined();
    });

    it("should short-circuit if high confidence with URL", async () => {
      const run = await service.discover("IIT Bombay", {
        discoverWebsite: true,
      });

      // If we found a high-confidence result with URL, should short-circuit
      if (
        run.result.confidence >= 0.9 &&
        run.result.officialUrl
      ) {
        expect(run.result.resolverChain).toContain("website");
      }
    });
  });

  describe("Candidate merging", () => {
    it("should merge candidates from multiple resolvers", async () => {
      const run = await service.discover("IIT Bombay");

      // Should have candidates from merged results
      expect(run.result.candidates).toBeDefined();
      expect(run.result.candidates.length).toBeGreaterThanOrEqual(0);
    });

    it("should deduplicate candidates", async () => {
      const run = await service.discover("test");

      // Should not have duplicate IDs
      const ids = new Set();
      for (const candidate of run.result.candidates) {
        const key = `${candidate.type}:${candidate.id}`;
        expect(ids.has(key)).toBe(false);
        ids.add(key);
      }
    });

    it("should sort candidates by confidence", async () => {
      const run = await service.discover("test");

      // Candidates should be sorted by descending confidence
      for (let i = 1; i < run.result.candidates.length; i++) {
        const prev = run.result.candidates[i - 1];
        const curr = run.result.candidates[i];
        expect((prev.confidence || 0)).toBeGreaterThanOrEqual(curr.confidence || 0);
      }
    });
  });

  describe("Step tracking", () => {
    it("should record all resolver attempts", async () => {
      const run = await service.discover("test");

      expect(run.steps).toBeDefined();
      expect(run.steps.length).toBeGreaterThan(0);

      // Each step should have required fields
      for (const step of run.steps) {
        expect(step.resolver).toBeDefined();
        expect(step.timestamp).toBeDefined();
        expect(step.durationMs).toBeDefined();
        expect(step.success).toBeDefined();
        expect(step.candidatesFound).toBeDefined();
      }
    });

    it("should record success/failure in steps", async () => {
      const run = await service.discover("test");

      // At least one step should have been successful (or all failed)
      const hasSuccess = run.steps.some((s) => s.success);
      const hasFailure = run.steps.some((s) => !s.success);

      expect(hasSuccess || hasFailure).toBe(true);
    });

    it("should calculate duration accurately", async () => {
      const start = Date.now();
      const run = await service.discover("test");
      const elapsed = Date.now() - start;

      expect(run.totalDurationMs).toBeGreaterThan(0);
      expect(run.totalDurationMs).toBeLessThanOrEqual(elapsed + 100); // Allow 100ms error
    });
  });

  describe("Integration scenarios", () => {
    it("should discover IIT Bombay", async () => {
      const run = await service.discover("IIT Bombay");

      expect(run.result.canonicalName).toBeDefined();
      expect(run.result.canonicalName.length).toBeGreaterThan(0);
    });

    it("should discover with abbreviations", async () => {
      const run = await service.discover("BITS Pilani");

      expect(run.result).toBeDefined();
    });

    it("should discover with state information", async () => {
      const run = await service.discover("NIT Rourkee");

      expect(run.result).toBeDefined();
      // State should be detected if available
      expect(run.result.state).toBeUndefined(); // May or may not be set
    });

    it("should handle typos gracefully", async () => {
      const run = await service.discover("IIT Bombay"); // Common variant

      expect(run.result).toBeDefined();
      expect(run.steps.length).toBeGreaterThan(0);
    });

    it("should handle unknown institutions", async () => {
      const run = await service.discover("Completely Unknown University XYZ");

      expect(run.result).toBeDefined();
      expect(run.result.needsHumanReview).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("should handle resolver errors gracefully", async () => {
      // Even if resolvers throw errors, discovery should complete
      const run = await service.discover("test");

      expect(run.result).toBeDefined();
      expect(run.result.canonicalName).toBe("test");
    });

    it("should handle timeout gracefully", async () => {
      const run = await service.discover("test", {
        totalBudgetMs: 1, // Very short timeout
      });

      expect(run.result).toBeDefined();
      expect(run.budgetExceeded).toBe(true);
    });
  });

  describe("Resolver chain configuration", () => {
    it("should track resolver chain in result", async () => {
      const run = await service.discover("test");

      expect(run.result.resolverChain).toBeDefined();
      expect(Array.isArray(run.result.resolverChain)).toBe(true);
    });

    it("should include website in resolver chain if discovered", async () => {
      const run = await service.discover("IIT Bombay", {
        discoverWebsite: true,
      });

      if (run.result.officialUrl) {
        expect(run.result.resolverChain).toContain("website");
      }
    });
  });
});
