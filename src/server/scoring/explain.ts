/**
 * Explanation chains
 *
 * Produces human-readable audit trail showing how scoring and decision
 * were reached. Maps scoring result → decision → explanation.
 *
 * Output: ExplanationLink[] chain + summary sentence
 */

import type { ScoringResult, ExplanationLink, Explanation, ScoringDecision } from "./types";
import { Verdict } from "./types";

/**
 * Explain scoring result
 */
export function explainScoring(
  result: ScoringResult,
  expectedMax: number
): ExplanationLink[] {
  const links: ExplanationLink[] = [];
  let step = 1;

  // Step 1: Terminal rules
  if (result.terminalRule) {
    links.push({
      step: step++,
      type: "terminal_rule",
      reason:
        result.terminalRule === "UGC_FAKE"
          ? "Institution hit UGC Fake List"
          : "Authority status withdrawn",
      impact: 0, // Terminal rules override score
    });
  }

  // Step 2: Evidence contributions (top 5)
  const topContributions = result.breakdown
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  for (const contrib of topContributions) {
    links.push({
      step: step++,
      type: "contribution",
      reason: `${contrib.source} (${contrib.tier}) contributed ${contrib.contribution.toFixed(3)}`,
      evidence: contrib.evidenceId,
      impact: contrib.contribution,
    });
  }

  // Step 3: Normalization
  const totalContribution = result.breakdown.reduce((sum, c) => sum + c.contribution, 0);
  links.push({
    step: step++,
    type: "threshold",
    reason: `Score normalized: ${totalContribution.toFixed(3)} / ${expectedMax} = ${result.score.toFixed(3)}`,
    impact: result.score,
  });

  // Step 4: Conflicts (if any)
  if (result.unresolvedConflicts.length > 0) {
    links.push({
      step: step++,
      type: "conflict",
      reason: `${result.unresolvedConflicts.length} unresolved conflicts detected`,
      impact: result.adjustments.conflictPenalty,
    });
  }

  return links;
}

/**
 * Explain decision
 */
export function explainDecision(decision: ScoringDecision): ExplanationLink[] {
  const links: ExplanationLink[] = [];
  let step = 1;

  // Step 1: Threshold mapping
  const thresholdReason =
    decision.verdict === Verdict.GENUINE
      ? "Score ≥ Genuine threshold"
      : decision.verdict === Verdict.LIKELY_GENUINE
        ? "Score ≥ Likely Genuine threshold"
        : decision.verdict === Verdict.LIKELY_FAKE
          ? "Score in Likely Fake range"
          : decision.verdict === Verdict.FAKE
            ? "Score ≤ Fake threshold"
            : "Insufficient evidence";

  links.push({
    step: step++,
    type: "threshold",
    reason: `${thresholdReason} → ${decision.verdict}`,
    impact: decision.score,
  });

  // Step 2: Hard constraint (if applicable)
  if (
    decision.remarks.some((r) => r.includes("API-only")) &&
    decision.verdict === Verdict.LIKELY_GENUINE
  ) {
    links.push({
      step: step++,
      type: "decision",
      reason: "Hard constraint: Genuine requires mirror/live tier (capped at Likely Genuine)",
      impact: 0,
    });
  }

  // Step 3: Needs review logic
  if (decision.needsReview) {
    const reason = decision.breakdown.tierDistribution.mirror
      ? "Borderline evidence in middle band, flagged for review"
      : "Limited or conflicting evidence, flagged for review";
    links.push({
      step: step++,
      type: "decision",
      reason,
      impact: 0,
    });
  }

  // Step 4: Next check
  const recheckDays = Math.round(
    (decision.nextCheckAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  links.push({
    step: step++,
    type: "decision",
    reason: `Scheduled recheck in ${recheckDays} days`,
    impact: 0,
  });

  return links;
}

/**
 * Convert explanation links to human-readable sentences
 */
export function toSentences(links: ExplanationLink[]): string {
  const sentences: string[] = [];

  for (const link of links) {
    const base = `${link.reason}`;
    if (link.evidence) {
      sentences.push(`${base} (${link.evidence}).`);
    } else {
      sentences.push(`${base}.`);
    }
  }

  return sentences.join(" ");
}

/**
 * Build full explanation from scoring + decision
 */
export function buildExplanation(
  result: ScoringResult,
  decision: ScoringDecision,
  expectedMax: number
): Explanation {
  const scoringLinks = explainScoring(result, expectedMax);
  const decisionLinks = explainDecision(decision);
  const allLinks = [...scoringLinks, ...decisionLinks];

  const summary = buildSummary(decision, result);

  return {
    links: allLinks,
    summary,
  };
}

/**
 * Build summary sentence
 */
function buildSummary(decision: ScoringDecision, result: ScoringResult): string {
  const verdictWord = decision.verdict.toLowerCase();
  const scorePercent = Math.round(decision.score * 100);
  const evidenceCount = decision.breakdown.evidenceCount;

  let summary = `Based on ${evidenceCount} evidence sources, this institution is classified as ${verdictWord} (score: ${scorePercent}%).`;

  if (decision.remarks.length > 0) {
    summary += ` ${decision.remarks.join("; ")}.`;
  }

  if (decision.needsReview) {
    summary += " This classification requires manual review.";
  }

  if (result.unresolvedConflicts.length > 0) {
    summary += ` There are ${result.unresolvedConflicts.length} conflicting evidence items to investigate.`;
  }

  return summary;
}

/**
 * Get evidence references from explanation
 */
export function getEvidenceReferences(links: ExplanationLink[]): string[] {
  return links
    .filter((link) => link.evidence)
    .map((link) => link.evidence!)
    .filter((ref, idx, arr) => arr.indexOf(ref) === idx); // Unique
}

/**
 * Explain insufficient evidence (for INSUFFICIENT_EVIDENCE verdict)
 */
export function explainInsufficientEvidence(
  decision: ScoringDecision
): ExplanationLink[] {
  const links: ExplanationLink[] = [];
  let step = 1;

  links.push({
    step: step++,
    type: "decision",
    reason: "Insufficient evidence for conclusive verdict",
    impact: 0,
  });

  for (const reason of decision.insufficientEvidenceReasons) {
    links.push({
      step: step++,
      type: "decision",
      reason: `Missing: ${reason}`,
      impact: 0,
    });
  }

  return links;
}
