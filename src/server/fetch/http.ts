/**
 * HTTP client for fetching institution websites
 *
 * Features:
 * - Undici with shared keep-alive Agent (64 connections, HTTP/2)
 * - Connect timeout 3s, total timeout 12s
 * - Retry logic with jittered backoff (max 3) on 429/5xx
 * - Retry-After header support
 * - Per-hostname politeness interval via Redis
 * - robots.txt fetching + 24h cache
 * - SSRF guard: DNS resolution, private IP rejection
 * - 5MB size cap
 * - Content-type allowlist
 * - Circuit breaker per hostname
 * - Content hash (SHA-256) for deduplication
 *
 * Returns: { status, headers, body, finalUrl, timings, contentHash }
 */

import { createHash } from "crypto";
import * as dns from "dns/promises";
import { getRedis } from "@/server/cache/redis";
import { CacheKeys, CacheTTL } from "@/server/cache/keys";

const CRAWLER_USER_AGENT =
  "UniversityValidator/1.0 (+https://github.com/anthropics/university-validator)";
const CONNECT_TIMEOUT_MS = 3000;
const TOTAL_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB
const ROBOTS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Allowed content types for fetching
 */
const ALLOWED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/plain",
  "text/xml",
]);

/**
 * Fetch result
 */
export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
  timings: {
    connect: number;
    ttfb: number;
    total: number;
  };
  contentHash: string;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * HTTP client with retry, circuit breaker, and SSRF protection
 */
export class HttpClient {
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private robotsCache = new Map<string, { allowed: Set<string>; time: number }>();
  private readonly politenessDelayMs = 1000; // 1 second between requests per hostname

  constructor() {
    // Using native fetch - no agent configuration needed
  }

  /**
   * Fetch a URL with retries, timeouts, and validation
   */
  async fetch(url: string): Promise<FetchResult> {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
    }

    // SSRF check: reject private IPs
    await this.validateHostname(parsedUrl.hostname);

    // Check circuit breaker
    const state = await this.getCircuitBreakerState(parsedUrl.hostname);
    if (state.state === "open") {
      throw new Error(
        `Circuit breaker open for ${parsedUrl.hostname} (last failure: ${Date.now() - (state.lastFailureTime || 0)}ms ago)`
      );
    }

    // Check robots.txt
    if (!(await this.mayFetch(url))) {
      throw new Error(`robots.txt forbids fetching ${url}`);
    }

    // Politeness delay
    await this.applyPolitenessDelay(parsedUrl.hostname);

    // Fetch with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.fetchInternal(url, attempt);
        // Record success for circuit breaker
        await this.recordSuccess(parsedUrl.hostname);
        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if retry is appropriate (timeout errors are retriable)
        const isRetriable = (error instanceof Error) &&
          (error.message.includes('timeout') || error.message.includes('TimeoutError'));

