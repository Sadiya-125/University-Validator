/**
 * Discovery orchestrator service
 *
 * Coordinates multi-layer resolver chain:
 * L0 - Cache (24h TTL)
 * L1 - Institution resolver (matching/resolver)
 * L2 - Mirror resolver (registry database)
 * L3+ - Wikidata resolver (SPARQL queries)
 *
 * Website discovery layer (2s budget, 7d cache)
 * Short-circuit: when canonicalName + officialUrl at confidence ≥0.7
 * Hard budget: 6s total, 3 web queries max
 */

import type {
  ResolvedIdentity,
  DiscoveryOptions,
  DiscoveryStep,
  DiscoveryRun,
  ResolvedCandidate,
} from "./types";
import { getCacheResolver } from "./resolvers/cache";
import { getInstitutionResolver } from "./resolvers/institutions";
import { getMirrorResolver } from "./resolvers/mirror";
import { getWikidataResolver } from "./resolvers/wikidata";
import { discoverWebsite } from "./website";

const DEFAULT_OPTIONS: Required<DiscoveryOptions> = {
  highConfidenceThreshold: 0.9,
  reviewThreshold: 0.7,
  identityBudgetMs: 400,
  websiteBudgetMs: 2000,
  totalBudgetMs: 6000,
  discoverWebsite: true,
  maxWebRequests: 3,
  searchLanguage: "en",
  safeSearch: true,
};

/**
 * Discovery service
 */
export class DiscoveryService {
  private cacheResolver = getCacheResolver();
  private institutionResolver = getInstitutionResolver();
  private mirrorResolver = getMirrorResolver();
  private wikidataResolver = getWikidataResolver();

  /**
   * Discover institution identity
   */
  async discover(input: string, opts?: DiscoveryOptions): Promise<DiscoveryRun> {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    const startTime = Date.now();
    const steps: DiscoveryStep[] = [];

    try {
      // L0: Check cache
      const cacheStart = Date.now();
      const cachedCandidates = await this.cacheResolver.resolve(input, { limit: 10 });
      const cacheStep: DiscoveryStep = {
        resolver: "cache",
        timestamp: cacheStart,
        durationMs: Date.now() - cacheStart,
        success: cachedCandidates.length > 0,
        candidatesFound: cachedCandidates.length,
      };
      steps.push(cacheStep);

      if (cachedCandidates.length > 0) {
        const result = this.buildResult(input, cachedCandidates, ["cache"], steps);
        return {
          input,
          result,
          steps,
          totalDurationMs: Date.now() - startTime,
          budgetExceeded: false,
        };
      }

      // L1: Institution resolver (identity budget)
      const identityBudgetRemaining = Math.max(
        0,
        options.identityBudgetMs - (Date.now() - startTime)
      );

      const l1Start = Date.now();
      const l1Candidates = await this.timeoutPromise(
        this.institutionResolver.resolve(input, { limit: 10 }),
        identityBudgetRemaining
      );
      const l1Step: DiscoveryStep = {
        resolver: "institutions",
        timestamp: l1Start,
        durationMs: Date.now() - l1Start,
        success: l1Candidates.length > 0,
        candidatesFound: l1Candidates.length,
      };
      steps.push(l1Step);

      // L2: Mirror resolver (database only)
      const l2Start = Date.now();
      const l2Candidates = await this.mirrorResolver.resolve(input, { limit: 10 });
      const l2Step: DiscoveryStep = {
        resolver: "mirror",
        timestamp: l2Start,
        durationMs: Date.now() - l2Start,
        success: l2Candidates.length > 0,
        candidatesFound: l2Candidates.length,
      };
      steps.push(l2Step);

      // Check budget before L3
      const timeElapsed = Date.now() - startTime;
      const budgetExceeded = timeElapsed > options.totalBudgetMs;

      // L3: Wikidata (only if budget allows)
      let l3Candidates: ResolvedCandidate[] = [];
      if (!budgetExceeded) {
        const l3Start = Date.now();
        l3Candidates = await this.timeoutPromise(
          this.wikidataResolver.resolve(input, { limit: 10 }),
          Math.max(0, options.totalBudgetMs - (Date.now() - startTime))
        );
        const l3Step: DiscoveryStep = {
          resolver: "wikidata",
          timestamp: l3Start,
          durationMs: Date.now() - l3Start,
          success: l3Candidates.length > 0,
          candidatesFound: l3Candidates.length,
        };
        steps.push(l3Step);
      }

      // Merge all candidates
      const allCandidates = this.mergeCandidates([
        ...l1Candidates,
        ...l2Candidates,
        ...l3Candidates,
      ]);

      // Build initial result
      let result = this.buildResult(input, allCandidates, ["institutions", "mirror", "wikidata"], steps);

      // Website discovery (if enabled and budget allows)
      if (
        options.discoverWebsite &&
        Date.now() - startTime < options.totalBudgetMs
      ) {
        const websiteStart = Date.now();
        const websiteBudget = Math.min(
          options.websiteBudgetMs,
          Math.max(0, options.totalBudgetMs - (Date.now() - startTime))
        );

        try {
          const website = await this.timeoutPromise(
            discoverWebsite(result.canonicalName, result.state, {
              timeout: websiteBudget,
            }),
            websiteBudget
          );

          if (website) {
            result.officialUrl = website.url;
            result.officialUrlConfidence = 0.8; // Website discovery confidence

            // Short-circuit if high confidence
            if (
              result.confidence >= options.highConfidenceThreshold &&
              result.officialUrl
            ) {
              result.resolverChain = ["cache", "institutions", "mirror", "website"];
              return {
                input,
                result,
                steps,
                totalDurationMs: Date.now() - startTime,
                budgetExceeded,
              };
            }
          }
        } catch {
          // Website discovery failed, continue
        }
      }

      // Cache the result
      this.cacheResolver.store(input, allCandidates);

      return {
        input,
        result,
        steps,
        totalDurationMs: Date.now() - startTime,
        budgetExceeded: Date.now() - startTime > options.totalBudgetMs,
      };
    } catch (error) {
      return {
        input,
        result: {
          canonicalName: input,
          type: "registry",
          confidence: 0,
          needsReview: true,
          needsHumanReview: true,
          resolverChain: [],
          resolvedAt: Date.now(),
          candidates: [],
        },
        steps,
        totalDurationMs: Date.now() - startTime,
        budgetExceeded: true,
      };
    }
  }

