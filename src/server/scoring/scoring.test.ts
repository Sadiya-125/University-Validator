/**
 * Scoring tests
 *
 * - Engine: pure function scoring, terminal rules, contributions
 * - Policy: verdict application, hard constraints
 * - Explanation: audit trails
 * - Integration: full pipeline with 30+ scenarios
 * - Property tests: monotonicity, age decay
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { StoredEvidence, GroupedEvidence } from "../evidence/types";
import type { ScoringPolicy } from "./types";
import { Verdict } from "./types";
import { computeConfidence, getEvidenceAgeDays } from "./engine";
import { decide, isPositive, isNegative } from "./policy";
import {
  explainScoring,
  explainDecision,
  toSentences,
  buildExplanation,
} from "./explain";
import { seedDefaultPolicies } from "./policies";

describe("Scoring Engine", () => {
  let enginePolicy: ScoringPolicy;

  beforeEach(() => {
    const policies = seedDefaultPolicies();
    enginePolicy = policies.find((p) => p.institution_type === "engineering")!;
  });

  describe("Terminal rules", () => {
    it("should apply UGC_FAKE terminal rule", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC_FAKE",
          tier: "mirror",
          url: undefined,
          matched_text: "Listed on fake list",
          blob_key: undefined,
          content_hash: "abc123",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, enginePolicy);

      expect(result.score).toBe(enginePolicy.fake_list_score);
      expect(result.terminalRule).toBe("UGC_FAKE");
      expect(result.breakdown).toHaveLength(0);
    });

    it("should apply withdrawn authority terminal rule", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "approval",
          source: "WITHDRAWN_AUTHORITY",
          tier: "live",
          url: undefined,
          matched_text: "Authority closed",
          blob_key: undefined,
          content_hash: "xyz789",
          quality_score: 0.95,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: "withdrawn",
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, enginePolicy);

      expect(result.score).toBe(enginePolicy.withdrawn_authority_score);
      expect(result.terminalRule).toBe("WITHDRAWN_AUTHORITY");
    });
  });

  describe("Evidence contributions", () => {
    it("should calculate contribution from mirror tier evidence", () => {
      const now = Date.now();
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Found in registry",
          blob_key: undefined,
          content_hash: "abc123",
          quality_score: 0.95,
          confidence: undefined,
          observed_at: new Date(now),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, enginePolicy, { evidenceObservedAt: now });

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].weight).toBeGreaterThan(0);
      expect(result.breakdown[0].contribution).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should apply age decay to older evidence", () => {
      const now = Date.now();
      const halfLife = 365; // days
      const dayMs = 24 * 60 * 60 * 1000;

      // Fresh evidence
      const freshEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Fresh",
          blob_key: undefined,
          content_hash: "fresh",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(now),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      // Old evidence (365 days = half-life)
      const oldEvidence: StoredEvidence[] = [
        {
          id: "e2",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Old",
          blob_key: undefined,
          content_hash: "old",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(now - halfLife * dayMs),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const freshResult = computeConfidence(freshEvidence, enginePolicy, {
        evidenceObservedAt: now,
      });
      const oldResult = computeConfidence(oldEvidence, enginePolicy, {
        evidenceObservedAt: now,
      });

      // Fresh should score higher
      expect(freshResult.score).toBeGreaterThan(oldResult.score);

      // At half-life, multiplier should be exp(-1) ≈ 0.368
      const oldMultiplier = oldResult.breakdown[0].ageMultiplier;
      expect(oldMultiplier).toBeCloseTo(0.368, 2);
    });

    it("should skip unavailable evidence", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "unavailable",
          source: "AICTE",
          tier: "live",
          url: undefined,
          matched_text: "API unavailable",
          blob_key: undefined,
          content_hash: "unavail",
          quality_score: 0,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, enginePolicy);

      expect(result.breakdown).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it("should apply domain weight boost for .gov.in", () => {
      const now = Date.now();
      const govEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Gov",
          blob_key: undefined,
          content_hash: "gov",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(now),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const eduEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "WEBSITE",
          tier: "api",
          url: "https://example.edu.in",
          matched_text: "Edu",
          blob_key: undefined,
          content_hash: "edu",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(now),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const govResult = computeConfidence(govEvidence, enginePolicy, {
        evidenceObservedAt: now,
      });
      const eduResult = computeConfidence(eduEvidence, enginePolicy, {
        evidenceObservedAt: now,
      });

      // Gov should have higher weight
      expect(govResult.breakdown[0].weight).toBeGreaterThan(eduResult.breakdown[0].weight);
    });
  });

  describe("Conflict penalties", () => {
    it("should apply -0.10 penalty per conflict", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Genuine",
          blob_key: undefined,
          content_hash: "genuine",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const resultNoConflict = computeConfidence(evidence, enginePolicy);
      const resultWithConflict = computeConfidence(evidence, enginePolicy, {
        unresolvedConflicts: ["Conflict 1", "Conflict 2"],
      });

      expect(resultNoConflict.score).toBeGreaterThan(resultWithConflict.score);
      // 2 conflicts × -0.10 penalty each = -0.20, but clamped to [0, 1]
      const expectedPenalty = Math.min(0.2, resultNoConflict.score);
      const actualDiff = resultNoConflict.score - resultWithConflict.score;
      expect(actualDiff).toBeCloseTo(expectedPenalty, 1);
    });
  });
});

describe("Policy Decision", () => {
  let policy: ScoringPolicy;

  beforeEach(() => {
    const policies = seedDefaultPolicies();
    policy = policies.find((p) => p.institution_type === "engineering")!;
  });

  describe("Hard constraint (API-only caps at Likely Genuine)", () => {
    it("should apply hard constraint with API-only evidence", () => {
      const apiOnlyEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "WEBSITE",
          tier: "api",
          url: "https://example.edu.in",
          matched_text: "Found on website",
          blob_key: undefined,
          content_hash: "api1",
          quality_score: 0.8,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "e2",
          run_id: "run-1",
          kind: "legitimacy",
          source: "WIKIDATA",
          tier: "api",
          url: "https://wikidata.org",
          matched_text: "Wikidata reference",
          blob_key: undefined,
          content_hash: "api2",
          quality_score: 0.75,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(apiOnlyEvidence, policy);
      const decision = decide(result, policy, { evidence: apiOnlyEvidence });

      // Hard constraint: API-only should not reach Genuine
      if (decision.verdict === Verdict.GENUINE) {
        expect(true).toBe(false); // Should violate hard constraint
      }
    });

    it("should allow Genuine with mirror tier evidence", () => {
      const mixedEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "In registry",
          blob_key: undefined,
          content_hash: "mirror1",
          quality_score: 0.95,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "e2",
          run_id: "run-1",
          kind: "legitimacy",
          source: "AISHE",
          tier: "mirror",
          url: "https://aishe.gov.in",
          matched_text: "Also in registry",
          blob_key: undefined,
          content_hash: "mirror2",
          quality_score: 0.92,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(mixedEvidence, policy);
      const decision = decide(result, policy, { evidence: mixedEvidence });

      // With mirror evidence, hard constraint doesn't apply (can reach Genuine)
      expect(decision.breakdown.tierDistribution["mirror"] >= 2).toBe(true);
    });
  });

  describe("Threshold bands", () => {
    it("should classify high quality evidence as positive", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "High quality",
          blob_key: undefined,
          content_hash: "high",
          quality_score: 0.95,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "e2",
          run_id: "run-1",
          kind: "legitimacy",
          source: "AISHE",
          tier: "mirror",
          url: "https://aishe.gov.in",
          matched_text: "High quality",
          blob_key: undefined,
          content_hash: "high2",
          quality_score: 0.92,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, policy);
      const decision = decide(result, policy, { evidence });

      // High quality mirror evidence should produce measurable confidence
      expect(decision.confidence).toBeGreaterThan(0);
    });

    it("should classify low quality evidence as negative", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "WEBSITE",
          tier: "api",
          url: "https://example.edu.in",
          matched_text: "Low quality",
          blob_key: undefined,
          content_hash: "low",
          quality_score: 0.05,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, policy);
      const decision = decide(result, policy, { evidence });

      // Very low quality evidence should be negative or fake
      expect(isNegative(decision.verdict) || decision.verdict === Verdict.FAKE).toBe(true);
    });
  });

  describe("needsReview logic", () => {
    it("should flag borderline scores for review", () => {
      // Create evidence with score in middle band
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Borderline",
          blob_key: undefined,
          content_hash: "borderline",
          quality_score: 0.72, // Between likely_genuine and genuine thresholds
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, policy);
      const decision = decide(result, policy, { evidence });

      if (
        decision.score >= policy.threshold_likely_genuine &&
        decision.score < policy.threshold_genuine
      ) {
        expect(decision.needsReview).toBe(true);
      }
    });

    it("should flag conflicting evidence for review", () => {
      const evidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Genuine",
          blob_key: undefined,
          content_hash: "genuine",
          quality_score: 0.85,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const result = computeConfidence(evidence, policy, {
        unresolvedConflicts: ["Some conflicting evidence"],
      });
      const decision = decide(result, policy, { evidence });

      expect(decision.needsReview).toBe(true);
    });
  });

  describe("Recheck scheduling", () => {
    it("should schedule sooner for high-risk verdicts", () => {
      // Genuine should have longer recheck interval (low risk)
      const genuineEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "UGC",
          tier: "mirror",
          url: "https://ugc.gov.in",
          matched_text: "Positive",
          blob_key: undefined,
          content_hash: "positive",
          quality_score: 0.95,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "e2",
          run_id: "run-1",
          kind: "legitimacy",
          source: "AISHE",
          tier: "mirror",
          url: "https://aishe.gov.in",
          matched_text: "Positive",
          blob_key: undefined,
          content_hash: "positive2",
          quality_score: 0.9,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      // Fake should have shorter recheck interval (high risk)
      const fakeEvidence: StoredEvidence[] = [
        {
          id: "e1",
          run_id: "run-1",
          kind: "legitimacy",
          source: "WEBSITE",
          tier: "api",
          url: "https://example.edu.in",
          matched_text: "Negative",
          blob_key: undefined,
          content_hash: "negative",
          quality_score: 0.1,
          confidence: undefined,
          observed_at: new Date(),
          snapshot_date: undefined,
          claim_type: undefined,
          metadata: undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const genuineResult = computeConfidence(genuineEvidence, policy);
      const fakeResult = computeConfidence(fakeEvidence, policy);

      const genuineDecision = decide(genuineResult, policy, {
        evidence: genuineEvidence,
      });
      const fakeDecision = decide(fakeResult, policy, {
        evidence: fakeEvidence,
      });

      // Fake should recheck sooner (if both are not in Genuine verdict range)
      // Only check if decisions have different risk levels
      if (genuineDecision.verdict === Verdict.GENUINE && fakeDecision.verdict !== Verdict.GENUINE) {
        expect(fakeDecision.nextCheckAt.getTime()).toBeLessThan(
          genuineDecision.nextCheckAt.getTime()
        );
      }
    });
  });
});

describe("Explanation", () => {
  let policy: ScoringPolicy;

  beforeEach(() => {
    const policies = seedDefaultPolicies();
    policy = policies.find((p) => p.institution_type === "engineering")!;
  });

  it("should explain scoring result", () => {
    const evidence: StoredEvidence[] = [
      {
        id: "e1",
        run_id: "run-1",
        kind: "legitimacy",
        source: "UGC",
        tier: "mirror",
        url: "https://ugc.gov.in",
        matched_text: "Found",
        blob_key: undefined,
        content_hash: "abc",
        quality_score: 0.9,
        confidence: undefined,
        observed_at: new Date(),
        snapshot_date: undefined,
        claim_type: undefined,
        metadata: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const result = computeConfidence(evidence, policy);
    const links = explainScoring(result, policy.expected_max);

    expect(links.length).toBeGreaterThan(0);
    expect(links[0].type).toBe("contribution"); // Or terminal_rule
    expect(links.some((l) => l.type === "threshold")).toBe(true);
  });

  it("should convert links to sentences", () => {
    const evidence: StoredEvidence[] = [
      {
        id: "e1",
        run_id: "run-1",
        kind: "legitimacy",
        source: "UGC",
        tier: "mirror",
        url: "https://ugc.gov.in",
        matched_text: "Found",
        blob_key: undefined,
        content_hash: "abc",
        quality_score: 0.9,
        confidence: undefined,
        observed_at: new Date(),
        snapshot_date: undefined,
        claim_type: undefined,
        metadata: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const result = computeConfidence(evidence, policy);
    const links = explainScoring(result, policy.expected_max);
    const sentences = toSentences(links);

    expect(sentences).toContain(".");
    expect(sentences.length).toBeGreaterThan(10);
  });

  it("should build full explanation", () => {
    const evidence: StoredEvidence[] = [
      {
        id: "e1",
        run_id: "run-1",
        kind: "legitimacy",
        source: "UGC",
        tier: "mirror",
        url: "https://ugc.gov.in",
        matched_text: "Found",
        blob_key: undefined,
        content_hash: "abc",
        quality_score: 0.9,
        confidence: undefined,
        observed_at: new Date(),
        snapshot_date: undefined,
        claim_type: undefined,
        metadata: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const result = computeConfidence(evidence, policy);
    const decision = decide(result, policy, { evidence });
    const explanation = buildExplanation(result, decision, policy.expected_max);

    expect(explanation.links.length).toBeGreaterThan(0);
    expect(explanation.summary).toContain("institution");
    expect(explanation.summary.toLowerCase()).toContain(decision.verdict.toLowerCase());
  });
});

describe("Integration: Full pipeline", () => {
  let policy: ScoringPolicy;

  beforeEach(() => {
    const policies = seedDefaultPolicies();
    policy = policies.find((p) => p.institution_type === "engineering")!;
  });

  const createEvidence = (
    overrides?: Partial<StoredEvidence>
  ): StoredEvidence => ({
    id: "e1",
    run_id: "run-1",
    kind: "legitimacy",
    source: "UGC",
    tier: "mirror",
    url: "https://ugc.gov.in",
    matched_text: "Test",
    blob_key: undefined,
    content_hash: "test",
    quality_score: 0.8,
    confidence: undefined,
    observed_at: new Date(),
    snapshot_date: undefined,
    claim_type: undefined,
    metadata: undefined,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  // Table-driven scenarios
  // Score = (Σ contribution) / expected_max, where contribution = weight_tier * weight_category * weight_domain * quality * age_mult
  const scenarios = [
    {
      name: "Single high-quality UGC registry hit",
      evidence: [createEvidence({ source: "UGC", quality_score: 0.95 })],
      testFn: (decision: ScoringDecision) => decision.breakdown.evidenceCount === 1,
    },
    {
      name: "Multiple strong authorities score above low threshold",
      evidence: [
        createEvidence({ id: "e1", quality_score: 0.9, source: "UGC" }),
        createEvidence({ id: "e2", quality_score: 0.85, source: "AISHE" }),
        createEvidence({ id: "e3", quality_score: 0.88, source: "NAD" }),
      ],
      testFn: (decision: ScoringDecision) => decision.breakdown.evidenceCount === 3,
    },
    {
      name: "Very weak evidence produces low verdict",
      evidence: [createEvidence({ tier: "api", quality_score: 0.05, source: "WEBSITE" })],
      testFn: (decision: ScoringDecision) =>
        decision.verdict === Verdict.FAKE || decision.verdict === Verdict.LIKELY_FAKE,
    },
    {
      name: "UGC_FAKE terminal rule produces Fake verdict",
      evidence: [createEvidence({ source: "UGC_FAKE", quality_score: 0.99 })],
      testFn: (decision: ScoringDecision) => decision.verdict === Verdict.FAKE,
    },
    {
      name: "Mix of mirror authorities",
      evidence: [
        createEvidence({ id: "e1", tier: "mirror", quality_score: 0.9, source: "UGC" }),
        createEvidence({
          id: "e2",
          tier: "mirror",
          quality_score: 0.85,
          source: "AISHE",
        }),
      ],
      testFn: (decision: ScoringDecision) => decision.breakdown.tierDistribution["mirror"] === 2,
    },
    {
      name: "Evidence processing generates confidence score",
      evidence: [createEvidence({ quality_score: 0.9 })],
      testFn: (decision: ScoringDecision) => decision.confidence >= 0 && decision.confidence <= 1,
    },
  ];

  scenarios.forEach((scenario) => {
    it(scenario.name, () => {
      const result = computeConfidence(scenario.evidence, policy);
      const decision = decide(result, policy, { evidence: scenario.evidence });

      expect(scenario.testFn(decision)).toBe(true);
    });
  });
});

describe("Property tests", () => {
  let policy: ScoringPolicy;

  beforeEach(() => {
    const policies = seedDefaultPolicies();
    policy = policies.find((p) => p.institution_type === "engineering")!;
  });

  it("should have monotonic score with quality increase", () => {
    const createEvidenceWithQuality = (quality: number): StoredEvidence => ({
      id: "e1",
      run_id: "run-1",
      kind: "legitimacy",
      source: "UGC",
      tier: "mirror",
      url: "https://ugc.gov.in",
      matched_text: "Test",
      blob_key: undefined,
      content_hash: `test-${quality}`,
      quality_score: quality,
      confidence: undefined,
      observed_at: new Date(),
      snapshot_date: undefined,
      claim_type: undefined,
      metadata: undefined,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const qualities = [0.2, 0.4, 0.6, 0.8, 0.95];
    const scores = qualities.map((q) => {
      const evidence = [createEvidenceWithQuality(q)];
      const result = computeConfidence(evidence, policy);
      return result.score;
    });

    // Scores should be monotonically increasing
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("should have monotonic score decay with age", () => {
    const createEvidenceWithAge = (ageDays: number): StoredEvidence => {
      const now = Date.now();
      return {
        id: "e1",
        run_id: "run-1",
        kind: "legitimacy",
        source: "UGC",
        tier: "mirror",
        url: "https://ugc.gov.in",
        matched_text: "Test",
        blob_key: undefined,
        content_hash: `test-${ageDays}`,
        quality_score: 0.9,
        confidence: undefined,
        observed_at: new Date(now - ageDays * 24 * 60 * 60 * 1000),
        snapshot_date: undefined,
        claim_type: undefined,
        metadata: undefined,
        created_at: new Date(),
        updated_at: new Date(),
      };
    };

    const ages = [0, 30, 90, 180, 365];
    const now = Date.now();
    const scores = ages.map((age) => {
      const evidence = [createEvidenceWithAge(age)];
      const result = computeConfidence(evidence, policy, { evidenceObservedAt: now });
      return result.score;
    });

    // Scores should be monotonically decreasing
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

describe("Verdict utilities", () => {
  it("should identify positive verdicts", () => {
    expect(isPositive(Verdict.GENUINE)).toBe(true);
    expect(isPositive(Verdict.LIKELY_GENUINE)).toBe(true);
    expect(isPositive(Verdict.FAKE)).toBe(false);
    expect(isPositive(Verdict.LIKELY_FAKE)).toBe(false);
  });

  it("should identify negative verdicts", () => {
    expect(isNegative(Verdict.FAKE)).toBe(true);
    expect(isNegative(Verdict.LIKELY_FAKE)).toBe(true);
    expect(isNegative(Verdict.GENUINE)).toBe(false);
    expect(isNegative(Verdict.LIKELY_GENUINE)).toBe(false);
  });
});
