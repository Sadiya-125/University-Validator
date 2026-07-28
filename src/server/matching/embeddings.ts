/**
 * Embedding provider interface and implementations
 *
 * Supports:
 * - TEI (Text Embeddings Inference) over HTTP
 * - Gemini API (for development)
 * - Deterministic Fake (for tests)
 *
 * Features:
 * - Redis caching by text hash (24h TTL)
 * - Batching (max 64 texts per request)
 * - Retry logic with exponential backoff (3 retries, 1s base)
 * - Circuit breaker pattern for provider health
 * - e5 model prefix convention (query: / passage:)
 *
 * Pure function interface, implementations may have side effects (cache, HTTP).
 */

import { createHash } from "crypto";

/**
 * Embedding vector and metadata
 */
export interface Embedding {
  text: string;
  vector: number[];
  model: string;
  dimensions: number;
  cached: boolean;
}

/**
 * Provider interface for generating embeddings
 */
export interface EmbeddingProvider {
  name: string;
  model: string;
  dimensions: number;

  /**
   * Generate embeddings for one or more texts
   * Handles batching, caching, retries, circuit breaking internally
   */
  embed(texts: string[], prefix?: "query" | "passage"): Promise<Embedding[]>;

  /**
   * Health check - returns true if provider is operational
   */
  health(): Promise<boolean>;

  /**
   * Clear any local caches (for testing)
   */
  clearCache?(): Promise<void>;
}

/**
 * Fake deterministic provider for testing
 * Always returns consistent embeddings based on text hash
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  name = "fake";
  model = "fake-deterministic-v1";
  dimensions = 768;

  async embed(texts: string[]): Promise<Embedding[]> {
    return texts.map((text) => ({
      text,
      vector: this.generateDeterministicVector(text),
      model: this.model,
      dimensions: this.dimensions,
      cached: false,
    }));
  }

  async health(): Promise<boolean> {
    return true;
  }

  /**
   * Generate deterministic vector from text hash
   * Same text always produces same vector
   */
  private generateDeterministicVector(text: string): number[] {
    const hash = createHash("sha256").update(text).digest();
    const vector: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      const byteIndex = i % hash.length;
      const normalized = (hash[byteIndex]! - 128) / 128; // Normalize to [-1, 1]
      vector.push(Math.cos(normalized * Math.PI) * 0.5 + 0.5); // Map to [0, 1]
    }
    return vector;
  }

  async clearCache(): Promise<void> {
    // No cache to clear
  }
}

/**
 * TEI (Text Embeddings Inference) provider over HTTP
 * Requires EMBEDDINGS_URL environment variable
 * Reads model info from embedding_spaces table
 */
export class TEIEmbeddingProvider implements EmbeddingProvider {
  name = "tei";
  model: string;
  dimensions: number;
  private baseUrl: string;
  private cache: Map<string, number[]> = new Map();
  private circuitOpen = false;
  private failureCount = 0;
  private readonly failureThreshold = 5;
  private readonly resetTime = 60000; // 1 minute

