/**
 * Scoring engine
 *
 * Pure function for computing confidence scores from evidence.
 * NO I/O, NO side effects, deterministic.
 *
 * Algorithm:
 * 1. Check terminal rules (UGC_FAKE → 0.0, withdrawn → negative)
 * 2. Calculate contribution for each evidence: weight × quality × exp(-ageDays / halfLife)
 * 3. Sum contributions, normalize by policy.expected_max
 * 4. Apply conflict penalty: -0.10 per unresolved conflict
 * 5. Clamp to [0, 1]
 */

import type { StoredEvidence } from "../evidence/types";
import type { ScoringPolicy, ScoringResult, EvidenceContribution } from "./types";

/**
 * Context for scoring
 */
export interface ScoringContext {
  evidenceObservedAt?: number; // Timestamp when evidence was gathered (for age calculation)
  unresolvedConflicts?: string[]; // List of conflicting evidence texts
}

/**
 * Compute confidence score from evidence
 *
 * PURE FUNCTION: No I/O, deterministic, no side effects
 *
 * Terminal rules apply first (short-circuit):
 * - UGC_FAKE hit → score = 0.0
 * - Authority withdrawn/closed → score = policy.withdrawn_authority_score
 *
 * For each evidence item, calculate contribution:
 * - contribution = weight(tier, category, domain) × quality × ageMultiplier
 * - ageMultiplier = exp(-ageDays / halfLife)
 *
 * Combine:
 * - totalContribution = Σ contribution
 * - baseScore = clamp(totalContribution / policy.expected_max, 0, 1)
 * - conflictPenalty = -0.10 × unresolvedConflicts.length
 * - finalScore = clamp(baseScore + conflictPenalty, 0, 1)
 */
export function computeConfidence(
  evidence: StoredEvidence[],
  policy: ScoringPolicy,
  context: ScoringContext = {}
): ScoringResult {
  const breakdown: EvidenceContribution[] = [];
  const unresolvedConflicts: string[] = context.unresolvedConflicts || [];
  let totalContribution = 0;
  let terminalRule: string | undefined;

  const now = context.evidenceObservedAt || Date.now();

  // Terminal rule 1: UGC_FAKE hit → Genuine = 0.0
  const hasUGCFake = evidence.some((e) => e.source === "UGC_FAKE");
  if (hasUGCFake) {
    terminalRule = "UGC_FAKE";
    return {
      score: policy.fake_list_score, // Usually 0.0
      breakdown: [],
      terminalRule,
      unresolvedConflicts: [],
      adjustments: {
        conflictPenalty: 0,
      },
    };
  }

  // Terminal rule 2: Withdrawn authority → strong negative
  const hasWithdrawn = evidence.some(
    (e) => e.source === "WITHDRAWN_AUTHORITY"
  );
  if (hasWithdrawn) {
    terminalRule = "WITHDRAWN_AUTHORITY";
    return {
      score: policy.withdrawn_authority_score, // Usually -0.5
      breakdown: [],
      terminalRule,
      unresolvedConflicts: [],
      adjustments: {
        conflictPenalty: 0,
      },
    };
  }

  // Calculate contribution for each evidence item
  for (const item of evidence) {
    // Skip unavailable evidence (no contribution)
    if (item.kind === "unavailable") {
      continue;
    }

    // Get tier weight
    const tierWeight =
      item.tier === "mirror"
        ? policy.weight_mirror
        : item.tier === "api"
          ? policy.weight_api
          : item.tier === "live"
            ? policy.weight_live
            : 0.5; // Default fallback

    // Get evidence type weight
    const categoryWeight =
      item.kind === "legitimacy"
        ? policy.weight_legitimacy
        : item.kind === "identity"
          ? policy.weight_identity
          : item.kind === "contact"
            ? policy.weight_contact
            : item.kind === "affiliation"
              ? policy.weight_affiliation
              : item.kind === "approval"
                ? policy.weight_approval
                : 0.1; // Default for unknown kinds

    // Get domain weight (from URL)
    let domainWeight = policy.weight_aggregator; // Default for unknown domains
    if (item.url) {
      try {
        const url = new URL(item.url);
        const domain = url.hostname || "";
        if (domain.endsWith(".gov.in")) {
          domainWeight = policy.weight_gov_in;
        } else if (domain.endsWith(".ac.in")) {
          domainWeight = policy.weight_ac_in;
        } else if (domain.endsWith(".edu.in")) {
          domainWeight = policy.weight_edu_in;
        }
      } catch {
        // Invalid URL, use aggregator weight
      }
    }

    // Combine weights (multiplicative blend for specificity)
    const combinedWeight = tierWeight * categoryWeight * domainWeight;

    // Calculate age multiplier (exponential decay)
    const obsTimeMs = item.observed_at || now;
    const ageMs = now - obsTimeMs;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const halfLife = policy.evidence_half_life_days;
    const ageMultiplier = Math.exp(-ageDays / halfLife);

    // Calculate contribution
    const quality = item.quality_score || 0;
    const contribution = combinedWeight * quality * ageMultiplier;

    breakdown.push({
      evidenceId: item.id,
      source: item.source,
      tier: item.tier,
      weight: combinedWeight,
      quality,
      ageMultiplier,
      contribution,
    });

    totalContribution += contribution;
  }

  // Normalize by expected_max
  const baseScore = Math.min(totalContribution / policy.expected_max, 1.0);

  // Apply conflict penalty
  const conflictPenalty = -0.1 * unresolvedConflicts.length;
  const finalScore = Math.max(baseScore + conflictPenalty, 0.0);

  return {
    score: finalScore,
    breakdown,
    terminalRule,
    unresolvedConflicts,
    adjustments: {
      conflictPenalty,
    },
  };
}

/**
 * Get weight for a domain (for external use)
 */
export function getDomainWeight(url: string | undefined, policy: ScoringPolicy): number {
  if (!url) return policy.weight_aggregator;

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname || "";
    if (domain.endsWith(".gov.in")) return policy.weight_gov_in;
    if (domain.endsWith(".ac.in")) return policy.weight_ac_in;
    if (domain.endsWith(".edu.in")) return policy.weight_edu_in;
  } catch {
    // Invalid URL
  }

  return policy.weight_aggregator;
}

/**
 * Calculate evidence age in days
 */
export function getEvidenceAgeDays(evidence: StoredEvidence, referenceTime?: number): number {
  const ref = referenceTime || Date.now();
  const ageMs = ref - (evidence.observed_at || ref);
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Calculate freshness multiplier
 */
export function getFreshnessMultiplier(ageDays: number, halfLifeDays: number): number {
  return Math.exp(-ageDays / halfLifeDays);
}
