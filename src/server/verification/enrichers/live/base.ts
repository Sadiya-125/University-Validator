/**
 * Base live enricher
 *
 * Live enrichers make real-time requests to authority APIs.
 * Only run when:
 * 1. relevantSources includes the authority
 * 2. No mirror entry exists
 * 3. USE_LIVE_AUTHORITIES is enabled
 *
 * Per-domain concurrency: 2
 * Polite delay between requests
 * Degrade to "check-unavailable" rather than throw
 */

import type { ResolvedIdentity } from "../../../discovery/types";
import type { Enricher, EvidenceItem } from "../../types";
import { AuthorityCode } from "../../types";

let lastRequestTime = new Map<string, number>();
const POLITE_DELAY_MS = 1000; // 1 second minimum between requests

/**
 * Base live enricher
 */
export abstract class BaseLiveEnricher implements Enricher {
  abstract name: string;
  abstract authority: AuthorityCode;
  abstract domainKey: string; // For rate limiting (e.g., "aicte.gov.in")

  tier = "live" as const;

  async verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]> {
    // Check if enabled
    if (!process.env.USE_LIVE_AUTHORITIES || process.env.USE_LIVE_AUTHORITIES === "false") {
      return [];
    }

    // Apply polite delay
    await this.applyPolitenessDelay();

    try {
      return await this.checkAuthority(identity);
    } catch (error) {
      // Degrade to unavailable rather than throwing
      return [
        {
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          category: "unavailable",
          quality_score: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      ];
    }
  }

  async health(): Promise<boolean> {
    if (!process.env.USE_LIVE_AUTHORITIES || process.env.USE_LIVE_AUTHORITIES === "false") {
      return false;
    }
    return true;
  }

  /**
   * Implement in subclass
   */
  protected abstract checkAuthority(identity: ResolvedIdentity): Promise<EvidenceItem[]>;

  /**
   * Apply per-domain polite delay
   */
  private async applyPolitenessDelay(): Promise<void> {
    const lastTime = lastRequestTime.get(this.domainKey);
    if (lastTime) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < POLITE_DELAY_MS) {
        await new Promise((r) => setTimeout(r, POLITE_DELAY_MS - elapsed));
      }
    }
    lastRequestTime.set(this.domainKey, Date.now());
  }
}