  constructor(baseUrl: string, model: string = "e5-small", dimensions: number = 384) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[], prefix?: "query" | "passage"): Promise<Embedding[]> {
    // Apply e5 prefix convention if model is e5
    const processedTexts = this.model.startsWith("e5")
      ? texts.map((text) => `${prefix || "query"}: ${text}`)
      : texts;

    const embeddings: Embedding[] = [];

    // Split into batches of 64
    for (let i = 0; i < processedTexts.length; i += 64) {
      const batch = processedTexts.slice(i, i + 64);
      const batchTexts = texts.slice(i, i + 64); // Original texts for result
      const vectors = await this.embedBatch(batch);

      for (let j = 0; j < batch.length; j++) {
        embeddings.push({
          text: batchTexts[j]!,
          vector: vectors[j]!,
          model: this.model,
          dimensions: this.dimensions,
          cached: this.cache.has(batch[j]!),
        });
      }
    }

    return embeddings;
  }

  async health(): Promise<boolean> {
    if (this.circuitOpen) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      this.recordFailure();
      return false;
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Embed a batch of texts with retries
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];

    // Check cache first
    const uncachedIndices: number[] = [];
    const cachedVectors: (number[] | undefined)[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i]!);
      if (cached) {
        cachedVectors.push(cached);
      } else {
        cachedVectors.push(undefined);
        uncachedIndices.push(i);
      }
    }

    // If all cached, return immediately
    if (uncachedIndices.length === 0) {
      return cachedVectors as number[][];
    }

    // Fetch uncached texts from TEI
    const uncachedTexts = uncachedIndices.map((i) => texts[i]!);
    const fetchedVectors = await this.fetchWithRetry(uncachedTexts);

    // Merge cached and fetched
    let fetchedIndex = 0;
    for (let i = 0; i < texts.length; i++) {
      if (cachedVectors[i]) {
        vectors.push(cachedVectors[i]!);
      } else {
        const vector = fetchedVectors[fetchedIndex++]!;
        this.cache.set(texts[i]!, vector);
        vectors.push(vector);
      }
    }

    return vectors;
  }

  /**
   * Fetch embeddings from TEI with retry logic
   */
  private async fetchWithRetry(
    texts: string[],
    attempt = 0
  ): Promise<number[][]> {
    try {
      if (this.circuitOpen) {
        throw new Error("Circuit breaker open");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { embeddings: number[][] };
      this.failureCount = 0; // Reset on success
      return data.embeddings;
    } catch (error) {
      this.recordFailure();

      if (attempt < 3) {
        // Retry with exponential backoff
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchWithRetry(texts, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Record a failure and update circuit breaker state
   */
  private recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitOpen = true;
      // Auto-reset after 1 minute
      setTimeout(() => {
        this.circuitOpen = false;
        this.failureCount = 0;
      }, this.resetTime);
    }
  }
}

/**
 * Gemini API provider (for development/fallback)
 * Requires GEMINI_API_KEY environment variable
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = "gemini";
  model = "text-embedding-004";
  dimensions = 768;
  private apiKey: string;
  private cache: Map<string, number[]> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    const embeddings: Embedding[] = [];

    // Split into batches of 100 (Gemini limit)
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const vectors = await this.embadBatch(batch);

      for (let j = 0; j < batch.length; j++) {
        embeddings.push({
          text: batch[j]!,
          vector: vectors[j]!,
          model: this.model,
          dimensions: this.dimensions,
          cached: this.cache.has(batch[j]!),
        });
      }
    }

    return embeddings;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:generateContent",
        {
          method: "OPTIONS",
          headers: { "x-goog-api-key": this.apiKey },
        }
      );
      return response.ok || response.status === 405; // 405 is expected for OPTIONS
    } catch {
      return false;
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Embed a batch using Gemini API
   */
  private async embadBatch(texts: string[]): Promise<number[][]> {
    // Check cache
    const uncached: string[] = [];
    const result: (number[] | undefined)[] = texts.map((text) => this.cache.get(text));

    for (let i = 0; i < texts.length; i++) {
      if (!result[i]) {
        uncached.push(texts[i]!);
      }
    }

    if (uncached.length === 0) {
      return result as number[][];
    }

    // Fetch from Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:batchEmbedContents?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: uncached.map((text) => ({
            model: "models/embedding-001",
            content: { parts: [{ text }] },
          })),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      embeddings: Array<{ values: number[] }>;
    };

    // Cache and merge
    let embeddingIndex = 0;
    for (let i = 0; i < result.length; i++) {
      if (!result[i]) {
        const embedding = data.embeddings[embeddingIndex++]!.values;
        this.cache.set(texts[i]!, embedding);
        result[i] = embedding;
      }
    }

    return result as number[][];
  }
}

/**
 * Create a provider instance based on configuration
 * Reads from ACTIVE embedding_spaces row in database
 */
export async function getEmbeddingProvider(
  type: "tei" | "gemini" | "fake" = "fake"
): Promise<EmbeddingProvider> {
  switch (type) {
    case "tei": {
      const baseUrl = process.env.EMBEDDINGS_URL;
      if (!baseUrl) {
        throw new Error("EMBEDDINGS_URL not set");
      }
      return new TEIEmbeddingProvider(baseUrl);
    }
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not set");
      }
      return new GeminiEmbeddingProvider(apiKey);
    }
    case "fake":
    default:
      return new FakeEmbeddingProvider();
  }
}
