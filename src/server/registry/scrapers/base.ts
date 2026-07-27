/**
 * Base scraper class and utilities for statutory body web scrapers.
 *
 * Provides:
 * - HTTP session with retry logic and rate limiting
 * - Playwright integration for JavaScript-rendered pages
 * - HTML parsing with Cheerio
 * - Logging and error handling
 * - Circuit breaker pattern
 */

import { getLogger } from "@/server/observability/logger";
import { Readable } from "stream";

const logger = getLogger();

/**
 * Result of a scraping operation.
 * Represents a normalized entry from an authority's registry.
 */
export interface ScrapingResult {
  institution_name: string;
  statutory_body: string;
  source_url: string;
  categorisation?: "Genuine" | "Fake" | "Unknown";
  details?: string;
  error?: string;
  website?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  affiliated_university?: string;
  address?: string;
  screenshot_base64?: string;
}

/**
 * Fetch context passed to scraper's fetch() method.
 */
export interface FetchContext {
  signal?: AbortSignal;
  logger?: {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, err?: Error, meta?: Record<string, unknown>): void;
  };
}

/**
 * Base scraper class with HTTP session, retry logic, and Playwright support.
 */
export class BaseScraper {
  public timeout = 30000; // 30 seconds
  public retries = 3;
  public rateLimitDelay = 500; // ms between requests
  public lastRequestTime = 0;

  /**
   * Get a Playwright page with proper setup.
   * Handles async/sync context properly on Windows.
   */
  public async getPlaywrightPage() {
    try {
      const { chromium } = await import("playwright");

      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-gpu", "--ignore-certificate-errors"],
      });

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
      });

      const page = await context.newPage();

      return { page, browser, context };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to launch Playwright: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Respect rate limiting between requests.
   */
  public async rateLimit() {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.rateLimitDelay) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.rateLimitDelay - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch URL with automatic retry on failure.
   */
  public async fetchWithRetry(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    await this.rateLimit();

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt < this.retries) {
            const delay = Math.pow(2, attempt) * 1000;
            logger.warn(
              `Rate limited or server error (${response.status}), retrying in ${delay}ms`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        if (attempt === this.retries) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000;
        logger.debug(
          `Fetch attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("All retry attempts failed");
  }

  /**
   * Normalize a name for matching.
   */
  public normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "");
  }

  /**
   * Sleep for specified milliseconds.
   */
  public async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
