/**
 * Verification service orchestrator
 *
 * Coordinates multi-tier verification:
 * 1. Mirror tier: fast registry lookups (<80ms)
 * 2. API tier: public web APIs (1-5s)
 * 3. Live tier: direct authority checks (5-30s, gated)
 *
 * Short-circuits before live tier if mirror + api evidence exceeds Genuine threshold.
 * Terminal short-circuit: UGC_FAKE registry hit stops all further verification.
 *
 * Returns { evidence, sourcesAttempted, sourcesUnavailable, legitimacyScore }
 */

import type {
  ResolvedIdentity,
  DiscoveryOptions,
} from "../discovery/types";
import type {
  Enricher,
  EvidenceItem,
  VerificationContext,
  VerificationResult,
  VerificationTier,
} from "./types";
import { AuthorityCode, EvidenceQuality } from "./types";
import { relevantSources } from "./applicability";
import { getAllMirrorEnrichers, getMirrorEnricher } from "./enrichers/mirror";
import { getAPIEnrichers } from "./enrichers/api";

const DEFAULT_GENUINE_THRESHOLD = 0.85;
const DEFAULT_TOTAL_BUDGET = 6000; // 6 seconds
const DEFAULT_TIER_BUDGETS = {
  mirror: 500, // ms
  api: 3000,
  live: 2500,
};

/**
 * Verification service
 */
export class VerificationService {
  /**
   * Verify institution identity
   */
  async verify(
    identity: ResolvedIdentity,
    ctx?: VerificationContext
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const evidence: EvidenceItem[] = [];
    const sourcesAttempted: AuthorityCode[] = [];
    const sourcesUnavailable: AuthorityCode[] = [];
    const tierDurations: Record<VerificationTier, number> = {
      mirror: 0,
      api: 0,
      live: 0,
    };

    const genuineThreshold = ctx?.genuineThreshold || DEFAULT_GENUINE_THRESHOLD;
    const totalBudget = ctx?.totalBudgetMs || DEFAULT_TOTAL_BUDGET;
    const tierBudgets = { ...DEFAULT_TIER_BUDGETS, ...ctx?.tierBudgets };

    try {
      // Determine relevant sources
      const applicableSources = relevantSources(identity);

      // TIER 1: Mirror (fast registry lookups)
      const mirrorStart = Date.now();
      const mirrorEv = await this.runTier("mirror", applicableSources, identity, {
        budget: tierBudgets.mirror,
      });
      evidence.push(...mirrorEv.evidence);
      sourcesAttempted.push(...mirrorEv.sourcesAttempted);
      sourcesUnavailable.push(...mirrorEv.sourcesUnavailable);
      tierDurations.mirror = Date.now() - mirrorStart;

      // CHECK: Terminal short-circuit on UGC_FAKE
      const isFake = evidence.some((e) => e.source === AuthorityCode.UGC_FAKE);
      if (isFake) {
        return {
          evidence,
          sourcesAttempted,
          sourcesUnavailable,
          shortCircuitedAt: "mirror (UGC_FAKE)",
          totalDurationMs: Date.now() - startTime,
          tierDurations,
        };
      }

      // Check time budget
      if (Date.now() - startTime > totalBudget) {
        return {
          evidence,
          sourcesAttempted,
          sourcesUnavailable,
          totalDurationMs: Date.now() - startTime,
          tierDurations,
        };
      }

      // TIER 2: API (public web APIs)
      const apiStart = Date.now();
      const remainingBudget = totalBudget - (Date.now() - startTime);
      const apiEv = await this.runTier("api", applicableSources, identity, {
        budget: Math.min(tierBudgets.api, remainingBudget),
      });
      evidence.push(...apiEv.evidence);
      sourcesAttempted.push(...apiEv.sourcesAttempted);
      sourcesUnavailable.push(...apiEv.sourcesUnavailable);
      tierDurations.api = Date.now() - apiStart;

      // Check time budget
      if (Date.now() - startTime > totalBudget) {
        return {
          evidence,
          sourcesAttempted,
          sourcesUnavailable,
          totalDurationMs: Date.now() - startTime,
          tierDurations,
        };
      }

      // Check: Should we proceed to live tier?
      const currentLegitimacyScore = this.calculateLegitimacyScore(evidence);
      if (currentLegitimacyScore >= genuineThreshold) {
        return {
          evidence,
          sourcesAttempted,
          sourcesUnavailable,
          legitimacyScore: currentLegitimacyScore,
          shortCircuitedAt: "before live tier (score threshold reached)",
          totalDurationMs: Date.now() - startTime,
          tierDurations,
        };
      }

      // TIER 3: Live (direct authority checks)
      if (ctx?.liveLookupEnabled !== false) {
        const liveStart = Date.now();
        const remainingBudget2 = totalBudget - (Date.now() - startTime);
        const liveEv = await this.runTier("live", applicableSources, identity, {
          budget: Math.min(tierBudgets.live, remainingBudget2),
          skipIfMirrorExists: true, // Only run if no mirror entry
        });
        evidence.push(...liveEv.evidence);
        sourcesAttempted.push(...liveEv.sourcesAttempted);
        sourcesUnavailable.push(...liveEv.sourcesUnavailable);
        tierDurations.live = Date.now() - liveStart;
      }

      // Calculate final legitimacy score
      const legitimacyScore = this.calculateLegitimacyScore(evidence);

      return {
        evidence,
        sourcesAttempted,
        sourcesUnavailable,
        legitimacyScore,
        totalDurationMs: Date.now() - startTime,
        tierDurations,
      };
    } catch (error) {
      // Degrade gracefully
      return {
        evidence,
        sourcesAttempted,
        sourcesUnavailable,
        totalDurationMs: Date.now() - startTime,
        tierDurations,
      };
    }
  }

