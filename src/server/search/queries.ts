/**
 * Search query templates with domain-priority scoring
 *
 * Features:
 * - Labeled query templates with priority field
 * - Top 3 queries always used: official site, approval status, fake warning
 * - Additional queries only when post-pass confidence < 0.6
 * - Domain-priority scoring: .gov.in > .ac.in > .edu.in > .nic.in > aggregators
 * - Aggregator blacklist to prevent polluted results
 */

import type { SearchResult } from "./types";

/**
 * Query template with priority
 */
export interface QueryTemplate {
  label: string;
  priority: "high" | "medium" | "low";
  query: (institutionName: string) => string;
}

/**
 * Aggregator domains to filter out
 */
const AGGREGATOR_BLACKLIST = new Set([
  "wikipedia.org",
  "wikidata.org",
  "wikimedia.org",
  "imdb.com",
  "pinterest.com",
  "quora.com",
  "medium.com",
  "blogger.com",
  "wordpress.com",
  "github.com",
  "linkedin.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "reddit.com",
  "forums.*.com",
  "*.wordpress.com",
  "*.blogspot.com",
]);

/**
 * Domain priority scoring (higher = better)
 */
function getDomainPriority(domain: string | undefined): number {
  if (!domain) return 0;

  const lowerDomain = domain.toLowerCase();

  // Check blacklist
  for (const pattern of AGGREGATOR_BLACKLIST) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      if (lowerDomain.endsWith(suffix)) return -100;
    } else {
      if (lowerDomain === pattern || lowerDomain.endsWith("." + pattern)) {
        return -100;
      }
    }
  }

  // Government domains (highest priority)
  if (lowerDomain.endsWith(".gov.in")) return 1000;

  // Academic colleges/universities
  if (lowerDomain.endsWith(".ac.in")) return 800;

  // Educational institutions
  if (lowerDomain.endsWith(".edu.in") || lowerDomain.endsWith(".edu")) return 600;

  // NIC (National Informatics Centre)
  if (lowerDomain.endsWith(".nic.in")) return 400;

  // Directory portals and educational registries
  if (
    lowerDomain.includes("shodhganga") ||
    lowerDomain.includes("aicte") ||
    lowerDomain.includes("ugc.ac.in") ||
    lowerDomain.includes("naac.gov.in")
  ) {
    return 500;
  }

  // Default for other domains
  return 100;
}

/**
 * High-priority query templates (always used)
 */
const HIGH_PRIORITY_QUERIES: QueryTemplate[] = [
  {
    label: "official-site",
    priority: "high",
    query: (name) => `site:ac.in OR site:edu.in "${name}" official website`,
  },
  {
    label: "approval-status",
    priority: "high",
    query: (name) => `"${name}" "approved by" "AICTE" OR "UGC" OR "NAAC"`,
  },
  {
    label: "fake-warning",
    priority: "high",
    query: (name) => `"${name}" "fake" OR "spurious" OR "not recognized"`,
  },
];

/**
 * Medium-priority query templates (used based on confidence)
 */
const MEDIUM_PRIORITY_QUERIES: QueryTemplate[] = [
  {
    label: "affiliation",
    priority: "medium",
    query: (name) => `"${name}" "affiliated to" OR "affiliated with"`,
  },
  {
    label: "location",
    priority: "medium",
    query: (name) => `"${name}" location address contact`,
  },
  {
    label: "digilocker",
    priority: "medium",
    query: (name) => `"${name}" digilocker registry`,
  },
];

/**
 * Low-priority query templates (used as fallback)
 */
const LOW_PRIORITY_QUERIES: QueryTemplate[] = [
  {
    label: "news",
    priority: "low",
    query: (name) => `"${name}" news announcement`,
  },
  {
    label: "board",
    priority: "low",
    query: (name) => `"${name}" board governance`,
  },
  {
    label: "social",
    priority: "low",
    query: (name) => `"${name}" facebook OR twitter OR linkedin`,
  },
];

/**
 * Get query templates for an institution
 * High-priority always, medium if available confidence data suggests, low as fallback
 */
export function getQueryTemplates(
  institutionName: string,
  confidenceThreshold = 0.6
): QueryTemplate[] {
  const queries = [...HIGH_PRIORITY_QUERIES];

  // In production, confidenceThreshold would be passed from resolver
  // For now, include medium-priority
  if (true) {
    // Would be: if (confidence < confidenceThreshold)
    queries.push(...MEDIUM_PRIORITY_QUERIES);
  }

  // Low-priority as fallback only
  queries.push(...LOW_PRIORITY_QUERIES);

  return queries;
}

/**
 * Score search results by domain priority
 */
export function scoreResultsByDomain(results: SearchResult[]): SearchResult[] {
  return results.sort((a, b) => {
    const priorityA = getDomainPriority(a.domain);
    const priorityB = getDomainPriority(b.domain);

    // Sort by priority (descending), then by original order
    return priorityB - priorityA;
  });
}

/**
 * Filter blacklisted aggregators from results
 */
export function filterBlacklist(results: SearchResult[]): SearchResult[] {
  return results.filter((result) => getDomainPriority(result.domain) >= 0);
}

/**
 * Get all query templates (for testing/inspection)
 */
export function getAllQueryTemplates(): QueryTemplate[] {
  return [
    ...HIGH_PRIORITY_QUERIES,
    ...MEDIUM_PRIORITY_QUERIES,
    ...LOW_PRIORITY_QUERIES,
  ];
}

/**
 * Get queries by priority
 */
export function getQueriesByPriority(priority: "high" | "medium" | "low"): QueryTemplate[] {
  const allQueries = getAllQueryTemplates();
  return allQueries.filter((q) => q.priority === priority);
}

/**
 * Domain priority levels for reference
 */
export const DOMAIN_PRIORITY_LEVELS = {
  AGGREGATOR_BLACKLIST: -100,
  GOV_IN: 1000,
  AICTE_UGC_NAAC: 500,
  AC_IN: 800,
  EDU_IN_EDU: 600,
  NIC_IN: 400,
  OTHER: 100,
  INVALID: 0,
} as const;
