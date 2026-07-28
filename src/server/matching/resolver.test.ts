import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveInstitution,
  resolveInstitutionBatch,
  getConfidenceLevel,
  type ResolvedCandidate,
  type ScoreBreakdown,
} from "./resolver";
import { FakeEmbeddingProvider } from "./embeddings";

// Mock the trigram and identity modules
vi.mock("./trigram", () => ({
  findTrigramCandidates: vi.fn(async ({ names }: any) => {
    // Return candidates for any search to avoid empty results
    return [
      {
        id: 1,
        type: "institution" as const,
        name: "Indian Institute of Technology Bombay",
        normalizedName: "indian institute of technology bombay",
        similarity: 0.85,
      },
      {
        id: 2,
        type: "registry" as const,
        name: "IIT Bombay",
        normalizedName: "iit bombay",
        source: "INI",
        externalId: "iit-bombay",
        similarity: 0.9,
      },
    ];
  }),
}));

vi.mock("./identity", () => ({
  findInstitutionByIdentity: vi.fn(async () => null),
}));

describe("resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveInstitution", () => {
    it("should resolve an institution name", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].confidence).toBeGreaterThan(0);
      expect(candidates[0].method).toBeDefined();
    });

    it("should return sorted by confidence (highest first)", async () => {
      const candidates = await resolveInstitution("Indian Institute Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      if (candidates.length > 1) {
        for (let i = 1; i < candidates.length; i++) {
          expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(
            candidates[i].confidence
          );
        }
      }
    });

    it("should include score breakdown", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      if (candidates.length > 0) {
        const scores = candidates[0].scores;
        expect(scores).toHaveProperty("trigram");
        expect(scores).toHaveProperty("vector");
        expect(scores).toHaveProperty("stateMatch");
        expect(scores).toHaveProperty("final");
      }
    });

    it("should respect threshold parameter", async () => {
      const candidatesHigh = await resolveInstitution("IIT Bombay", {
        threshold: 0.9,
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      const candidatesLow = await resolveInstitution("IIT Bombay", {
        threshold: 0.1,
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(candidatesLow.length).toBeGreaterThanOrEqual(candidatesHigh.length);
    });

    it("should limit results to specified amount", async () => {
      const candidates = await resolveInstitution("IIT", {
        limit: 2,
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(candidates.length).toBeLessThanOrEqual(2);
    });

    it("should mark candidates as needsReview if confidence is 0.70-0.90", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      candidates.forEach((candidate) => {
        if (candidate.confidence >= 0.7 && candidate.confidence < 0.9) {
          expect(candidate.needsReview).toBe(true);
        } else if (candidate.confidence >= 0.9) {
          expect(candidate.needsReview).toBe(false);
        }
      });
    });

    it("should return institution type and source", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      candidates.forEach((candidate) => {
        expect(["institution", "registry"]).toContain(candidate.type);
      });
    });

    it("should handle empty input", async () => {
      const candidates = await resolveInstitution("", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(Array.isArray(candidates)).toBe(true);
    });

    it("should handle abbreviations in input", async () => {
      const candidates = await resolveInstitution("IIT Mumbai", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      // Should expand IIT and find results
      expect(Array.isArray(candidates)).toBe(true);
    });
  });

  describe("resolveInstitutionBatch", () => {
    it("should resolve multiple institutions", async () => {
      const inputs = ["IIT Bombay", "NIT Warangal", "BITS Pilani"];
      const results = await resolveInstitutionBatch(inputs, {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(results.size).toBe(3);
      expect(results.has(0)).toBe(true);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
    });

    it("should return results indexed by input position", async () => {
      const inputs = ["IIT Bombay", "NIT Warangal"];
      const results = await resolveInstitutionBatch(inputs, {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(results.get(0)).toBeDefined();
      expect(results.get(1)).toBeDefined();
    });

    it("should respect options for each resolution", async () => {
      const inputs = ["IIT Bombay", "NIT Warangal"];
      const results = await resolveInstitutionBatch(inputs, {
        limit: 1,
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      results.forEach((candidates) => {
        expect(candidates.length).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("getConfidenceLevel", () => {
    it("should return 'high' for confidence >= 0.9", () => {
      expect(getConfidenceLevel(1.0)).toBe("high");
      expect(getConfidenceLevel(0.95)).toBe("high");
      expect(getConfidenceLevel(0.9)).toBe("high");
    });

    it("should return 'medium' for confidence 0.7-0.9", () => {
      expect(getConfidenceLevel(0.89)).toBe("medium");
      expect(getConfidenceLevel(0.8)).toBe("medium");
      expect(getConfidenceLevel(0.7)).toBe("medium");
    });

    it("should return 'low' for confidence 0.5-0.7", () => {
      expect(getConfidenceLevel(0.69)).toBe("low");
      expect(getConfidenceLevel(0.6)).toBe("low");
      expect(getConfidenceLevel(0.5)).toBe("low");
    });

    it("should return 'unknown' for confidence < 0.5", () => {
      expect(getConfidenceLevel(0.49)).toBe("unknown");
      expect(getConfidenceLevel(0.0)).toBe("unknown");
    });
  });

  describe("Score breakdown", () => {
    it("should have all score components", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      if (candidates.length > 0) {
        const scores = candidates[0].scores;
        expect(scores.trigram).toBeDefined();
        expect(scores.vector).toBeDefined();
        expect(scores.stateMatch).toBeDefined();
        expect(scores.addressTrigram).toBeDefined();
        expect(scores.final).toBeDefined();
      }
    });

    it("should have valid score ranges", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      candidates.forEach((candidate) => {
        const scores = candidate.scores;
        expect(scores.trigram).toBeGreaterThanOrEqual(0);
        expect(scores.trigram).toBeLessThanOrEqual(1);
        expect(scores.vector).toBeGreaterThanOrEqual(0);
        expect(scores.vector).toBeLessThanOrEqual(1);
        expect(scores.final).toBeGreaterThanOrEqual(0);
        expect(scores.final).toBeLessThanOrEqual(1);
      });
    });

    it("should calculate fusion score correctly", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      candidates.forEach((candidate) => {
        const scores = candidate.scores;
        const expected =
          0.45 * scores.trigram +
          0.35 * scores.vector +
          0.12 * scores.stateMatch;
        // Allow small floating point difference
        expect(Math.abs(scores.final - expected)).toBeLessThan(0.01);
      });
    });
  });

  describe("Resolution methods", () => {
    it("should indicate method used", async () => {
      const candidates = await resolveInstitution("IIT Bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      candidates.forEach((candidate) => {
        expect(
          ["identity", "trigram+vector", "new"].includes(candidate.method)
        ).toBe(true);
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle institutions with special characters", async () => {
      const candidates = await resolveInstitution(
        "St. Xavier's College, Mumbai",
        {
          embeddingProvider: new FakeEmbeddingProvider(),
        }
      );

      expect(Array.isArray(candidates)).toBe(true);
    });

    it("should handle mixed case input", async () => {
      const candidates1 = await resolveInstitution("iit bombay", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      const candidates2 = await resolveInstitution("IIT BOMBAY", {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(candidates1).toBeDefined();
      expect(candidates2).toBeDefined();
    });

    it("should handle very long institution names", async () => {
      const longName =
        "Dr. Babasaheb Ambedkar Marathwada University, Aurangabad, Maharashtra";
      const candidates = await resolveInstitution(longName, {
        embeddingProvider: new FakeEmbeddingProvider(),
      });

      expect(Array.isArray(candidates)).toBe(true);
    });
  });
});