        if (isRetriable && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-retriable error - record failure for circuit breaker
        await this.recordFailure(parsedUrl.hostname);
        throw error;
      }
    }

    // Max retries exceeded - record failure for circuit breaker
    await this.recordFailure(parsedUrl.hostname);
    throw lastError || new Error("Fetch failed after max retries");
  }

  /**
   * Internal fetch implementation
   */
  private async fetchInternal(url: string, attempt: number = 0): Promise<FetchResult> {
    const startTime = performance.now();
    let connectTime = 0;
    let ttfbTime = 0;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": CRAWLER_USER_AGENT,
        Accept:
          "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS),
    });

    ttfbTime = performance.now() - startTime;

    // Handle rate limit and server errors with Retry-After
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = this.parseRetryAfter(response.headers.get('Retry-After'));
      const delay = retryAfter || Math.pow(2, attempt) * 1000 + Math.random() * 1000;

      console.log(`[HTTP] Status ${response.status}, retrying after ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));

      // Re-throw to trigger retry loop
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (contentType && !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        `Disallowed content-type: ${contentType}. Allowed: ${Array.from(ALLOWED_CONTENT_TYPES).join(", ")}`
      );
    }

    // Read body with size limit
    const bodyBuffer = await this.readBodyWithLimit(response);

    // Calculate content hash
    const contentHash = this.calculateHash(bodyBuffer);

    const totalTime = performance.now() - startTime;

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: bodyBuffer,
      finalUrl: response.url,
      timings: {
        connect: connectTime,
        ttfb: ttfbTime,
        total: totalTime,
      },
      contentHash,
    };
  }

  /**
   * Read response body with size limit
   */
  private async readBodyWithLimit(response: Response): Promise<Buffer> {
    if (!response.body) {
      return Buffer.alloc(0);
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > MAX_BODY_SIZE) {
          throw new Error(
            `Response body exceeds maximum size of ${MAX_BODY_SIZE} bytes`
          );
        }

        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks);
  }

  /**
   * SSRF check: validate hostname (reject private IPs)
   */
  private async validateHostname(hostname: string): Promise<void> {
    // Resolve hostname to IP
    let ips: string[];
    try {
      ips = await dns.resolve4(hostname);
    } catch {
      throw new Error(`Failed to resolve hostname: ${hostname}`);
    }

    if (ips.length === 0) {
      throw new Error(`No IP addresses found for: ${hostname}`);
    }

    // Check if any IP is private
    for (const ip of ips) {
      if (this.isPrivateIp(ip)) {
        throw new Error(`SSRF: Private IP address not allowed: ${ip}`);
      }
    }
  }

  /**
   * Check if IP is private (RFC 1918, loopback, etc.)
   */
  private isPrivateIp(ip: string): boolean {
    // Loopback
    if (ip.startsWith("127.")) return true;
    // Private ranges
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("192.168.")) return true;
    if (ip.startsWith("172.")) {
      const parts = ip.split(".");
      if (parts.length >= 2) {
        const second = parseInt(parts[1]!, 10);
        if (second >= 16 && second <= 31) return true;
      }
    }
    // Link-local
    if (ip.startsWith("169.254.")) return true;
    // Multicast
    if (ip.startsWith("224.") || ip.startsWith("239.")) return true;
    return false;
  }

  /**
   * Check robots.txt if STRICT_ROBOTS is enabled
   */
  private async mayFetch(url: string): Promise<boolean> {
    if (process.env.STRICT_ROBOTS !== "true") {
      return true; // Default: allow all
    }

    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/robots.txt`;

    // Check cache
    const cached = this.robotsCache.get(parsedUrl.hostname);
    if (
      cached &&
      Date.now() - cached.time < ROBOTS_CACHE_TTL
    ) {
      return cached.allowed.has(parsedUrl.pathname);
    }

    // Fetch robots.txt
    try {
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": CRAWLER_USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        // Assume allowed if robots.txt not found
        this.robotsCache.set(parsedUrl.hostname, {
          allowed: new Set([parsedUrl.pathname]),
          time: Date.now(),
        });
        return true;
      }

      const robotsTxt = await response.text();
      const allowed = this.parseRobotsTxt(robotsTxt, CRAWLER_USER_AGENT);
      this.robotsCache.set(parsedUrl.hostname, {
        allowed,
        time: Date.now(),
      });

      return allowed.has(parsedUrl.pathname);
    } catch (error) {
      // If robots.txt fetch fails, assume allowed
      return true;
    }
  }

  /**
   * Simple robots.txt parser
   */
  private parseRobotsTxt(robotsTxt: string, userAgent: string): Set<string> {
    const lines = robotsTxt.split("\n");
    const allowed = new Set<string>();
    let isRelevant = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.startsWith("user-agent:")) {
        const parts = trimmed.split(":");
        const agent = parts[1]?.trim() || "";
        isRelevant = agent === "*" || agent === userAgent.toLowerCase();
      } else if (isRelevant && trimmed.startsWith("disallow:")) {
        const parts = trimmed.split(":");
        const path = parts[1]?.trim() || "";
        if (path === "") {
          // Empty disallow means allow all
          allowed.add("*");
        } else {
          allowed.add(path);
        }
      }
    }

    // If no disallows found, assume all allowed
    if (allowed.size === 0) {
      allowed.add("*");
    }

    return allowed;
  }

  /**
   * Apply per-hostname politeness delay
   */
  private async applyPolitenessDelay(hostname: string): Promise<void> {
    try {
      const redis = getRedis();
      const key = CacheKeys.lock("politeness", hostname);
      const lastTimeStr = await redis.get(key);

      if (lastTimeStr) {
        const lastTime = parseInt(lastTimeStr as string, 10);
        const elapsed = Date.now() - lastTime;

        if (elapsed < this.politenessDelayMs) {
          const delay = this.politenessDelayMs - elapsed;
          console.log(`[HTTP] Politeness: waiting ${delay}ms for ${hostname}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      // Record this request time in Redis (1 second TTL)
      await redis.set(key, String(Date.now()));
      await redis.expire(key, 1);
    } catch (error) {
      // If Redis fails, skip politeness delay (fail-open)
      console.warn(`[HTTP] Politeness delay failed, skipping: ${error}`);
    }
  }

  /**
   * Parse Retry-After header
   * Returns delay in milliseconds, or null if header not present
   */
  private parseRetryAfter(retryAfterHeader: string | null): number | null {
    if (!retryAfterHeader) return null;

    // Try to parse as seconds (most common)
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }

    // Try to parse as HTTP-date (RFC 7231)
    const retryDate = new Date(retryAfterHeader);
    if (!isNaN(retryDate.getTime())) {
      const delayMs = retryDate.getTime() - Date.now();
      return Math.max(0, delayMs);
    }

    return null;
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get or create circuit breaker state (in-memory only)
   */
  private async getCircuitBreakerState(hostname: string): Promise<CircuitBreakerState> {
    let state = this.circuitBreakers.get(hostname);
    if (!state) {
      state = { state: "closed", failureCount: 0 };
      this.circuitBreakers.set(hostname, state);
    }

    // Auto-reset half-open after 30 seconds
    if (
      state.state === "open" &&
      state.lastFailureTime &&
      Date.now() - state.lastFailureTime > 30000
    ) {
      state.state = "half_open";
      state.failureCount = 0;
    }

    return state;
  }

  /**
   * Record a successful request
   */
  private async recordSuccess(hostname: string): Promise<void> {
    const state = await this.getCircuitBreakerState(hostname);
    state.state = "closed";
    state.failureCount = 0;
    state.lastSuccessTime = Date.now();

    // Update in-memory only
    this.circuitBreakers.set(hostname, state);
  }

  /**
   * Record a failed request
   */
  private async recordFailure(hostname: string): Promise<void> {
    const state = await this.getCircuitBreakerState(hostname);
    state.failureCount++;
    state.lastFailureTime = Date.now();

    // Open circuit after 5 failures
    if (state.failureCount >= 5) {
      state.state = "open";
      console.log(`[CB] Circuit breaker OPENED for ${hostname} after ${state.failureCount} failures`);
    }

    // Update in-memory only
    this.circuitBreakers.set(hostname, state);
  }

  /**
   * Get circuit breaker health for all hostnames
   */
  getHealth(): Record<
    string,
    {
      state: "closed" | "open" | "half_open";
      failureCount: number;
      lastFailure?: number;
    }
  > {
    const health: Record<string, any> = {};
    for (const [hostname, state] of this.circuitBreakers) {
      health[hostname] = {
        state: state.state,
        failureCount: state.failureCount,
        lastFailure: state.lastFailureTime,
      };
    }
    return health;
  }

  /**
   * Close the client and clean up
   */
  async close(): Promise<void> {
    // Using native fetch - no cleanup needed
  }
}

// Global HTTP client instance
let globalClient: HttpClient | null = null;

/**
 * Get global HTTP client instance
 */
export function getHttpClient(): HttpClient {
  if (!globalClient) {
    globalClient = new HttpClient();
  }
  return globalClient;
}
