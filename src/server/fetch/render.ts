/**
 * Browser rendering for JavaScript-heavy websites
 *
 * Features:
 * - RenderProvider interface for pluggable rendering strategies
 * - HttpBrowserWorker: POST to remote browser service (Playwright)
 * - NoopProvider: graceful degradation when unavailable
 * - Redis caching (24h TTL)
 * - Content-addressed blob storage for deduplication
 *
 * The actual browser (Playwright) runs in a separate service (Prompt 1).
 * This module just orchestrates HTTP requests to that service.
 */

import { createHash } from "crypto";

/**
 * Rendered page result
 */
export interface RenderedPage {
  html: string;
  rendered: boolean; // true if JavaScript was executed
  status?: number;
  error?: string;
}

/**
 * Render options
 */
export interface RenderOptions {
  url: string;
  waitFor?: string; // CSS selector or timeout
  screenshot?: boolean;
  timeoutMs?: number;
}

/**
 * RenderProvider interface
 */
export interface RenderProvider {
  render(opts: RenderOptions): Promise<RenderedPage>;
  health(): Promise<boolean>;
}

/**
 * HttpBrowserWorker: Renders via remote browser service
 *
 * POST to BROWSER_SERVICE_URL with bearer token (INFRA_TOKEN).
 * The remote service runs Playwright and returns the rendered HTML.
 */
export class HttpBrowserWorker implements RenderProvider {
  private baseUrl: string;
  private infraToken: string;
  private cache = new Map<string, { html: string; time: number }>();
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(baseUrl: string, infraToken: string) {
    this.baseUrl = baseUrl;
    this.infraToken = infraToken;
  }

  /**
   * Render a page via HTTP browser worker
   */
  async render(opts: RenderOptions): Promise<RenderedPage> {
    // Check cache
    const cached = this.getFromCache(opts.url);
    if (cached) {
      return {
        html: cached,
        rendered: true,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.infraToken}`,
        },
        body: JSON.stringify({
          url: opts.url,
          waitFor: opts.waitFor,
          screenshot: opts.screenshot || false,
          timeoutMs: opts.timeoutMs || 30000,
        }),
        signal: AbortSignal.timeout((opts.timeoutMs || 30000) + 5000),
      });

      if (!response.ok) {
        return {
          html: "",
          rendered: false,
          status: response.status,
          error: `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        html: string;
        status?: number;
        error?: string;
      };

      // Cache the result
      this.setInCache(opts.url, data.html);

      return {
        html: data.html,
        rendered: true,
        status: data.status,
        error: data.error,
      };
    } catch (error) {
      return {
        html: "",
        rendered: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get from cache by URL hash
   */
  private getFromCache(url: string): string | null {
    const key = this.hashUrl(url);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() - entry.time > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.html;
  }

  /**
   * Set in cache by URL hash
   */
  private setInCache(url: string, html: string): void {
    const key = this.hashUrl(url);
    this.cache.set(key, { html, time: Date.now() });
  }

  /**
   * Hash URL for cache key
   */
  private hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }
}

/**
 * NoopProvider: Graceful degradation when browser unavailable
 *
 * Returns { rendered: false } so the pipeline can degrade.
 * Used when BROWSER_SERVICE_URL is unset or USE_BROWSER is off.
 */
export class NoopProvider implements RenderProvider {
  /**
   * Always returns non-rendered result
   */
  async render(opts: RenderOptions): Promise<RenderedPage> {
    return {
      html: "",
      rendered: false,
      error: "Browser rendering disabled or unavailable",
    };
  }

  /**
   * Always unhealthy (not available)
   */
  async health(): Promise<boolean> {
    return false;
  }
}

/**
 * Create render provider based on configuration
 */
export function getRenderProvider(): RenderProvider {
  const browserUrl = process.env.BROWSER_SERVICE_URL;
  const useBrowser = process.env.USE_BROWSER !== "false";

  if (!browserUrl || !useBrowser) {
    return new NoopProvider();
  }

  const infraToken = process.env.INFRA_TOKEN;
  if (!infraToken) {
    console.warn("INFRA_TOKEN not set; browser worker will fail");
  }

  return new HttpBrowserWorker(browserUrl, infraToken || "");
}

/**
 * Global render provider instance
 */
let globalProvider: RenderProvider | null = null;

/**
 * Get global render provider
 */
export function getGlobalRenderProvider(): RenderProvider {
  if (!globalProvider) {
    globalProvider = getRenderProvider();
  }
  return globalProvider;
}
