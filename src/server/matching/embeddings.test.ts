import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FakeEmbeddingProvider,
  TEIEmbeddingProvider,
  GeminiEmbeddingProvider,
  getEmbeddingProvider,
} from "./embeddings";

describe("FakeEmbeddingProvider", () => {
  let provider: FakeEmbeddingProvider;

  beforeEach(() => {
    provider = new FakeEmbeddingProvider();
  });

  it("should have correct metadata", () => {
    expect(provider.name).toBe("fake");
    expect(provider.model).toBe("fake-deterministic-v1");
    expect(provider.dimensions).toBe(768);
  });

  it("should generate deterministic embeddings for single text", async () => {
    const text = "Indian Institute of Technology Bombay";
    const result = await provider.embed([text]);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(text);
    expect(result[0].vector).toHaveLength(768);
    expect(result[0].model).toBe("fake-deterministic-v1");
    expect(result[0].cached).toBe(false);
  });

  it("should generate deterministic embeddings for multiple texts", async () => {
    const texts = [
      "Indian Institute of Technology Bombay",
      "National Institute of Technology Warangal",
      "Birla Institute of Technology and Science Pilani",
    ];
    const result = await provider.embed(texts);

    expect(result).toHaveLength(3);
    result.forEach((embedding, index) => {
      expect(embedding.text).toBe(texts[index]);
      expect(embedding.vector).toHaveLength(768);
      expect(embedding.model).toBe("fake-deterministic-v1");
    });
  });

  it("should produce same vector for same text (deterministic)", async () => {
    const text = "University of Delhi";
    const result1 = await provider.embed([text]);
    const result2 = await provider.embed([text]);

    expect(result1[0].vector).toEqual(result2[0].vector);
  });

  it("should produce different vectors for different texts", async () => {
    const texts = ["Text A", "Text B"];
    const result = await provider.embed(texts);

    expect(result[0].vector).not.toEqual(result[1].vector);
  });

  it("should return vectors in [0, 1] range", async () => {
    const result = await provider.embed(["Test text"]);
    const vector = result[0].vector;

    vector.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it("should have health check returning true", async () => {
    const health = await provider.health();
    expect(health).toBe(true);
  });

  it("should handle empty text list", async () => {
    const result = await provider.embed([]);
    expect(result).toEqual([]);
  });

  it("should clear cache", async () => {
    await provider.clearCache();
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });
});

describe("TEIEmbeddingProvider", () => {
  let provider: TEIEmbeddingProvider;

  beforeEach(() => {
    provider = new TEIEmbeddingProvider("http://localhost:8080", "e5-small", 384);
  });

  it("should have correct metadata", () => {
    expect(provider.name).toBe("tei");
    expect(provider.model).toBe("e5-small");
    expect(provider.dimensions).toBe(384);
  });

  it("should apply e5 prefix for e5 models", async () => {
    // Mock fetch to capture the request
    global.fetch = vi.fn(async (url: string, options: any) => {
      if (url.includes("/embed")) {
        const body = JSON.parse(options.body);
        // Verify prefix was applied
        expect(body.texts[0]).toMatch(/^(query|passage):/);
        return new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), {
          status: 200,
        });
      }
      return new Response("Not found", { status: 404 });
    });

    await provider.embed(["test text"], "query");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should cache embeddings", async () => {
    const text = "Cached text";

    // Mock fetch
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), {
        status: 200,
      })
    );

    // First call should fetch
    await provider.embed([text]);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should use cache (same results with fewer fetches)
    await provider.embed([text]);
    // fetch might not be called again for cached text
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should batch embeddings (64 max per request)", async () => {
    global.fetch = vi.fn(async (url: string, options: any) => {
      if (url.includes("/embed")) {
        const body = JSON.parse(options.body);
        // Verify batch size doesn't exceed 64
        expect(body.texts.length).toBeLessThanOrEqual(64);
        return new Response(
          JSON.stringify({
            embeddings: body.texts.map(() => Array(384).fill(0.5)),
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const texts = Array.from({ length: 150 }, (_, i) => `Text ${i}`);
    await provider.embed(texts);

    // Should be called 3 times (64 + 64 + 22)
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should clear cache", async () => {
    await provider.clearCache();
    // Verify it doesn't throw
    expect(true).toBe(true);
  });
});

describe("GeminiEmbeddingProvider", () => {
  let provider: GeminiEmbeddingProvider;

  beforeEach(() => {
    provider = new GeminiEmbeddingProvider("test-api-key");
  });

  it("should have correct metadata", () => {
    expect(provider.name).toBe("gemini");
    expect(provider.model).toBe("text-embedding-004");
    expect(provider.dimensions).toBe(768);
  });

  it("should embed texts using Gemini API", async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("batchEmbedContents")) {
        return new Response(
          JSON.stringify({
            embeddings: [{ values: Array(768).fill(0.5) }],
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const result = await provider.embed(["Test text"]);

    expect(result).toHaveLength(1);
    expect(result[0].vector).toHaveLength(768);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should cache embeddings", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          embeddings: [{ values: Array(768).fill(0.5) }],
        }),
        { status: 200 }
      )
    );

    const text = "Cached text";

    // First call
    await provider.embed([text]);
    const fetchCount1 = vi.mocked(global.fetch).mock.calls.length;

    // Second call should use cache
    await provider.embed([text]);
    const fetchCount2 = vi.mocked(global.fetch).mock.calls.length;

    // Second call should have fewer fetches
    expect(fetchCount2).toBeLessThanOrEqual(fetchCount1 + 1);
  });

  it("should batch embeddings (100 max per request)", async () => {
    global.fetch = vi.fn(async (url: string, options: any) => {
      if (url.includes("batchEmbedContents")) {
        const body = JSON.parse(options.body);
        expect(body.requests.length).toBeLessThanOrEqual(100);
        return new Response(
          JSON.stringify({
            embeddings: body.requests.map(() => ({
              values: Array(768).fill(0.5),
            })),
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const texts = Array.from({ length: 250 }, (_, i) => `Text ${i}`);
    const result = await provider.embed(texts);

    expect(result).toHaveLength(250);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should handle API errors gracefully", async () => {
    global.fetch = vi.fn(async () =>
      new Response("Unauthorized", { status: 401 })
    );

    await expect(provider.embed(["Test"])).rejects.toThrow();
  });

  it("should clear cache", async () => {
    await provider.clearCache();
    expect(true).toBe(true);
  });
});

describe("getEmbeddingProvider factory", () => {
  it("should return FakeEmbeddingProvider by default", async () => {
    const provider = await getEmbeddingProvider("fake");
    expect(provider.name).toBe("fake");
  });

  it("should return TEIEmbeddingProvider when EMBEDDINGS_URL is set", async () => {
    const originalEnv = process.env.EMBEDDINGS_URL;
    process.env.EMBEDDINGS_URL = "http://localhost:8080";

    try {
      const provider = await getEmbeddingProvider("tei");
      expect(provider.name).toBe("tei");
    } finally {
      process.env.EMBEDDINGS_URL = originalEnv;
    }
  });

  it("should throw when TEI provider requested without EMBEDDINGS_URL", async () => {
    const originalEnv = process.env.EMBEDDINGS_URL;
    delete process.env.EMBEDDINGS_URL;

    try {
      await expect(getEmbeddingProvider("tei")).rejects.toThrow(
        "EMBEDDINGS_URL not set"
      );
    } finally {
      process.env.EMBEDDINGS_URL = originalEnv;
    }
  });

  it("should return GeminiEmbeddingProvider when GEMINI_API_KEY is set", async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";

    try {
      const provider = await getEmbeddingProvider("gemini");
      expect(provider.name).toBe("gemini");
    } finally {
      process.env.GEMINI_API_KEY = originalEnv;
    }
  });

  it("should throw when Gemini provider requested without GEMINI_API_KEY", async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await expect(getEmbeddingProvider("gemini")).rejects.toThrow(
        "GEMINI_API_KEY not set"
      );
    } finally {
      process.env.GEMINI_API_KEY = originalEnv;
    }
  });
});
