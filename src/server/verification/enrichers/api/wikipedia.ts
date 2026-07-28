/**
 * Wikipedia API enricher
 *
 * Verifies institution identity via Wikipedia REST API.
 * Returns: summary + infobox data.
 * 7-day cache.
 */

import type { ResolvedIdentity } from "../../../discovery/types";
import type { Enricher, EvidenceItem } from "../../types";
import { AuthorityCode, EvidenceQuality } from "../../types";

const WIKIPEDIA_API = "https://en.wikipedia.org/api/rest_v1";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  evidence: EvidenceItem[];
  timestamp: number;
}

/**
 * Wikipedia enricher
 */
export class WikipediaEnricher implements Enricher {
  name = "wikipedia-api";
  authority = AuthorityCode.WEBSITE; // Wikipedia acts as a website proxy
  tier = "api" as const;

  private cache = new Map<string, CacheEntry>();

  async verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]> {
    const cacheKey = identity.canonicalName.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.evidence;
    }

    try {
      const evidence = await this.fetchWikipedia(identity.canonicalName);

      this.cache.set(cacheKey, {
        evidence,
        timestamp: Date.now(),
      });

      return evidence;
    } catch (error) {
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
    try {
      const response = await fetch(`${WIKIPEDIA_API}/page/random/summary`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async fetchWikipedia(name: string): Promise<EvidenceItem[]> {
    const evidence: EvidenceItem[] = [];

    try {
      // Search for the page
      const searchUrl = `${WIKIPEDIA_API}/page/search?q=${encodeURIComponent(name)}&limit=1`;
      const searchResponse = await fetch(searchUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!searchResponse.ok) {
        return evidence;
      }

      const searchData = await searchResponse.json();
      if (!searchData.pages || searchData.pages.length === 0) {
        return evidence;
      }

      const pageTitle = searchData.pages[0].title;
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;

      // Fetch page summary
      const summaryUrl = `${WIKIPEDIA_API}/page/summary/${encodeURIComponent(pageTitle)}`;
      const summaryResponse = await fetch(summaryUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (summaryResponse.ok) {
        const summary = await summaryResponse.json();

        // Extract relevant information
        if (summary.extract) {
          evidence.push({
            source: this.authority,
            tier: this.tier,
            timestamp: Date.now(),
            url: pageUrl,
            category: "identity",
            quality_score: EvidenceQuality.TIER_API,
            confidence: 0.75,
            matched_text: summary.extract.substring(0, 200),
            metadata: {
              title: summary.title,
              pageid: summary.pageid,
            },
          });
        }

        // Try to extract description (infobox equivalent)
        if (summary.description) {
          evidence.push({
            source: this.authority,
            tier: this.tier,
            timestamp: Date.now(),
            url: pageUrl,
            category: "identity",
            quality_score: EvidenceQuality.TIER_API,
            confidence: 0.7,
            matched_text: summary.description,
            metadata: {
              type: "infobox_equivalent",
            },
          });
        }
      }
    } catch (error) {
      // Silently fail - Wikipedia is optional
    }

    return evidence;
  }
}

/**
 * Factory function
 */
export function createWikipediaEnricher(): Enricher {
  return new WikipediaEnricher();
}
