/**
 * Wikidata API enricher
 *
 * Verifies institution identity via Wikidata SPARQL queries.
 * Returns: inception, parent org, coordinates, alternate labels.
 * Flagged as identity-corroborating, NOT legitimacy-proving.
 * 30-day cache.
 */

import type { ResolvedIdentity } from "../../../discovery/types";
import type { Enricher, EvidenceItem } from "../../types";
import { AuthorityCode, EvidenceQuality } from "../../types";

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  evidence: EvidenceItem[];
  timestamp: number;
}

interface WikidataResult {
  item?: string;
  itemLabel?: string;
  inception?: string;
  parent?: string;
  parentLabel?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Wikidata enricher
 */
export class WikidataEnricher implements Enricher {
  name = "wikidata-api";
  authority = AuthorityCode.WIKIDATA;
  tier = "api" as const;

  private cache = new Map<string, CacheEntry>();

  async verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]> {
    // Check if enabled
    if (!process.env.USE_WIKIDATA || process.env.USE_WIKIDATA === "false") {
      return [];
    }

    // Check cache
    const cacheKey = identity.canonicalName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.evidence;
    }

    try {
      const evidence = await this.queryWikidata(identity.canonicalName);

      // Store in cache
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
    if (!process.env.USE_WIKIDATA || process.env.USE_WIKIDATA === "false") {
      return false;
    }

    try {
      const response = await fetch(WIKIDATA_SPARQL_ENDPOINT, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async queryWikidata(name: string): Promise<EvidenceItem[]> {
    const sparql = `
      SELECT ?item ?itemLabel ?inception ?parent ?parentLabel ?latitude ?longitude
      WHERE {
        ?item rdfs:label "${name.replace(/"/g, '\\"')}"@en.
        ?item wdt:P31 ?type.
        FILTER (?type IN (wd:Q3918, wd:Q2385804, wd:Q16917, wd:Q11032))
        OPTIONAL { ?item wdt:P571 ?inception. }
        OPTIONAL { ?item wdt:P131 ?parent. }
        OPTIONAL { ?item wdt:P625 ?coords. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 1
    `;

    const response = await fetch(WIKIDATA_SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent":
          "UniversityValidator/1.0 (+https://github.com/anthropics/university-validator)",
      },
      body: `query=${encodeURIComponent(sparql)}`,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL returned ${response.status}`);
    }

    const data = await response.json();
    const evidence: EvidenceItem[] = [];

    if (data.results?.bindings?.[0]) {
      const binding = data.results.bindings[0];

      // Parse inception date
      if (binding.inception?.value) {
        const inceptionYear = binding.inception.value.split("-")[0];
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url: binding.item?.value,
          category: "identity",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.8,
          matched_text: `Founded: ${inceptionYear}`,
          metadata: {
            inception: binding.inception.value,
          },
        });
      }

      // Parse parent organization
      if (binding.parentLabel?.value) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url: binding.item?.value,
          category: "identity",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.7,
          matched_text: `Parent: ${binding.parentLabel.value}`,
          metadata: {
            parent: binding.parentLabel.value,
          },
        });
      }

      // Parse coordinates (if available)
      if (binding.latitude?.value && binding.longitude?.value) {
        evidence.push({
          source: this.authority,
          tier: this.tier,
          timestamp: Date.now(),
          url: binding.item?.value,
          category: "identity",
          quality_score: EvidenceQuality.TIER_API,
          confidence: 0.6,
          matched_text: `Location: ${binding.latitude.value}, ${binding.longitude.value}`,
          metadata: {
            latitude: binding.latitude.value,
            longitude: binding.longitude.value,
          },
        });
      }
    }

    return evidence;
  }
}

/**
 * Factory function
 */
export function createWikidataEnricher(): Enricher {
  return new WikidataEnricher();
}
