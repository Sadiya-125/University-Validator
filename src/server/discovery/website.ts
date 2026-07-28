/**
 * Official website discovery layer
 *
 * Features:
 * - domainGuess: acronym / acronym+city / first-word+acronym candidates
 * - HEAD requests up to 8 (concurrency 4, 2s per request)
 * - GET survivors to validate title
 * - Accept only if <title> fuzzy-matches ≥0.6 with institution name
 * - Fallback: search results if no credible site found
 * - 2s budget, 7d cache
 */

import { getHttpClient } from "../fetch/http";
import { getSearchFactory } from "../search/factory";
import type { SearchResult } from "../search/types";

const WEBSITE_BUDGET_MS = 2000;
const WEBSITE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const TITLE_MATCH_THRESHOLD = 0.6;

interface WebsiteCacheEntry {
  url: string;
  titleMatch: number;
  timestamp: number;
}

/**
 * Domain guesser for common institution patterns
 */
function generateDomainGuesses(institutionName: string, state?: string): string[] {
  const guesses: string[] = [];
  const lowerName = institutionName.toLowerCase().trim();

  // Extract acronym (uppercase letters)
  const acronym = (lowerName.match(/\b(\w)/g) || []).join("").toLowerCase();

  // Extract first word
  const firstWord = lowerName.split(/\s+/)[0];

  // Common domain patterns
  if (acronym && acronym.length <= 5) {
    // acronym.edu.in
    guesses.push(`${acronym}.edu.in`);
    guesses.push(`${acronym}.ac.in`);
    guesses.push(`www.${acronym}.edu.in`);

    // acronym+city.edu.in
    if (state) {
      const stateLower = state.toLowerCase().split(/\s+/)[0];
      guesses.push(`${acronym}${stateLower}.edu.in`);
      guesses.push(`www.${acronym}${stateLower}.edu.in`);
    }
  }

  // first-word based
  if (firstWord && firstWord.length > 2) {
    guesses.push(`${firstWord}.edu.in`);
    guesses.push(`www.${firstWord}.edu.in`);
  }

  // Add https:// prefix
  return guesses.flatMap((domain) => {
    const withHttps = `https://${domain}`;
    return domain.startsWith("https") ? [domain] : [withHttps];
  });
}

/**
 * Fuzzy title matching
 */
function calculateTitleMatch(title: string, institutionName: string): number {
  const titleLower = title.toLowerCase();
  const nameLower = institutionName.toLowerCase();

  // Exact match
  if (titleLower === nameLower) return 1.0;

  // Contains check
  if (titleLower.includes(nameLower) || nameLower.includes(titleLower)) {
    return 0.85;
  }

  // Token overlap
  const titleTokens = new Set(titleLower.split(/\s+/));
  const nameTokens = new Set(nameLower.split(/\s+/));

  let overlap = 0;
  for (const token of nameTokens) {
    if (titleTokens.has(token)) overlap++;
  }

  if (nameTokens.size === 0) return 0;
  const tokenMatch = overlap / nameTokens.size;

  return tokenMatch * 0.8; // Max 0.8 for token match
}

/**
 * Discover official website for institution
 */
export async function discoverWebsite(
  institutionName: string,
  state?: string,
  opts?: {
    timeout?: number;
    maxHeadRequests?: number;
    searchFallback?: boolean;
  }
): Promise<SearchResult | undefined> {
  const startTime = Date.now();
  const timeout = opts?.timeout || WEBSITE_BUDGET_MS;
  const maxHeadRequests = opts?.maxHeadRequests || 8;
  const searchFallback = opts?.searchFallback !== false;

  try {
    const httpClient = getHttpClient();
    const guesses = generateDomainGuesses(institutionName, state);

    // Stage 1: HEAD requests (concurrency 4)
    const headCandidates: string[] = [];
    const concurrency = 4;

    for (let i = 0; i < Math.min(guesses.length, maxHeadRequests); i += concurrency) {
      if (Date.now() - startTime > timeout) break;

      const batch = guesses.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((url) =>
          Promise.race([
            httpClient.fetch(url),
            new Promise((_) => setTimeout(() => _, 2000)),
          ])
        )
      );

      // Collect successful HEAD responses
      for (let j = 0; j < results.length; j++) {
        const res = results[j]!;
        if (res.status === "fulfilled") {
          const result = res.value as any;
          if (result && result.status === 200) {
            headCandidates.push(batch[j]!);
          }
        }
      }
    }

    // Stage 2: Validate titles of survivors
    for (const url of headCandidates) {
      if (Date.now() - startTime > timeout) break;

      try {
        const result = await httpClient.fetch(url);
        const html = result.body.toString("utf-8");

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (!titleMatch || !titleMatch[1]) continue;

        const title = titleMatch[1]!.trim();
        const matchScore = calculateTitleMatch(title, institutionName);

        if (matchScore >= TITLE_MATCH_THRESHOLD) {
          return {
            title,
            url,
            domain: new URL(url).hostname,
            description: `Discovered via domain guess (match: ${(matchScore * 100).toFixed(1)}%)`,
          };
        }
      } catch {
        continue;
      }
    }

    // Stage 3: Fallback to search if no domain guess worked
    if (searchFallback && Date.now() - startTime < timeout) {
      const timeRemaining = timeout - (Date.now() - startTime);
      const searchFactory = getSearchFactory();

      const searchResults = await searchFactory.search(
        `"${institutionName}" official website`,
        {
          reason: "no-official-site",
        }
      );

      if (searchResults.results.length > 0) {
        return searchResults.results[0];
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cache for discovered websites
 */
const websiteCache = new Map<string, WebsiteCacheEntry>();

/**
 * Get cached website or discover new
 */
export async function getOfficialWebsite(
  institutionId: string,
  institutionName: string,
  state?: string
): Promise<{ url: string; titleMatch: number } | undefined> {
  const cacheKey = `${institutionId}:${institutionName}`;

  // Check cache
  const cached = websiteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEBSITE_CACHE_TTL) {
    return {
      url: cached.url,
      titleMatch: cached.titleMatch,
    };
  }

  // Discover
  const discovered = await discoverWebsite(institutionName, state, {
    timeout: WEBSITE_BUDGET_MS,
  });

  if (discovered) {
    const titleMatch = calculateTitleMatch(discovered.title, institutionName);
    websiteCache.set(cacheKey, {
      url: discovered.url,
      titleMatch,
      timestamp: Date.now(),
    });

    return {
      url: discovered.url,
      titleMatch,
    };
  }

  return undefined;
}

/**
 * Clear website cache
 */
export function clearWebsiteCache(): void {
  websiteCache.clear();
}
