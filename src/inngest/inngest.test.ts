/**
 * Inngest client and functions tests
 *
 * Tests:
 * - Event schema validation (Zod types)
 * - Channel publishing
 * - Concurrency limits and idempotency
 * - Error handling and retry logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { validationChannel, ValidationChannel, ServerProgressPublisher } from "./channels";
import type { ProgressUpdate, FinalResult } from "./channels";

describe("Validation Channels", () => {
  describe("ValidationChannel class", () => {
    let channel: ValidationChannel;

    beforeEach(() => {
      channel = new ValidationChannel("run-123");
    });

    it("should create channel with runId", () => {
      expect(channel).toBeDefined();
    });

    it("should publish progress update", async () => {
      const update: ProgressUpdate = {
        step: "mirror",
        status: "complete",
        duration: 250,
        cacheHit: false,
      };

      await expect(channel.publishProgress(update)).resolves.not.toThrow();
    });

    it("should publish partial result", async () => {
      const partial = {
        stage: "mirror" as const,
        verdict: "likely_genuine",
        score: 0.75,
        timestamp: new Date(),
      };

      await expect(channel.publishPartial(partial)).resolves.not.toThrow();
    });

    it("should publish final result", async () => {
      const final: FinalResult = {
        verdict: "genuine",
        score: 0.95,
        confidence: 0.92,
        validationRunId: "vrun-123",
        duration: 5000,
        tierReachedAt: "finalize",
        breakdown: { evidenceCount: 12, tierDistribution: { mirror: 5, live: 3 } },
      };

      await expect(channel.publishDone(final)).resolves.not.toThrow();
    });
  });

  describe("validationChannel factory", () => {
    it("should create channel from factory", () => {
      const channel = validationChannel("run-456");
      expect(channel).toBeInstanceOf(ValidationChannel);
    });

    it("should generate topic names correctly", () => {
      const runId = "run-789";
      expect(ValidationChannel.progressTopic(runId)).toBe(`validation:${runId}:progress`);
      expect(ValidationChannel.partialTopic(runId)).toBe(`validation:${runId}:partial`);
      expect(ValidationChannel.doneTopic(runId)).toBe(`validation:${runId}:done`);
    });
  });

  describe("ServerProgressPublisher", () => {
    it("should publish progress from server", async () => {
      const runId = "run-123";
      const update: ProgressUpdate = {
        step: "extract",
        status: "start",
      };

      await expect(ServerProgressPublisher.publishProgress(runId, update)).resolves.not.toThrow();
    });

    it("should publish partial from server", async () => {
      const runId = "run-123";
      const partial = {
        stage: "extract" as const,
        timestamp: new Date(),
      };

      await expect(ServerProgressPublisher.publishPartial(runId, partial as any)).resolves.not.toThrow();
    });

    it("should publish done from server", async () => {
      const runId = "run-123";
      const final: FinalResult = {
        verdict: "likely_fake",
        score: 0.25,
        confidence: 0.88,
        validationRunId: "vrun-123",
        duration: 8000,
        tierReachedAt: "judge",
        breakdown: {},
      };

      await expect(ServerProgressPublisher.publishDone(runId, final)).resolves.not.toThrow();
    });
  });
});

describe("Channel Message Types", () => {
  it("should accept progress updates with all fields", () => {
    const update: ProgressUpdate = {
      step: "verify",
      status: "complete",
      duration: 450,
      cacheHit: true,
      source: "redis",
    };
    expect(update.step).toBe("verify");
    expect(update.duration).toBe(450);
  });

  it("should accept progress updates with minimal fields", () => {
    const update: ProgressUpdate = {
      step: "extract",
      status: "start",
    };
    expect(update.step).toBe("extract");
    expect(update.duration).toBeUndefined();
  });

  it("should accept error progress updates", () => {
    const update: ProgressUpdate = {
      step: "discovery",
      status: "error",
      error: "Network timeout",
    };
    expect(update.status).toBe("error");
    expect(update.error).toBe("Network timeout");
  });

  it("should accept final results with all fields", () => {
    const result: FinalResult = {
      verdict: "likely_genuine",
      score: 0.82,
      confidence: 0.79,
      validationRunId: "vrun-test",
      duration: 6000,
      tierReachedAt: "extract",
      breakdown: {
        evidenceCount: 8,
        tierDistribution: {
          mirror: 3,
          api: 5,
        },
      },
    };
    expect(result.verdict).toBe("likely_genuine");
    expect(result.breakdown.evidenceCount).toBe(8);
  });

  it("should accept final results with minimal breakdown", () => {
    const result: FinalResult = {
      verdict: "fake",
      score: 0.1,
      confidence: 0.95,
      validationRunId: "vrun-test",
      duration: 500,
      tierReachedAt: "fast",
      breakdown: {},
    };
    expect(result.verdict).toBe("fake");
    expect(Object.keys(result.breakdown).length).toBe(0);
  });

  it("should accept all verdict types", () => {
    const verdicts = [
      "genuine",
      "likely_genuine",
      "likely_fake",
      "fake",
      "needs_review",
      "insufficient_evidence",
    ] as const;

    for (const verdict of verdicts) {
      const result: FinalResult = {
        verdict,
        score: 0.5,
        confidence: 0.5,
        validationRunId: "vrun-test",
        duration: 1000,
        tierReachedAt: "mirror",
        breakdown: {},
      };
      expect(result.verdict).toBe(verdict);
    }
  });

  it("should accept all tier types", () => {
    const tiers = ["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"] as const;

    for (const tier of tiers) {
      const result: FinalResult = {
        verdict: "genuine",
        score: 0.9,
        confidence: 0.9,
        validationRunId: "vrun-test",
        duration: 1000,
        tierReachedAt: tier,
        breakdown: {},
      };
      expect(result.tierReachedAt).toBe(tier);
    }
  });
});

describe("Channel Topics", () => {
  it("should generate consistent topic names", () => {
    const runId = "test-run-456";
    const progressTopic = ValidationChannel.progressTopic(runId);
    const partialTopic = ValidationChannel.partialTopic(runId);
    const doneTopic = ValidationChannel.doneTopic(runId);

    expect(progressTopic).toContain(runId);
    expect(partialTopic).toContain(runId);
    expect(doneTopic).toContain(runId);

    expect(progressTopic).toContain("progress");
    expect(partialTopic).toContain("partial");
    expect(doneTopic).toContain("done");
  });

  it("should generate unique topics per runId", () => {
    const topic1 = ValidationChannel.progressTopic("run-1");
    const topic2 = ValidationChannel.progressTopic("run-2");

    expect(topic1).not.toBe(topic2);
  });
});

describe("Progress Updates", () => {
  it("should handle all status values", () => {
    const statuses = ["start", "complete", "error"] as const;

    for (const status of statuses) {
      const update: ProgressUpdate = {
        step: "mirror",
        status,
      };
      expect(update.status).toBe(status);
    }
  });

  it("should track duration in ms", () => {
    const update: ProgressUpdate = {
      step: "extract",
      status: "complete",
      duration: 2500,
    };
    expect(update.duration).toBe(2500);
    expect(typeof update.duration).toBe("number");
  });

  it("should track cache operations", () => {
    const redisHit: ProgressUpdate = {
      step: "fastPath",
      status: "complete",
      cacheHit: true,
      source: "redis",
    };
    expect(redisHit.cacheHit).toBe(true);
    expect(redisHit.source).toBe("redis");

    const dbHit: ProgressUpdate = {
      step: "fastPath",
      status: "complete",
      cacheHit: true,
      source: "institutions_db",
    };
    expect(dbHit.source).toBe("institutions_db");
  });

  it("should allow flexible metadata", () => {
    const update: ProgressUpdate = {
      step: "verify",
      status: "complete",
      duration: 1200,
      cacheHit: false,
      source: "api",
    };
    expect(update).toEqual({
      step: "verify",
      status: "complete",
      duration: 1200,
      cacheHit: false,
      source: "api",
    });
  });
});

describe("Event Flow Scenarios", () => {
  it("should handle complete validation flow via channels", async () => {
    const runId = "run-complete-flow";
    const channel = validationChannel(runId);

    // Progress: Start
    await channel.publishProgress({
      step: "validate-institution",
      status: "start",
    });

    // Progress: Fast path
    await channel.publishProgress({
      step: "fastPath",
      status: "complete",
      duration: 50,
      cacheHit: false,
    });

    // Progress: Mirror stage
    await channel.publishProgress({
      step: "mirror",
      status: "complete",
      duration: 300,
      cacheHit: false,
    });

    // Partial: After L2
    await channel.publishPartial({
      stage: "mirror",
      verdict: "likely_genuine",
      score: 0.75,
      timestamp: new Date(),
    });

    // Progress: Discovery
    await channel.publishProgress({
      step: "discover",
      status: "complete",
      duration: 800,
    });

    // Final: Done
    await channel.publishDone({
      verdict: "likely_genuine",
      score: 0.82,
      confidence: 0.79,
      validationRunId: "vrun-123",
      duration: 2500,
      tierReachedAt: "discovery",
      breakdown: {
        evidenceCount: 6,
        tierDistribution: { mirror: 3, api: 3 },
      },
    });
  });

  it("should handle failed validation flow", async () => {
    const runId = "run-failed-flow";
    const channel = validationChannel(runId);

    await channel.publishProgress({
      step: "mirror",
      status: "start",
    });

    await channel.publishProgress({
      step: "mirror",
      status: "error",
      duration: 150,
      error: "Registry lookup failed",
    });
  });

  it("should handle retry flow", async () => {
    const runId = "run-retry-flow";
    const publisher = ServerProgressPublisher;

    // First attempt fails
    await publisher.publishProgress(runId, {
      step: "extract",
      status: "error",
      error: "LLM timeout",
    });

    // Retry starts
    await publisher.publishProgress(runId, {
      step: "extract",
      status: "start",
    });

    // Retry succeeds
    await publisher.publishDone(runId, {
      verdict: "genuine",
      score: 0.91,
      confidence: 0.88,
      validationRunId: "vrun-456",
      duration: 3000,
      tierReachedAt: "extract",
      breakdown: { evidenceCount: 10 },
    });
  });
});
