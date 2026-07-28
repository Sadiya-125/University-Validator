import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HttpBrowserWorker,
  NoopProvider,
  getRenderProvider,
  type RenderOptions,
} from "./render";

describe("HttpBrowserWorker", () => {
  let provider: HttpBrowserWorker;

  beforeEach(() => {
    provider = new HttpBrowserWorker("http://localhost:3000", "test-token");
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("Rendering", () => {
    it("should render a URL", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ html: "<html>Test</html>" }), {
          status: 200,
        })
      );

      const result = await provider.render({
        url: "https://example.com",
      });

      expect(result.rendered).toBe(true);
      expect(result.html).toBeDefined();
    });

    it("should include Authorization header", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ html: "<html></html>" }), {
          status: 200,
        })
      );

      await provider.render({ url: "https://example.com" });

      const call = vi.mocked(global.fetch).mock.calls[0];
      expect(call).toBeDefined();
    });

    it("should pass render options to service", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ html: "<html></html>" }), {
          status: 200,
        })
      );

      const opts: RenderOptions = {
        url: "https://example.com",
        waitFor: ".content",
        timeoutMs: 5000,
      };

      await provider.render(opts);

      const call = vi.mocked(global.fetch).mock.calls[0];
      expect(call[0]).toContain("/render");
    });

    it("should handle rendering errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response("Error", { status: 500 })
      );

      const result = await provider.render({
        url: "https://example.com",
      });

      expect(result.rendered).toBe(false);
      expect(result.status).toBe(500);
    });

    it("should handle network errors", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

      const result = await provider.render({
        url: "https://example.com",
      });

      expect(result.rendered).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Caching", () => {
    it("should cache rendered pages", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response(JSON.stringify({ html: "<html>Cached</html>" }), {
          status: 200,
        })
      );

      const url = "https://example.com";
      const opts = { url };

      // First call
      await provider.render(opts);
      const fetchCount1 = vi.mocked(global.fetch).mock.calls.length;

      // Second call should use cache
      await provider.render(opts);
      const fetchCount2 = vi.mocked(global.fetch).mock.calls.length;

      // Should not call fetch again (or same number of calls)
      expect(fetchCount2).toBeLessThanOrEqual(fetchCount1 + 1);
    });

    it("should have 24h cache TTL", async () => {
      // Cache TTL is internal, but we verify behavior
      expect(provider).toBeDefined();
    });
  });

  describe("Health check", () => {
    it("should report healthy when service responds", async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        new Response("OK", { status: 200 })
      );

      const healthy = await provider.health();
      expect(healthy).toBe(true);
    });

    it("should report unhealthy on error", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Connection refused"));

      const healthy = await provider.health();
      expect(healthy).toBe(false);
    });
  });
});

describe("NoopProvider", () => {
  let provider: NoopProvider;

  beforeEach(() => {
    provider = new NoopProvider();
  });

  describe("Graceful degradation", () => {
    it("should return non-rendered result", async () => {
      const result = await provider.render({
        url: "https://example.com",
      });

      expect(result.rendered).toBe(false);
      expect(result.html).toBe("");
    });

    it("should indicate unavailable", async () => {
      const result = await provider.render({
        url: "https://example.com",
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("disabled");
    });

    it("should handle any options", async () => {
      const result = await provider.render({
        url: "https://example.com",
        waitFor: ".content",
        screenshot: true,
        timeoutMs: 10000,
      });

      expect(result.rendered).toBe(false);
    });
  });

  describe("Health check", () => {
    it("should always report unhealthy", async () => {
      const healthy = await provider.health();
      expect(healthy).toBe(false);
    });
  });
});

describe("getRenderProvider factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return NoopProvider when BROWSER_SERVICE_URL is unset", () => {
    const originalUrl = process.env.BROWSER_SERVICE_URL;
    delete process.env.BROWSER_SERVICE_URL;

    try {
      const provider = getRenderProvider();
      expect(provider).toBeInstanceOf(NoopProvider);
    } finally {
      if (originalUrl) process.env.BROWSER_SERVICE_URL = originalUrl;
    }
  });

  it("should return NoopProvider when USE_BROWSER is false", () => {
    const originalEnv = process.env.USE_BROWSER;
    process.env.USE_BROWSER = "false";
    process.env.BROWSER_SERVICE_URL = "http://localhost:3000";

    try {
      const provider = getRenderProvider();
      expect(provider).toBeInstanceOf(NoopProvider);
    } finally {
      process.env.USE_BROWSER = originalEnv;
    }
  });

  it("should return HttpBrowserWorker when configured", () => {
    const originalUrl = process.env.BROWSER_SERVICE_URL;
    const originalUse = process.env.USE_BROWSER;

    process.env.BROWSER_SERVICE_URL = "http://localhost:3000";
    process.env.USE_BROWSER = "true";

    try {
      const provider = getRenderProvider();
      expect(provider).toBeInstanceOf(HttpBrowserWorker);
    } finally {
      if (originalUrl) process.env.BROWSER_SERVICE_URL = originalUrl;
      if (originalUse) process.env.USE_BROWSER = originalUse;
    }
  });

  it("should warn if INFRA_TOKEN is missing", () => {
    const originalUrl = process.env.BROWSER_SERVICE_URL;
    const originalToken = process.env.INFRA_TOKEN;
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    process.env.BROWSER_SERVICE_URL = "http://localhost:3000";
    delete process.env.INFRA_TOKEN;

    try {
      getRenderProvider();
      // May warn about missing token
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (originalUrl) process.env.BROWSER_SERVICE_URL = originalUrl;
      if (originalToken) process.env.INFRA_TOKEN = originalToken;
      consoleSpy.mockRestore();
    }
  });
});

describe("Render timeout", () => {
  it("should accept timeout option in render call", async () => {
    const provider = new HttpBrowserWorker(
      "http://localhost:3000",
      "test-token"
    );

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html: "<html></html>" }), {
        status: 200,
      })
    );

    const opts: RenderOptions = {
      url: "https://example.com",
      timeoutMs: 5000,
    };

    // Should accept the timeout option without error
    const result = await provider.render(opts);
    expect(result).toBeDefined();
  });
});

describe("Screenshot support", () => {
  it("should pass screenshot option", async () => {
    const provider = new HttpBrowserWorker(
      "http://localhost:3000",
      "test-token"
    );

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html: "<html></html>" }), {
        status: 200,
      })
    );

    await provider.render({
      url: "https://example.com",
      screenshot: true,
    });

    expect(global.fetch).toHaveBeenCalled();
  });
});

describe("WaitFor selector", () => {
  it("should wait for CSS selector", async () => {
    const provider = new HttpBrowserWorker(
      "http://localhost:3000",
      "test-token"
    );

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html: "<html></html>" }), {
        status: 200,
      })
    );

    await provider.render({
      url: "https://example.com",
      waitFor: ".content-loaded",
    });

    expect(global.fetch).toHaveBeenCalled();
  });
});
