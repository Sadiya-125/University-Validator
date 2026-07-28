/**
 * Scoring policy decision
 *
 * Converts ScoringResult into actionable ScoringDecision based on
 * policy thresholds and institution type rules.
 *
 * HARD CONSTRAINT:
 * - Genuine verdict requires ≥1 evidence from mirror or live tier
 * - API-only evidence (no mirror/live) caps at Likely Genuine maximum
 */

import type { StoredEvidence } from "../evidence/types";
import type {
  ScoringPolicy,
  ScoringResult,
  ScoringDecision,
  InsufficientEvidenceReason,
} from "./types";
import { Verdict } from "./types";

/**
 * Context for decision making
 */
export interface DecisionContext {
  evidence: StoredEvidence[];
  missingAuthorities?: string[]; // Authorities not checked or unavailable
}

/**
 * Decide verdict based on scoring result and policy
 *
 * Algorithm:
 * 1. Apply HARD CONSTRAINT: Genuine requires mirror/live tier
 * 2. Map score to bands using policy thresholds
 * 3. Determine needsReview if in middle band or conflicts exist
 * 4. Calculate nextCheckAt based on risk level
 * 5. Generate insufficientEvidenceReasons if applicable
 */
export function decide(
  result: ScoringResult,
  policy: ScoringPolicy,
  context: DecisionContext = { evidence: [] }
): ScoringDecision {
  const score = result.score;
  const evidence = context.evidence;
  const missingAuthorities = context.missingAuthorities || [];

  // HARD CONSTRAINT: Check if we have mirror or live tier evidence
  const hasMirrorOrLive = evidence.some(
    (e) => e.kind !== "unavailable" && (e.tier === "mirror" || e.tier === "live")
  );

  // Determine base verdict from thresholds
  let baseVerdict: Verdict;

  // Terminal rule with UGC_FAKE always maps to FAKE
  if (result.terminalRule === "UGC_FAKE") {
    baseVerdict = Verdict.FAKE;
  } else if (score >= policy.threshold_genuine) {
    baseVerdict = Verdict.GENUINE;
  } else if (score >= policy.threshold_likely_genuine) {
    baseVerdict = Verdict.LIKELY_GENUINE;
  } else if (score >= policy.threshold_likely_fake) {
    baseVerdict = Verdict.LIKELY_FAKE;
  } else if (score >= policy.threshold_fake) {
    baseVerdict = Verdict.FAKE;
  } else {
    baseVerdict = Verdict.LIKELY_FAKE;
  }

  // HARD CONSTRAINT: API-only evidence cannot reach Genuine
  let verdict = baseVerdict;
  if (!hasMirrorOrLive && verdict === Verdict.GENUINE) {
    verdict = Verdict.LIKELY_GENUINE; // Cap at Likely Genuine if API-only
  }

  // Determine if needs review
  const inMiddleBand =
    score >= policy.threshold_likely_genuine && score < policy.threshold_genuine;
  const hasConflicts = result.unresolvedConflicts.length > 0;
  const hasTerminalRule = !!result.terminalRule;
  const needsReview = (inMiddleBand || hasConflicts) && !hasTerminalRule;

  // Calculate confidence
  // Confidence is higher when: score is extreme, no conflicts, has multiple sources
  const extremeness = Math.min(Math.max(Math.abs(score - 0.5) * 2, 0), 1);
  const conflictFactor = 1 - Math.min(result.unresolvedConflicts.length * 0.1, 0.5);
  const sourceFactor = Math.min(evidence.length / 5, 1.0); // 5+ sources = max confidence
  const confidence = extremeness * conflictFactor * sourceFactor;

  // Calculate tier distribution
  const tierDistribution: Record<string, number> = {};
  for (const item of evidence) {
    if (item.kind !== "unavailable") {
      tierDistribution[item.tier] = (tierDistribution[item.tier] || 0) + 1;
    }
  }

  // Determine next check time
  const isHighRisk =
    verdict === Verdict.FAKE ||
    verdict === Verdict.LIKELY_FAKE ||
    needsReview ||
    hasConflicts;
  const recheckDays = isHighRisk
    ? policy.recheck_interval_high_risk_days
    : policy.recheck_interval_days;
  const nextCheckAt = new Date(Date.now() + recheckDays * 24 * 60 * 60 * 1000);

  // Generate insufficient evidence reasons
  const insufficientEvidenceReasons: string[] = [];
  if (missingAuthorities.length > 0) {
    insufficientEvidenceReasons.push(
      `Missing checks for: ${missingAuthorities.join(", ")}`
    );
  }

  if (evidence.length === 0) {
    insufficientEvidenceReasons.push("No evidence available for verification");
  } else if (evidence.length < 3) {
    insufficientEvidenceReasons.push("Limited evidence (< 3 sources)");
  }

  if (!hasMirrorOrLive && evidence.length > 0) {
    insufficientEvidenceReasons.push("Only API-tier evidence available");
  }

  // Generate remarks
  const remarks: string[] = [];
  if (result.terminalRule === "UGC_FAKE") {
    remarks.push("Institution listed on UGC Fake List");
  } else if (result.terminalRule === "WITHDRAWN_AUTHORITY") {
    remarks.push("Authority status withdrawn or closed");
  }

  if (hasConflicts) {
    remarks.push(`${result.unresolvedConflicts.length} conflicting evidence items`);
  }

  if (!hasMirrorOrLive && verdict === Verdict.LIKELY_GENUINE) {
    remarks.push("Verdict capped at Likely Genuine (API-only evidence)");
  }

  return {
    verdict,
    score,
    confidence,
    breakdown: {
      evidenceCount: evidence.filter((e) => e.kind !== "unavailable").length,
      tierDistribution,
    },
    needsReview,
    insufficientEvidenceReasons,
    nextCheckAt,
    remarks,
  };
}

/**
 * Determine if verdict is positive (likely genuine)
 */
export function isPositive(verdict: Verdict): boolean {
  return verdict === Verdict.GENUINE || verdict === Verdict.LIKELY_GENUINE;
}

/**
 * Determine if verdict is negative (likely fake)
 */
export function isNegative(verdict: Verdict): boolean {
  return verdict === Verdict.FAKE || verdict === Verdict.LIKELY_FAKE;
}

/**
 * Get verdict color for UI rendering
 */
export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case Verdict.GENUINE:
      return "green";
    case Verdict.LIKELY_GENUINE:
      return "lime";
    case Verdict.NEEDS_REVIEW:
      return "yellow";
    case Verdict.LIKELY_FAKE:
      return "orange";
    case Verdict.FAKE:
      return "red";
    case Verdict.INSUFFICIENT_EVIDENCE:
      return "gray";
  }
}

/**
 * Get verdict description
 */
export function getVerdictDescription(verdict: Verdict): string {
  switch (verdict) {
    case Verdict.GENUINE:
      return "Institution appears to be genuine based on available evidence";
    case Verdict.LIKELY_GENUINE:
      return "Institution likely genuine, but limited evidence or API-only verification";
    case Verdict.NEEDS_REVIEW:
      return "Institution requires manual review due to conflicts or borderline evidence";
    case Verdict.LIKELY_FAKE:
      return "Institution likely fake based on evidence";
    case Verdict.FAKE:
      return "Institution is confirmed fake (e.g., on UGC Fake List)";
    case Verdict.INSUFFICIENT_EVIDENCE:
      return "Insufficient evidence to reach a conclusion";
  }
}
