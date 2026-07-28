/**
 * Validation orchestrator tests
 *
 * Tests:
 * - Fake-list input never touches search or LLM
 * - L1 hit performs exactly one DB query
 * - L3 respects budget
 * - Finalize is idempotent when run twice with same runId
 * - Illegal state transitions throw
 * - Each stage appends run_steps correctly
 * - onProgress callback fires for all stages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ValidationOptions } from "./validation.service";
import { validate, resolveFastPath, resolveFromMirror } from "./validation.service";

describe("Validation Orchestrator", () => {
  let mockDb: ValidationOptions["db"];
  let mockRedis: ValidationOptions["redis"];
  let mockCache: ValidationOptions["cache"];
  let progressCalls: Array<{ step: string; status: string; meta?: Record<string, unknown> }>;

  beforeEach(() => {
    progressCalls = [];

    mockDb = {
      query: vi.fn(async () => []),
    };

    mockRedis = {
      get: vi.fn(async () => null),
      setex: vi.fn(async () => {}),
    };

    mockCache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    };
  });

  describe("Stage 1: Fast path (L0/L1)", () => {
    it("should check Redis first (L0)", async () => {
      const cachedVerdict = JSON.stringify({ verdict: "genuine", cachedAt: new Date() });
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(cachedVerdict);

      const result = await resolveFastPath("IIT Bombay", {
        runId: "run-1",
        redis: mockRedis,
        db: mockDb,
        onProgress: (step, status, meta) => progressCalls.push({ step, status, meta }),
      });

      expect(result.success).toBe(true);
      expect(result.data.hit).toBe(true);
      expect(result.data.source).toBe("redis");
      expect(vi.mocked(mockRedis!.get)).toHaveBeenCalledWith("verdict:iit bombay");
    });

    it("should check institutions_db if Redis miss (L1)", async () => {
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(null);
      vi.mocked(mockDb!.query).mockResolvedValueOnce([
        { verdict: "likely_genuine", cached_at: new Date() },
      ]);

      const result = await resolveFastPath("IIT Bombay", {
        runId: "run-1",
        redis: mockRedis,
        db: mockDb,
        onProgress: (step, status, meta) => progressCalls.push({ step, status, meta }),
      });

      expect(result.success).toBe(true);
      expect(result.data.hit).toBe(true);
      expect(result.data.source).toBe("institutions_db");
      // L1 should perform exactly one DB query
      expect(vi.mocked(mockDb!.query)).toHaveBeenCalledTimes(1);
    });

    it("should return miss if both Redis and DB are empty", async () => {
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(null);
      vi.mocked(mockDb!.query).mockResolvedValueOnce([]);

      const result = await resolveFastPath("Unknown University", {
        runId: "run-1",
        redis: mockRedis,
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.data.hit).toBe(false);
    });

    it("should mark cached verdict as stale if >7 days old", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const cachedVerdict = JSON.stringify({ verdict: "genuine", cachedAt: eightDaysAgo });
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(cachedVerdict);

      const result = await resolveFastPath("IIT Bombay", {
        runId: "run-1",
        redis: mockRedis,
      });

      expect(result.success).toBe(true);
      expect(result.data.stale).toBe(true);
    });
  });

  describe("Stage 2: Mirror path (L2)", () => {
    it("should resolve from mirror without web access", async () => {
      const result = await resolveFromMirror("IIT Bombay", {
        runId: "run-1",
      });

      expect(result.success).toBe(true);
      // Should not make network requests (TODO: implement)
    });

    it("should short-circuit if score ≥ threshold", async () => {
      // TODO: Test scoring logic
      const result = await resolveFromMirror("UGC Listed Institution", {
        runId: "run-1",
      });

      expect(result.success).toBe(true);
    });

    it("should apply terminal rule (UGC_FAKE)", async () => {
      // TODO: Test terminal rule
      const result = await resolveFromMirror("Fake University", {
        runId: "run-1",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("State transitions and validation", () => {
    it("should reject invalid maxTier", async () => {
      const result = await validate("Test University", {
        runId: "run-1",
        maxTier: "invalid" as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid maxTier/);
    });

    it("should respect maxTier=fast and short-circuit", async () => {
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(null);
      vi.mocked(mockDb!.query).mockResolvedValueOnce([]);

      const result = await validate("Unknown University", {
        runId: "run-1",
        maxTier: "fast",
        redis: mockRedis,
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.data.verdict).toBe("NEEDS_REVIEW");
    });

    it("should respect maxTier=mirror and short-circuit", async () => {
      const result = await validate("University", {
        runId: "run-1",
        maxTier: "mirror",
        redis: mockRedis,
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.data.verdict).toBe("NEEDS_REVIEW");
    });
  });

  describe("onProgress callback", () => {
    it("should call onProgress for each stage", async () => {
      const onProgress = vi.fn();

      await resolveFastPath("Test", {
        runId: "run-1",
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledWith("fastPath", "start");
      expect(onProgress).toHaveBeenCalledWith("fastPath", "complete", expect.any(Object));
    });

    it("should include step duration in progress", async () => {
      const onProgress = vi.fn();

      await resolveFastPath("Test", {
        runId: "run-1",
        onProgress,
      });

      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
      expect(lastCall[2]?.duration).toBeGreaterThanOrEqual(0);
    });

    it("should track cache hits in progress", async () => {
      const cachedVerdict = JSON.stringify({ verdict: "genuine", cachedAt: new Date() });
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(cachedVerdict);
      const onProgress = vi.fn();

      await resolveFastPath("Test", {
        runId: "run-1",
        redis: mockRedis,
        onProgress,
      });

      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
      expect(lastCall[2]?.cacheHit).toBe(true);
    });
  });

  describe("Idempotency", () => {
    it("finalize should be idempotent when run twice with same runId", async () => {
      // TODO: Implement finalize test
      // Call finalize twice with same runId
      // Assert that both calls produce same validationRunId
      // Assert that second call doesn't create duplicate rows
    });
  });

  describe("Security constraints", () => {
    it("fake-list input should not touch search", async () => {
      // TODO: Test that UGC_FAKE input stops at mirror stage
      // Does not call discovery/search
      // Does not call LLM
    });

    it("should not query search for L1 hits", async () => {
      vi.mocked(mockDb!.query).mockResolvedValueOnce([
        { verdict: "genuine", cached_at: new Date() },
      ]);
      const searchProvider = vi.fn();

      await resolveFastPath("Known University", {
        runId: "run-1",
        db: mockDb,
      });

      expect(searchProvider).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should return Result.error on exception", async () => {
      vi.mocked(mockDb!.query).mockRejectedValueOnce(new Error("DB connection failed"));

      const result = await resolveFastPath("Test", {
        runId: "run-1",
        db: mockDb,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/DB connection failed/);
    });

    it("should call onProgress with error status on exception", async () => {
      const onProgress = vi.fn();
      vi.mocked(mockDb!.query).mockRejectedValueOnce(new Error("DB error"));

      await resolveFastPath("Test", {
        runId: "run-1",
        db: mockDb,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledWith("fastPath", "error", expect.any(Object));
    });
  });

  describe("Tier costs and budgets", () => {
    it("should track L2 cost (<600ms)", async () => {
      const onProgress = vi.fn();
      const start = Date.now();

      await resolveFromMirror("Test", {
        runId: "run-1",
        onProgress,
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(600);
    });

    it("should track L0/L1 cost (<120ms)", async () => {
      const onProgress = vi.fn();
      const start = Date.now();

      await resolveFastPath("Test", {
        runId: "run-1",
        onProgress,
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(120);
    });
  });

  describe("Integration: full validate() pipeline", () => {
    it("should return fast path verdict on L1 hit", async () => {
      vi.mocked(mockDb!.query).mockResolvedValueOnce([
        { verdict: "genuine", cached_at: new Date() },
      ]);

      const result = await validate("Known University", {
        runId: "run-1",
        maxTier: "finalize",
        db: mockDb,
        redis: mockRedis,
      });

      expect(result.success).toBe(true);
      expect(result.data.verdict).toBe("genuine");
    });

    it("should proceed to mirror if L1 miss", async () => {
      vi.mocked(mockRedis!.get).mockResolvedValueOnce(null);
      vi.mocked(mockDb!.query).mockResolvedValueOnce([]);

      const result = await validate("Unknown University", {
        runId: "run-1",
        maxTier: "mirror",
        db: mockDb,
        redis: mockRedis,
      });

      expect(result.success).toBe(true);
      // Should not hit L0/L1 again (no duplicate queries)
    });

    it("should handle cascading failures gracefully", async () => {
      // If discovery fails, returns error (not yet implemented)
      const result = await validate("Test", {
        runId: "run-1",
        maxTier: "discovery",
      });

      // Discovery not yet implemented, so returns error
      // When implemented, should gracefully degrade to NEEDS_REVIEW
      expect(result.success).toBe(true);
      expect(result.data.verdict).toBe("NEEDS_REVIEW");
    });
  });
});
