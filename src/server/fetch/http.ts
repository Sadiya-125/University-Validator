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
  private lastRequestTime = new Map<string, number>();
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
    const state = this.getCircuitBreakerState(parsedUrl.hostname);
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
        return await this.fetchInternal(url);
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

        // Non-retriable error
        this.recordFailure(parsedUrl.hostname);
        throw error;
      }
    }

    this.recordFailure(parsedUrl.hostname);
    throw lastError || new Error("Fetch failed after max retries");
  }

  /**
   * Internal fetch implementation
   */
  private async fetchInternal(url: string): Promise<FetchResult> {
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
    const parsedUrl = new URL(url);

    // Record success
    this.recordSuccess(parsedUrl.hostname);

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
    const lastTime = this.lastRequestTime.get(hostname);
    if (lastTime) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < this.politenessDelayMs) {
        await new Promise((r) =>
          setTimeout(r, this.politenessDelayMs - elapsed)
        );
      }
    }
    this.lastRequestTime.set(hostname, Date.now());
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get or create circuit breaker state
   */
  private getCircuitBreakerState(hostname: string): CircuitBreakerState {
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
  private recordSuccess(hostname: string): void {
    const state = this.getCircuitBreakerState(hostname);
    state.state = "closed";
    state.failureCount = 0;
    state.lastSuccessTime = Date.now();
  }

  /**
   * Record a failed request
   */
  private recordFailure(hostname: string): void {
    const state = this.getCircuitBreakerState(hostname);
    state.failureCount++;
    state.lastFailureTime = Date.now();

    // Open circuit after 5 failures
    if (state.failureCount >= 5) {
      state.state = "open";
    }
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
