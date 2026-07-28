/**
 * Website enricher
 *
 * Fetches and extracts data from institution's official website.
 * Emits contact, affiliation-claim, and approval-claim evidence.
 * 7-day cache.
 */

import type { ResolvedIdentity } from "../../../discovery/types";
import type { Enricher, EvidenceItem } from "../../types";
import { AuthorityCode, EvidenceQuality } from "../../types";
import { getHttpClient } from "../../../fetch/http";
import { extractPage } from "../../../fetch/extract";

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  evidence: EvidenceItem[];
  timestamp: number;
}

/**
 * Website enricher
 */
export class WebsiteEnricher implements Enricher {
  name = "website-api";
  authority = AuthorityCode.WEBSITE;
  tier = "api" as const;

  private cache = new Map<string, CacheEntry>();

  async verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]> {
    // Must have official URL
    if (!identity.officialUrl) {
      return [];
    }

    const cacheKey = identity.officialUrl;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.evidence;
    }

    try {
      const evidence = await this.extractWebsite(identity.officialUrl);

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
          url: identity.officialUrl,
          category: "unavailable",
          quality_score: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      ];
    }
  }

  async health(): Promise<boolean> {
    return true; // Website enricher is always "healthy" - failures are degraded
  }

  private async extractWebsite(url: string): Promise<EvidenceItem[]> {
    const evidence: EvidenceItem[] = [];

    try {
      const httpClient = getHttpClient();
      const result = await httpClient.fetch(url);
      const html = result.body.toString("utf-8");

      // Extract page data
      const extracted = extractPage(html, url);

      // Add contact evidence
      if (extracted.emails.length > 0) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url,
          category: "contact",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.9,
          matched_text: extracted.emails[0],
          metadata: {
            all_emails: extracted.emails,
            type: "contact_email",
          },
        });
      }

      if (extracted.phones.length > 0) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url,
          category: "contact",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.85,
          matched_text: extracted.phones[0],
          metadata: {
            all_phones: extracted.phones,
            type: "contact_phone",
          },
        });
      }

      // Add affiliation evidence
      if (extracted.affiliation) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url,
          category: "affiliation",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.75,
          matched_text: extracted.affiliation.snippet,
          claim_type: "affiliated",
          metadata: {
            claim: extracted.affiliation.text,
          },
        });
      }

      // Add approval evidence
      if (extracted.approval) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url,
          category: "approval",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.8,
          matched_text: extracted.approval.snippet,
          claim_type: "approved",
          metadata: {
            claim: extracted.approval.text,
          },
        });
      }

      // Add meta evidence (title, description)
      if (extracted.title) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url,
          category: "identity",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.7,
          matched_text: extracted.title,
          metadata: {
            type: "page_title",
          },
        });
      }
    } catch (error) {
      // Silently fail - website fetch is optional
    }

    return evidence;
  }
}

/**
 * Factory function
 */
export function createWebsiteEnricher(): Enricher {
  return new WebsiteEnricher();
}
