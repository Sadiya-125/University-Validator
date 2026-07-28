/**
 * Search provider interface and types
 *
 * Defines the abstract interface for search providers (SearXNG, DuckDuckGo).
 * Wikidata is NOT a SearchProvider (it's an IdentityResolver).
 *
 * This is the ONLY part of the codebase permitted to perform open web search.
 */

/**
 * Search result from a provider
 */
export interface SearchResult {
  title: string;
  url: string;
  description?: string;
  favicon?: string;
  domain?: string;
}

/**
 * Search response from a provider
 */
export interface SearchResponse {
  results: SearchResult[];
  query: string;
  provider: string;
  timestamp: number;
  cached?: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
  language?: string;
  safeSearch?: boolean;
  reason?: string; // e.g., "no-official-site" for conditional providers
}

/**
 * SearchProvider interface
 *
 * All providers must implement this interface.
 * Providers are stateful and should maintain their own health/circuit-breaker state.
 */
export interface SearchProvider {
  /**
   * Unique provider name (e.g., "searxng", "duckduckgo")
   */
  name: string;

  /**
   * Search for query and return results
   */
  search(query: string, opts?: SearchOptions): Promise<SearchResponse>;

  /**
   * Health check - returns true if provider is operational
   */
  health(): Promise<boolean>;

  /**
   * Optional: Report remaining quota for this provider
   */
  quotaRemaining?(): Promise<number | undefined>;
}

/**
 * Factory search result with metadata
 */
export interface FactorySearchResponse {
  results: SearchResult[];
  query: string;
  providersUsed: string[];
  cached: boolean;
  failovers: number;
  degraded: boolean;
  timestamp: number;
}

/**
 * Provider health information
 */
export interface ProviderHealth {
  name: string;
  healthy: boolean;
  failureCount?: number;
  lastFailure?: number;
  p50Ms?: number;
  p95Ms?: number;
  successRate24h?: number;
  unresponsiveEngines?: string[];
}
