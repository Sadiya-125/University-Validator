/**
 * LLM provider registry
 *
 * Supports:
 * - Gemini (development default): @ai-sdk/google
 * - OpenAI-compatible (production): @ai-sdk/openai-compatible for Qwen
 *
 * Provider selection via LLM_PROVIDER env var.
 * Switching dev → prod requires ENV CHANGES ONLY.
 */

// import type { LanguageModel } from "ai"; // TODO: Install @vercel/ai
type LanguageModel = any;
import type { ProviderConfig } from "./types";

/**
 * Get provider configuration from environment
 */
export function getProviderConfig(): ProviderConfig {
  const provider = process.env.LLM_PROVIDER || "gemini";
  const model = process.env.LLM_MODEL || "gemini-2.5-flash";
  const maxTokens = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10);
  const temperature = parseFloat(process.env.LLM_TEMPERATURE || "0.0");
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || "30000", 10);
  const verifySsl = process.env.LLM_VERIFY_SSL !== "false";

  if (provider === "openai-compatible") {
    const baseURL = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;

    if (!baseURL || !apiKey) {
      throw new Error(
        "LLM_BASE_URL and LLM_API_KEY are required for openai-compatible provider"
      );
    }

    return {
      type: "openai-compatible",
      model,
      apiKey,
      baseURL,
      verifySsl,
      maxTokens,
      temperature,
      timeoutMs,
    };
  }

  return {
    type: "gemini",
    model,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    verifySsl,
    maxTokens,
    temperature,
    timeoutMs,
  };
}

/**
 * Create a language model instance
 */
export async function createModel(config?: ProviderConfig): Promise<LanguageModel> {
  const cfg = config || getProviderConfig();

  if (cfg.type === "gemini") {
    return createGeminiModel(cfg);
  } else {
    return createOpenAICompatibleModel(cfg);
  }
}

/**
 * Create Gemini model
 */
function createGeminiModel(config: ProviderConfig): LanguageModel {
  // Dynamically import to avoid hard dependency on @ai-sdk/google
  let google: any;

  try {
    google = require("@ai-sdk/google");
  } catch {
    throw new Error(
      "@ai-sdk/google is required for Gemini provider. Install with: npm install @ai-sdk/google"
    );
  }

  const model = google.googleGenerativeAI(config.apiKey)(config.model, {
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    topK: 40,
    topP: 0.95,
  });

  return model as LanguageModel;
}

/**
 * Create OpenAI-compatible model (Qwen, etc.)
 */
function createOpenAICompatibleModel(config: ProviderConfig): LanguageModel {
  // Dynamically import
  let openai: any;

  try {
    openai = require("@ai-sdk/openai-compatible");
  } catch {
    throw new Error(
      "@ai-sdk/openai-compatible is required. Install with: npm install @ai-sdk/openai-compatible"
    );
  }

  // Create custom fetch with SSL handling if needed
  let customFetch: typeof fetch | undefined;

  if (!config.verifySsl) {
    // Create fetch with disabled SSL verification for self-signed certs
    customFetch = createUnsafeSSLFetch();
  }

  const model = openai.createOpenAICompatibleLanguageModel({
    modelId: config.model,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    fetch: customFetch,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  return model as LanguageModel;
}

/**
 * Create a custom fetch that disables SSL verification
 *
 * This is necessary for corporate self-signed certificates.
 * NEVER use this in production unless explicitly required.
 */
function createUnsafeSSLFetch(): typeof fetch {
  // Use undici for custom Agent support
  let undici: any;

  try {
    undici = require("undici");
  } catch {
    throw new Error(
      "undici is required for SSL verification bypass. Install with: npm install undici"
    );
  }

  const agent = new undici.Agent({
    connect: {
      rejectUnauthorized: false, // DANGER: Disables SSL verification
    },
  });

  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    // @ts-ignore - undici.fetch supports agent option and Request
    return undici.fetch(url as any, {
      ...init,
      dispatcher: agent,
    });
  };
}

/**
 * Get provider name for logging
 */
export function getProviderName(): string {
  const config = getProviderConfig();
  return `${config.type}/${config.model}`;
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.model) errors.push("Model is required");
  if (!config.apiKey && config.type === "gemini") errors.push("API key is required for Gemini");
  if (!config.baseURL && config.type === "openai-compatible") {
    errors.push("Base URL is required for OpenAI-compatible");
  }
  if (config.maxTokens <= 0) errors.push("Max tokens must be positive");
  if (config.temperature < 0 || config.temperature > 2) {
    errors.push("Temperature must be between 0 and 2");
  }
  if (config.timeoutMs <= 0) errors.push("Timeout must be positive");

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log provider initialization
 */
export function logProviderInfo(): void {
  const config = getProviderConfig();
  const validation = validateProviderConfig(config);

  if (!validation.valid) {
    console.error("LLM Provider Configuration Error:");
    validation.errors.forEach((e) => console.error(`  - ${e}`));
  } else {
    console.warn(`LLM Provider: ${config.type}/${config.model}`);
    console.warn(`  Max tokens: ${config.maxTokens}`);
    console.warn(`  Temperature: ${config.temperature}`);
    console.warn(`  Timeout: ${config.timeoutMs}ms`);
    if (!config.verifySsl) {
      console.warn("  ⚠️ SSL verification DISABLED (self-signed certificates accepted)");
    }
  }
}
