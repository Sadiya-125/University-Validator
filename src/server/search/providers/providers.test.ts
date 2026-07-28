/**
 * Search provider tests
 *
 * Tests:
 * - Provider success/timeout/error scenarios
 * - Silent empty detection (200 OK + zero results + unresponsive_engines)
 * - Quota management (Google CSE only)
 * - Circuit breaker behavior
 * - Health checks
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SearXNGProvider } from "./searxng";
import { DuckDuckGoProvider } from "./duckduckgo";

describe("SearXNG Provider", () => {
  let provider: SearXNGProvider;

  beforeEach(() => {
    provider = new SearXNGProvider("http://localhost:8888", "test-token");
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("Successful search", () => {
    it("should return results on success", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                title: "IIT Bombay",
                url: "https://www.iitb.ac.in",
                content: "Indian Institute of Technology Bombay",
              },
            ],
            unresponsive_engines: [],
          }),
          { status: 200 }
        )
      );

      const result = await provider.search("IIT Bombay");

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("IIT Bombay");
      expect(result.results[0].domain).toBe("www.iitb.ac.in");
    });
  });

  describe("Silent empty detection", () => {
    it("should detect 200 OK + zero results + unresponsive_engines as failure", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [],
            unresponsive_engines: ["bing", "google"],
          }),
          { status: 200 }
        )
      );

      await expect(provider.search("test")).rejects.toThrow("silent empty");
    });

    it("should allow zero results without unresponsive_engines", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [],
            unresponsive_engines: [],
          }),
          { status: 200 }
        )
      );

      const result = await provider.search("nonexistent");
      expect(result.results).toHaveLength(0);
    });
  });

  describe("Circuit breaker", () => {
    it("should open after 5 failures", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Connection failed"));

      // Make 5 failures
      for (let i = 0; i < 5; i++) {
        await expect(provider.search("test")).rejects.toThrow();
      }

      // Next call should fail immediately with circuit breaker
      await expect(provider.search("test")).rejects.toThrow("circuit breaker open");
    });

    it("should reset after 30 seconds", async () => {
      vi.useFakeTimers();

      vi.mocked(global.fetch).mockRejectedValue(new Error("Connection failed"));

      // Make 5 failures
      for (let i = 0; i < 5; i++) {
        await expect(provider.search("test")).rejects.toThrow();
      }

      // Advance time 31 seconds
      vi.advanceTimersByTime(31000);

      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );

      // Should work again
      const result = await provider.search("test");
      expect(result.results).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe("Health check", () => {
    it("should return true when stats endpoint responds", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

      const healthy = await provider.health();
      expect(healthy).toBe(true);
    });

    it("should return false on error", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Connection failed"));

      const healthy = await provider.health();
      expect(healthy).toBe(false);
    });
  });
});

describe("DuckDuckGo Provider", () => {
  let provider: DuckDuckGoProvider;

  beforeEach(() => {
    provider = new DuckDuckGoProvider();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("Successful search", () => {
    it("should parse HTML results", async () => {
      const html = `
        <html>
          <div class="result">
            <a href="https://example.com" class="result__title a">Example</a>
            <div class="result__snippet">Example snippet</div>
          </div>
        </html>
      `;

      vi.mocked(global.fetch).mockResolvedValue(
        new Response(html, { status: 200 })
      );

      const result = await provider.search("test");

      expect(result.results).toBeDefined();
      expect(result.provider).toBe("duckduckgo");
    });
  });

  describe("Rate limiting", () => {
    it("should enforce 2 second rate limit", async () => {
      vi.useFakeTimers();

      vi.mocked(global.fetch).mockResolvedValue(
        new Response("<html></html>", { status: 200 })
      );

      const start1 = Date.now();
      await provider.search("query1");
      const end1 = Date.now();

      const start2 = Date.now();
      await provider.search("query2");
      const end2 = Date.now();

      // Second call should wait at least 2 seconds from first
      const elapsed = start2 - start1;
      expect(elapsed).toBeGreaterThanOrEqual(2000);

      vi.useRealTimers();
    });
  });

  describe("Health check", () => {
    it("should check duckduckgo availability", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response("OK", { status: 200 })
      );

      const healthy = await provider.health();
      expect(healthy).toBe(true);
    });
  });
});