  /**
   * Build result from candidates
   */
  private buildResult(
    input: string,
    candidates: ResolvedCandidate[],
    resolvers: string[],
    steps: DiscoveryStep[]
  ): ResolvedIdentity {
    const topCandidate = candidates[0];

    if (!topCandidate) {
      return {
        canonicalName: input,
        type: "registry",
        confidence: 0,
        needsReview: false,
        needsHumanReview: true,
        resolverChain: resolvers,
        resolvedAt: Date.now(),
        candidates: [],
      };
    }

    const confidence = topCandidate.confidence || 0.5;
    const needsReview = confidence >= 0.7 && confidence < 0.9;
    const needsHumanReview = confidence < 0.7;

    return {
      institutionId: topCandidate.type === "institution" ? Number(topCandidate.id) : undefined,
      registryEntryId: topCandidate.type === "registry" ? String(topCandidate.id) : undefined,
      canonicalName: topCandidate.name,
      type: topCandidate.type,
      confidence,
      needsReview,
      needsHumanReview,
      resolverChain: resolvers,
      resolvedAt: Date.now(),
      candidates: candidates.slice(0, 5),
    };
  }

  /**
   * Merge and deduplicate candidates
   */
  private mergeCandidates(candidates: ResolvedCandidate[]): ResolvedCandidate[] {
    const merged = new Map<string, ResolvedCandidate>();

    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.id}`;
      const existing = merged.get(key);

      if (
        !existing ||
        (candidate.confidence || 0) > (existing.confidence || 0)
      ) {
        merged.set(key, candidate);
      }
    }

    return Array.from(merged.values()).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /**
   * Timeout wrapper for promises
   */
  private async timeoutPromise<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    if (timeoutMs <= 0) {
      return promise.then(() => (undefined as unknown) as T).catch(() => (undefined as unknown) as T);
    }

    return Promise.race([
      promise,
      new Promise<T>((_resolve, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      ),
    ]).catch(() => (undefined as unknown) as T);
  }
}

/**
 * Global service instance
 */
let globalService: DiscoveryService | null = null;

/**
 * Get global discovery service
 */
export function getDiscoveryService(): DiscoveryService {
  if (!globalService) {
    globalService = new DiscoveryService();
  }
  return globalService;
}

/**
 * Discover institution (convenience function)
 */
export async function discover(
  input: string,
  opts?: DiscoveryOptions
): Promise<ResolvedIdentity> {
  const service = getDiscoveryService();
  const run = await service.discover(input, opts);
  return run.result;
}
