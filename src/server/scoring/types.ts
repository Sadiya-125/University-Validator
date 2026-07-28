/**
 * Scoring types
 *
 * Policies, evidence scoring, decision making, and explanations.
 * Scoring is PURE ARITHMETIC — no LLM, only weighted evidence.
 */

import type { StoredEvidence } from "../evidence/types";

/**
 * Scoring policy (configurable, loaded from database)
 */
export interface ScoringPolicy {
  id: string;
  name: string;
  institution_type: string; // "engineering", "medical", "university", etc.
  version: number;
  active: boolean;

  // Source weights (0.0-1.0, normalized)
  weight_mirror: number; // Registry, database entries
  weight_api: number; // Public APIs, websites
  weight_live: number; // Direct authority checks

  // Evidence type weights
  weight_legitimacy: number;
  weight_identity: number;
  weight_contact: number;
  weight_affiliation: number;
  weight_approval: number;

  // Domain weights
  weight_gov_in: number;
  weight_ac_in: number;
  weight_edu_in: number;
  weight_aggregator: number;

  // Freshness (exponential decay)
  evidence_half_life_days: number; // After this many days, contribution halves

  // Terminal conditions
  fake_list_score: number; // Score if UGC_FAKE hit (should be 0.0)
  withdrawn_authority_score: number; // Score if authority status withdrawn

  // Thresholds for decision bands
  threshold_genuine: number; // >= this = Genuine (0-1)
  threshold_likely_genuine: number; // >= this = Likely Genuine
  threshold_likely_fake: number; // >= this = Likely Fake
  threshold_fake: number; // >= this = Fake

  // Check freshness policy (§7)
  recheck_interval_days: number;
  recheck_interval_high_risk_days: number;

  // Expected maximum contribution (for normalization)
  expected_max: number; // Used to normalize score to 0-1

  created_at: Date;
  updated_at: Date;
}

/**
 * Contribution breakdown for a single evidence item
 */
export interface EvidenceContribution {
  evidenceId: string;
  source: string;
  tier: string;
  weight: number; // Applied weight
  quality: number; // Evidence quality (0-1)
  ageMultiplier: number; // Freshness multiplier
  contribution: number; // weight × quality × ageMultiplier
}

/**
 * Scoring result
 */
export interface ScoringResult {
  score: number; // 0.0-1.0
  breakdown: EvidenceContribution[];
  terminalRule?: string; // "UGC_FAKE", "WITHDRAWN", etc.
  unresolvedConflicts: string[]; // Evidence that contradicts
  adjustments: {
    conflictPenalty: number; // -0.10 per conflict
  };
}

/**
 * Verdict enum
 */
export enum Verdict {
  GENUINE = "Genuine",
  LIKELY_GENUINE = "Likely Genuine",
  LIKELY_FAKE = "Likely Fake",
  FAKE = "Fake",
  NEEDS_REVIEW = "Needs Review",
  INSUFFICIENT_EVIDENCE = "Insufficient Evidence",
}

/**
 * Decision from scored evidence
 */
export interface ScoringDecision {
  verdict: Verdict;
  score: number;
  confidence: number; // Additional confidence metric
  breakdown: {
    evidenceCount: number;
    tierDistribution: Record<string, number>;
  };
  needsReview: boolean;
  insufficientEvidenceReasons: string[]; // What's missing
  nextCheckAt: Date; // When to revalidate
  remarks: string[];
}

/**
 * Explanation link (for audit trail)
 */
export interface ExplanationLink {
  step: number;
  type: "terminal_rule" | "contribution" | "threshold" | "conflict" | "decision";
  reason: string;
  evidence?: string; // Ref to evidence item
  impact?: number; // Score impact
}

/**
 * Full explanation chain
 */
export interface Explanation {
  links: ExplanationLink[];
  summary: string; // Human-readable summary
}

/**
 * Insufficient evidence reason
 */
export interface InsufficientEvidenceReason {
  authority: string;
  reason: string;
  importance: "high" | "medium" | "low";
}
