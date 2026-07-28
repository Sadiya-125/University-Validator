/**
 * Wikidata resolver (L3)
 *
 * Resolves institution input using Wikidata SPARQL queries
 * Fetches: website (P856), location (P131), founded date (P571)
 * 30-day cache TTL
 * Gated on USE_WIKIDATA environment variable
 */

import type { IdentityResolver, ResolvedCandidate } from "../types";

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  candidates: ResolvedCandidate[];
  timestamp: number;
}

interface WikidataEntity {
  item: string;
  itemLabel: string;
  website?: string;
  location?: string;
  locationLabel?: string;
  founded?: string;
}

/**
 * Wikidata resolver
 */
export class WikidataResolver implements IdentityResolver {
  name = "wikidata";
  private cache = new Map<string, CacheEntry>();

  /**
   * Resolve using Wikidata SPARQL
   */
  async resolve(
    input: string,
    opts?: { limit?: number }
  ): Promise<ResolvedCandidate[]> {
    // Check if enabled
    if (!process.env.USE_WIKIDATA || process.env.USE_WIKIDATA === "false") {
      return [];
    }

    // Check cache
    const cacheKey = input.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < WIKIDATA_CACHE_TTL) {
      const limit = opts?.limit || 10;
      return cached.candidates.slice(0, limit);
    }

    try {
      const results = await this.queryWikidata(input);

      // Store in cache
      this.cache.set(cacheKey, {
        candidates: results,
        timestamp: Date.now(),
      });

      const limit = opts?.limit || 10;
      return results.slice(0, limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * Query Wikidata SPARQL endpoint
   */
  private async queryWikidata(input: string): Promise<ResolvedCandidate[]> {
    const sparql = this.buildSparqlQuery(input);

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
    return this.parseWikidataResults(data, input);
  }

  /**
   * Build SPARQL query for institution search
   */
  private buildSparqlQuery(input: string): string {
    // Escape quotes in input
    const escaped = input.replace(/"/g, '\\"');

    return `
      SELECT ?item ?itemLabel ?website ?location ?locationLabel ?founded
      WHERE {
        ?item rdfs:label "${escaped}"@en.
        ?item (wdt:P31/(wdt:P279*)) wd:Q3918.
        OPTIONAL { ?item wdt:P856 ?website. }
        OPTIONAL { ?item wdt:P131 ?location. }
        OPTIONAL { ?item wdt:P571 ?founded. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 10
    `;
  }

  /**
   * Parse Wikidata SPARQL results
   */
  private parseWikidataResults(data: any, input: string): ResolvedCandidate[] {
    if (!data.results || !data.results.bindings) {
      return [];
    }

    return (data.results.bindings as any[])
      .map((binding: any) => {
        const item = binding.item?.value || "";
        const itemId = item.split("/").pop() || "";

        return {
          id: itemId,
          name: binding.itemLabel?.value || input,
          type: "wikidata" as const,
          confidence: 0.7, // Wikidata matches are lower confidence
          source: `wikidata/${itemId}`,
          score: 0.7,
        };
      });
  }

  /**
   * Health check
   */
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

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ query: string; candidates: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([query, entry]) => ({
      query,
      candidates: entry.candidates.length,
      age: now - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }
}

/**
 * Factory function
 */
export function createWikidataResolver(): WikidataResolver {
  return new WikidataResolver();
}

/**
 * Global instance
 */
let globalResolver: WikidataResolver | null = null;

/**
 * Get global Wikidata resolver
 */
export function getWikidataResolver(): WikidataResolver {
  if (!globalResolver) {
    globalResolver = new WikidataResolver();
  }
  return globalResolver;
}