  /**
   * Run a verification tier
   */
  private async runTier(
    tier: VerificationTier,
    applicableSources: any[],
    identity: ResolvedIdentity,
    opts: {
      budget: number;
      skipIfMirrorExists?: boolean;
    }
  ): Promise<{
    evidence: EvidenceItem[];
    sourcesAttempted: AuthorityCode[];
    sourcesUnavailable: AuthorityCode[];
  }> {
    const evidence: EvidenceItem[] = [];
    const sourcesAttempted: AuthorityCode[] = [];
    const sourcesUnavailable: AuthorityCode[] = [];
    const startTime = Date.now();

    // Filter to applicable sources for this tier
    const tierSources = applicableSources.filter((s) => s.tier === tier);

    // Get enrichers for this tier
    const enrichers: Enricher[] = [];

    for (const source of tierSources) {
      let enricher: Enricher | null = null;

      if (tier === "mirror") {
        enricher = getMirrorEnricher(source.authority);
      } else if (tier === "api") {
        // Get API enricher (skip if not available)
        const apiEnrichers = getAPIEnrichers();
        enricher =
          apiEnrichers.find((e) => e.authority === source.authority) || null;
      } else if (tier === "live") {
        // Live enrichers would be fetched from a registry
        // For now, skip live (not yet implemented)
        enricher = null;
      }

      if (enricher) {
        enrichers.push(enricher);
      }
    }

    // Run enrichers concurrently (within budget)
    const tasks = enrichers.map((enricher) => (async () => {
      try {
        sourcesAttempted.push(enricher.authority);

        // Check timeout
        const timeRemaining = opts.budget - (Date.now() - startTime);
        if (timeRemaining <= 0) {
          sourcesUnavailable.push(enricher.authority);
          return [];
        }

        const tierEv = await enricher.verify(identity, {
          timeout: timeRemaining,
        });

        return tierEv;
      } catch (error) {
        sourcesUnavailable.push(enricher.authority);
        return [];
      }
    })());

    const results = await Promise.allSettled(tasks);

    for (const result of results) {
      if (result.status === "fulfilled") {
        evidence.push(...result.value);
      }
    }

    return {
      evidence,
      sourcesAttempted,
      sourcesUnavailable,
    };
  }

  /**
   * Calculate legitimacy score from evidence
   */
  private calculateLegitimacyScore(evidence: EvidenceItem[]): number {
    if (evidence.length === 0) return 0;

    // Score based on evidence quality and category
    let totalScore = 0;
    let legitimacyEvidenceCount = 0;

    for (const item of evidence) {
      if (item.category === "legitimacy" || item.category === "identity") {
        totalScore += item.quality_score * (item.confidence || 0.5);
        legitimacyEvidenceCount++;
      }
    }

    if (legitimacyEvidenceCount === 0) return 0;

    return Math.min(1, totalScore / legitimacyEvidenceCount);
  }
}

/**
 * Global service instance
 */
let globalService: VerificationService | null = null;

/**
 * Get global verification service
 */
export function getVerificationService(): VerificationService {
  if (!globalService) {
    globalService = new VerificationService();
  }
  return globalService;
}

/**
 * Verify institution (convenience function)
 */
export async function verify(
  identity: ResolvedIdentity,
  ctx?: VerificationContext
): Promise<VerificationResult> {
  const service = getVerificationService();
  return service.verify(identity, ctx);
}
