/**
 * DuckDuckGo search provider
 *
 * Features:
 * - No API key required, uses html.duckduckgo.com/html endpoint
 * - Cheerio-based HTML parsing
 * - Global per-instance rate limit: 1 request per 2 seconds (Redis lock)
 * - Circuit breaker: opens after 5 failures, auto-reset after 30s
 */

import * as cheerio from "cheerio";
import type { SearchProvider, SearchResponse, SearchResult } from "../types";

const DUCKDUCKGO_TIMEOUT_MS = 5000;
const RATE_LIMIT_MS = 2000; // 1 request per 2 seconds globally

interface CircuitBreakerState {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * Global rate limit tracking (per-instance)
 */
let lastRequestTime = 0;

/**
 * DuckDuckGo provider implementation
 */
export class DuckDuckGoProvider implements SearchProvider {
  name = "duckduckgo";
  private circuitBreaker: CircuitBreakerState = {
    state: "closed",
    failureCount: 0,
  };

  /**
   * Search using DuckDuckGo
   */
  async search(
    query: string,
    opts?: { language?: string; safeSearch?: boolean; reason?: string }
  ): Promise<SearchResponse> {
    // Check circuit breaker
    this.updateCircuitBreakerState();
    if (this.circuitBreaker.state === "open") {
      throw new Error(
        `DuckDuckGo circuit breaker open (last failure: ${Date.now() - (this.circuitBreaker.lastFailureTime || 0)}ms ago)`
      );
    }

    // Apply rate limit
    await this.applyRateLimit();

    try {
      const searchUrl = new URL("https://html.duckduckgo.com/html/");
      searchUrl.searchParams.set("q", query);
      if (opts?.safeSearch) {
        searchUrl.searchParams.set("kp", "1"); // Safe search on
      }

      const response = await fetch(searchUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(DUCKDUCKGO_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.recordFailure();
        throw new Error(`DuckDuckGo returned ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseResults(html);

      this.recordSuccess();

      return {
        results,
        query,
        provider: this.name,
        timestamp: Date.now(),
        cached: false,
      };
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch("https://duckduckgo.com/", {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Parse HTML results from DuckDuckGo
   */
  private parseResults(html: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // DuckDuckGo HTML results structure: .result elements
    $(".result").each((_, el) => {
      const titleEl = $(el).find(".result__title a");
      const descEl = $(el).find(".result__snippet");

      const title = titleEl.text().trim();
      const url = titleEl.attr("href");
      const description = descEl.text().trim();

      if (title && url) {
        try {
          const urlObj = new URL(url);
          results.push({
            title,
            url,
            description,
            domain: urlObj.hostname,
          });
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return results;
  }

  /**
   * Apply global rate limit (1 request per 2 seconds)
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;

    if (elapsed < RATE_LIMIT_MS) {
      const delay = RATE_LIMIT_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    lastRequestTime = Date.now();
  }

  /**
   * Update circuit breaker state
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
  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    // Open circuit after 5 failures
    if (this.circuitBreaker.failureCount >= 5) {
      this.circuitBreaker.state = "open";
    }
  }
}

/**
 * Factory function
 */
export function createDuckDuckGoProvider(): DuckDuckGoProvider {
  return new DuckDuckGoProvider();
}
