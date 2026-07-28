/**
 * LLM gateway types
 *
 * Centralized LLM integration using Vercel AI SDK.
 * Supports multiple providers (Gemini, OpenAI-compatible).
 * Environment-based configuration for dev/prod switching.
 */

import { z } from "zod";

/**
 * LLM call record (for audit and cost tracking)
 */
export interface LLMCall {
  id: string;
  run_id: string;
  stage: string; // "extract", "reason", "validate"
  model: string;
  provider: string;
  prompt_version: string;
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  latency_ms: number;
  cost_usd: number;
  cache_hit: boolean;
  schema_valid: boolean;
  repair_attempted: boolean;
  repair_successful: boolean;
  error?: string;
  created_at: Date;
}

/**
 * LLM budget exceeded error
 */
export class BudgetExceededError extends Error {
  constructor(spent: number, limit: number) {
    super(`LLM run budget exceeded: $${spent.toFixed(4)} > $${limit.toFixed(4)}`);
    this.name = "BudgetExceededError";
  }
}

/**
 * Schema validation error with repair attempt
 */
export class SchemaValidationError extends Error {
  constructor(
    public errors: z.ZodError,
    public repairAttempted: boolean = false
  ) {
    super(`Schema validation failed${repairAttempted ? " (after repair)" : ""}`);
    this.name = "SchemaValidationError";
  }
}

/**
 * Typed result for structured LLM calls
 */
export type Result<T> = { success: true; data: T } | { success: false; error: SchemaValidationError };

/**
 * LLM provider configuration
 */
export interface ProviderConfig {
  type: "gemini" | "openai-compatible";
  model: string;
  apiKey?: string;
  baseURL?: string;
  verifySsl: boolean;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

/**
 * Structured generation options
 */
export interface GenerateOptions<T> {
  stage: string; // "extract", "reason", etc.
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
  cacheTtl?: number; // seconds, default 30 days
}

/**
 * Gateway statistics
 */
export interface GatewayStats {
  total_calls: number;
  cache_hits: number;
  cache_hit_rate: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  repair_rate: number;
  error_rate: number;
}
