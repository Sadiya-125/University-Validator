/**
 * SearXNG search provider
 *
 * Features:
 * - Bearer token authentication via INFRA_TOKEN
 * - 8s timeout (deliberately slow for SearXNG aggregation)
 * - Detects "silent empty" (200 OK + zero results + unresponsive_engines) as failure
 * - Circuit breaker: opens after 5 failures, auto-reset after 30s
 * - Health check via /stats endpoint
 * - Never caches silent empties (characteristic failure mode)
 */

import type { SearchProvider, SearchResponse, SearchResult } from "../types";

const SEARXNG_TIMEOUT_MS = 8000; // Deliberately slow
const SILENT_EMPTY_PENALTY = 0.5; // Count as 0.5 failures for circuit breaker

interface SearXNGResult {
  title: string;
  url: string;
  content?: string;
}

interface SearXNGResponse {
  results: SearXNGResult[];
  unresponsive_engines?: string[];
  number_of_results?: number;
}

interface CircuitBreakerState {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * SearXNG provider implementation
 */
export class SearXNGProvider implements SearchProvider {
  name = "searxng";
  private circuitBreaker: CircuitBreakerState = {
    state: "closed",
    failureCount: 0,
  };

  constructor(private baseUrl: string, private token: string) {
    if (!baseUrl) {
      throw new Error("SEARXNG_URL is required");
    }
  }

  /**
   * Search using SearXNG
   */
  async search(
    query: string,
    opts?: { language?: string; safeSearch?: boolean; reason?: string }
  ): Promise<SearchResponse> {
    // Check circuit breaker
    this.updateCircuitBreakerState();
    if (this.circuitBreaker.state === "open") {
      throw new Error(
        `SearXNG circuit breaker open (last failure: ${Date.now() - (this.circuitBreaker.lastFailureTime || 0)}ms ago)`
      );
    }

    try {
      const searchUrl = new URL("/search", this.baseUrl);
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("language", opts?.language || "en");
      searchUrl.searchParams.set("safesearch", opts?.safeSearch ? "1" : "0");

      const response = await fetch(searchUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "User-Agent":
            "UniversityValidator/1.0 (+https://github.com/anthropics/university-validator)",
        },
        signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.recordFailure();
        throw new Error(`SearXNG returned ${response.status}`);
      }

      const data: SearXNGResponse = await response.json();

      // CRITICAL: Detect silent empty (200 OK + zero results + unresponsive_engines)
      if (
        (!data.results || data.results.length === 0) &&
        data.unresponsive_engines &&
        data.unresponsive_engines.length > 0
      ) {
        // This is a characteristic failure mode - don't cache it
        this.recordFailure(SILENT_EMPTY_PENALTY);
        throw new Error(
          `SearXNG silent empty: ${data.unresponsive_engines.length} unresponsive engines`
        );
      }

      // Valid result (even if empty due to no matches, not due to engine issues)
      const results: SearchResult[] = (data.results || []).map((r) => {
        try {
          const url = new URL(r.url);
          return {
            title: r.title || url.hostname || r.url,
            url: r.url,
            description: r.content,
            domain: url.hostname,
          };
        } catch {
          return {
            title: r.title || r.url,
            url: r.url,
            description: r.content,
          };
        }
      });

      this.recordSuccess();

      return {
        results,
        query,
        provider: this.name,
        timestamp: Date.now(),
        cached: false,
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("silent empty")) {
        this.recordFailure();
      }
      throw error;
    }
  }

  /**
   * Health check via /stats endpoint
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(new URL("/stats", this.baseUrl).toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "User-Agent":
            "UniversityValidator/1.0 (+https://github.com/anthropics/university-validator)",
        },
        signal: AbortSignal.timeout(3000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker state
   */
  private updateCircuitBreakerState(): void {
    // Auto-reset half-open after 30 seconds
    if (
      this.circuitBreaker.state === "open" &&
      this.circuitBreaker.lastFailureTime &&
      Date.now() - this.circuitBreaker.lastFailureTime > 30000
    ) {
      this.circuitBreaker.state = "half_open";
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess(): void {
    this.circuitBreaker.state = "closed";
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastSuccessTime = Date.now();
  }

  /**
   * Record a failed request
   */
  private recordFailure(weight = 1): void {
    this.circuitBreaker.failureCount += weight;
    this.circuitBreaker.lastFailureTime = Date.now();

    // Open circuit after 5 failures (or equivalent weight)
    if (this.circuitBreaker.failureCount >= 5) {
      this.circuitBreaker.state = "open";
    }
  }
}

/**
 * Factory function
 */
export function createSearXNGProvider(
  baseUrl?: string,
  token?: string
): SearXNGProvider {
  const url = baseUrl || process.env.SEARXNG_URL;
  const t = token || process.env.INFRA_TOKEN;

  if (!url || !t) {
    throw new Error("SEARXNG_URL and INFRA_TOKEN are required");
  }

  return new SearXNGProvider(url, t);
}
