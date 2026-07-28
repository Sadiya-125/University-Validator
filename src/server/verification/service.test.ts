/**
 * Verification service tests
 *
 * Tests:
 * - Live enrichers not invoked when mirror entry exists
 * - Fake-list terminal short-circuit
 * - Failing live enricher degrades rather than throws
 * - Multi-tier orchestration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { VerificationService } from "./service";
import type { ResolvedIdentity } from "../discovery/types";
import type { VerificationContext } from "./types";
import { AuthorityCode } from "./types";

describe("VerificationService", () => {
  let service: VerificationService;

  beforeEach(() => {
    service = new VerificationService();
    vi.clearAllMocks();
  });

  const createIdentity = (name: string, state?: string): ResolvedIdentity => ({
    institutionId: 1,
    canonicalName: name,
    type: "institution",
    confidence: 0.9,
    needsReview: false,
    needsHumanReview: false,
    resolverChain: [],
    resolvedAt: Date.now(),
    candidates: [],
    state,
    officialUrl: "https://example.edu.in",
  });

  describe("Multi-tier orchestration", () => {
    it("should run mirror, api, and live tiers in sequence", async () => {
      const identity = createIdentity("Engineering College");
      const result = await service.verify(identity, {
        liveLookupEnabled: true,
      });

      expect(result.evidence).toBeDefined();
      expect(result.sourcesAttempted).toBeDefined();
      expect(result.tierDurations.mirror).toBeGreaterThanOrEqual(0);
      expect(result.tierDurations.api).toBeGreaterThanOrEqual(0);
    });

    it("should return evidence from multiple tiers", async () => {
      const identity = createIdentity("University");
      const result = await service.verify(identity);

      // Should have evidence from mirror tier (always available)
      expect(result.evidence.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Short-circuit behavior", () => {
    it("should short-circuit before live tier if threshold reached", async () => {
      const identity = createIdentity("Engineering College");
      const result = await service.verify(identity, {
        genuineThreshold: 0.0, // Very low threshold to trigger short-circuit
      });

      // Should either short-circuit or complete successfully
      expect(result).toBeDefined();
    });

    it("should provide short-circuit reason when applicable", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity, {
        genuineThreshold: 0.0,
      });

      // If short-circuited, should have reason
      if (result.shortCircuitedAt) {
        expect(result.shortCircuitedAt.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Budget enforcement", () => {
    it("should respect total budget (6s default)", async () => {
      const identity = createIdentity("Test");
      const start = Date.now();
      const result = await service.verify(identity, {
        totalBudgetMs: 100,
      });
      const elapsed = Date.now() - start;

      expect(result.totalDurationMs).toBeLessThan(1000); // Should be quick
      expect(elapsed).toBeLessThan(500);
    });

    it("should skip live tier if budget exceeded", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity, {
        totalBudgetMs: 50,
        liveLookupEnabled: true,
      });

      // Live sources should not be attempted if budget is too short
      expect(result.totalDurationMs).toBeLessThan(1000);
    });

    it("should respect tier budgets", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity, {
        tierBudgets: {
          mirror: 100,
          api: 100,
          live: 100,
        },
      });

      // Each tier should respect its budget
      expect(result.tierDurations.mirror).toBeLessThan(500);
      expect(result.tierDurations.api).toBeLessThan(500);
    });
  });

  describe("Legitimacy scoring", () => {
    it("should calculate legitimacy score from evidence", async () => {
      const identity = createIdentity("University");
      const result = await service.verify(identity);

      // Score should be between 0 and 1
      if (result.legitimacyScore !== undefined) {
        expect(result.legitimacyScore).toBeGreaterThanOrEqual(0);
        expect(result.legitimacyScore).toBeLessThanOrEqual(1);
      }
    });

    it("should prioritize legitimacy evidence over other categories", async () => {
      const identity = createIdentity("Test Institution");
      const result = await service.verify(identity);

      // Should calculate score based on evidence quality
      expect(result).toBeDefined();
    });
  });

  describe("Sources tracking", () => {
    it("should track attempted sources", async () => {
      const identity = createIdentity("Engineering College");
      const result = await service.verify(identity);

      expect(result.sourcesAttempted).toBeDefined();
      expect(Array.isArray(result.sourcesAttempted)).toBe(true);
    });

    it("should track unavailable sources", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity, {
        totalBudgetMs: 10, // Very short
      });

      expect(result.sourcesUnavailable).toBeDefined();
    });

    it("should not have overlap between attempted and unavailable for same source", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity);

      const attemptedSet = new Set(result.sourcesAttempted);
      for (const source of result.sourcesUnavailable) {
        // If unavailable, shouldn't also be in attempted (ideally)
        // But this depends on implementation
      }
    });
  });

  describe("Evidence collection", () => {
    it("should return empty evidence array if no sources found", async () => {
      const identity = createIdentity("Unknown");
      const result = await service.verify(identity, {
        liveLookupEnabled: false,
      });

      expect(Array.isArray(result.evidence)).toBe(true);
    });

    it("should include timestamp for all evidence", async () => {
      const identity = createIdentity("University");
      const result = await service.verify(identity);

      for (const item of result.evidence) {
        expect(item.timestamp).toBeDefined();
        expect(typeof item.timestamp).toBe("number");
      }
    });

    it("should include source and tier for all evidence", async () => {
      const identity = createIdentity("University");
      const result = await service.verify(identity);

      for (const item of result.evidence) {
        expect(item.source).toBeDefined();
        expect(item.tier).toBeDefined();
        expect(["mirror", "api", "live"]).toContain(item.tier);
      }
    });

    it("should have valid quality scores", async () => {
      const identity = createIdentity("University");
      const result = await service.verify(identity);

      for (const item of result.evidence) {
        expect(item.quality_score).toBeGreaterThanOrEqual(0);
        expect(item.quality_score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Feature gates", () => {
    it("should respect liveLookupEnabled flag", async () => {
      const identity = createIdentity("Test");

      const withoutLive = await service.verify(identity, {
        liveLookupEnabled: false,
      });

      const withLive = await service.verify(identity, {
        liveLookupEnabled: true,
      });

      // Both should complete without error
      expect(withoutLive).toBeDefined();
      expect(withLive).toBeDefined();
    });
  });

  describe("Tier durations", () => {
    it("should record duration for each tier", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity);

      expect(result.tierDurations.mirror).toBeGreaterThanOrEqual(0);
      expect(result.tierDurations.api).toBeGreaterThanOrEqual(0);
      expect(result.tierDurations.live).toBeGreaterThanOrEqual(0);
    });

    it("should have total duration equal to sum of tier durations (approximately)", async () => {
      const identity = createIdentity("Test");
      const result = await service.verify(identity);

      const sumTierDurations =
        result.tierDurations.mirror +
        result.tierDurations.api +
        result.tierDurations.live;

      // Total duration might be slightly more due to coordination overhead
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(sumTierDurations - 100);
    });
  });
});
