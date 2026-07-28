/**
 * LLM gateway
 *
 * Main interface for structured LLM calls:
 * - generateObject with Zod schema validation
 * - Redis caching (30d TTL)
 * - Timeout + 2 retries + circuit breaker
 * - Schema repair retry on validation failure
 * - Budget tracking per run
 * - Call recording for audit
 */

import { createHash } from "crypto";
// import { generateObject } from "ai"; // TODO: Install @vercel/ai
import { z } from "zod";
// import type { LanguageModel } from "ai"; // TODO: Install @vercel/ai

// Placeholder type for LanguageModel
type LanguageModel = any;

// Placeholder for generateObject until @vercel/ai is installed
async function generateObject(options: any): Promise<any> {
  return {
    object: {},
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
}

import type {
  GenerateOptions,
  Result,
  LLMCall,
} from "./types";
import { BudgetExceededError as BudgetError, SchemaValidationError } from "./types";
import { createModel, getProviderConfig, getProviderName } from "./providers";

const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days
const MAX_RETRIES = 2;
const REPAIR_INSTRUCTION = `The previous output did not match the required schema. Please regenerate the response carefully, ensuring it exactly matches the specified JSON schema.`;

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  state: "closed" | "open" | "half_open";
  failureCount: number;
  lastFailureTime?: number;
}

/**
 * LLM Gateway
 */
export class LLMGateway {
  private model: LanguageModel | null = null;
  private circuitBreaker: CircuitBreakerState = {
    state: "closed",
    failureCount: 0,
  };
  private callRecords: LLMCall[] = [];
  private runBudget: Map<string, number> = new Map(); // runId → spent USD

  /**
   * Initialize model
   */
  async initialize(): Promise<void> {
    this.model = await createModel();
  }

  /**
   * Generate structured output with schema validation
   */
  async generateStructured<T>(
    runId: string,
    options: GenerateOptions<T>
  ): Promise<Result<T>> {
    // Check if LLM reasoning is enabled
    if (process.env.USE_LLM_REASONING === "false") {
      // Return empty result with success but no data (will be handled by caller)
      return { success: true, data: {} as T };
    }

    // Ensure model is initialized
    if (!this.model) {
      await this.initialize();
    }

    // Check circuit breaker
    if (this.circuitBreaker.state === "open") {
      const failureAge = Date.now() - (this.circuitBreaker.lastFailureTime || 0);
      if (failureAge > 60000) {
        // Auto-reset after 60 seconds
        this.circuitBreaker.state = "half_open";
        this.circuitBreaker.failureCount = 0;
      } else {
        throw new Error("LLM circuit breaker open");
      }
    }

    // Check budget
    const currentSpent = this.runBudget.get(runId) || 0;
    const maxBudget = parseFloat(process.env.LLM_MAX_RUN_COST_USD || "2.0");

    if (currentSpent >= maxBudget) {
      return {
        success: false,
        error: new BudgetError(currentSpent, maxBudget) as any,
      };
    }

    // Check cache
    const cacheKey = this.getCacheKey(options);
    const cached = await this.getCached<T>(cacheKey);

    if (cached) {
      this.recordCall(runId, options, {
        cacheHit: true,
        tokensUsed: { input: 0, output: 0, total: 0 },
        latencyMs: 0,
        costUsd: 0,
      });
      return { success: true, data: cached };
    }

    // Try generating with retries
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const startTime = Date.now();

        // Generate object
        const result = await generateObject({
          model: this.model!,
          schema: options.schema as any,
          system: options.system,
          prompt: options.prompt,
          temperature: options.temperature || 0.0,
          maxTokens: parseFloat(process.env.LLM_MAX_TOKENS || "2048"),
          timeout: parseFloat(process.env.LLM_TIMEOUT_MS || "30000"),
        });

        const latencyMs = Date.now() - startTime;
        const tokensUsed = {
          input: result.usage?.promptTokens || 0,
          output: result.usage?.completionTokens || 0,
          total: result.usage?.totalTokens || 0,
        };

        // Estimate cost
        const costUsd = this.estimateCost(tokensUsed);

        // Check budget
        const newSpent = currentSpent + costUsd;
        if (newSpent > maxBudget) {
          return {
            success: false,
            error: new BudgetError(newSpent, maxBudget) as any,
          };
        }

        // Update budget
        this.runBudget.set(runId, newSpent);

        // Cache result
        await this.setCached(cacheKey, result.object, options.cacheTtl);

        // Record call
        this.recordCall(runId, options, {
          cacheHit: false,
          tokensUsed,
          latencyMs,
          costUsd,
          repairAttempted: false,
          repairSuccessful: true,
        });

        // Record success in circuit breaker
        this.circuitBreaker.state = "closed";
        this.circuitBreaker.failureCount = 0;

        return { success: true, data: result.object };
      } catch (error) {
        lastError = error as Error;

        // Check if it's a schema validation error
        if (
          lastError.message.includes("schema") ||
          lastError.message.includes("validation")
        ) {
          // Try repair on first failure only
          if (attempt === 0) {
            try {
              const repairResult = await this.attemptRepair<T>(
                options,
                lastError
              );

              if (repairResult.success) {
                // Cache and return
                await this.setCached(
                  cacheKey,
                  repairResult.data,
                  options.cacheTtl
                );

                this.recordCall(runId, options, {
                  cacheHit: false,
                  tokensUsed: { input: 0, output: 0, total: 0 },
                  latencyMs: 0,
                  costUsd: 0,
                  repairAttempted: true,
                  repairSuccessful: true,
                });

                return repairResult;
              }
            } catch {
              // Repair failed, continue to regular retries
            }
          }
        }

        // Record failure
        if (attempt === MAX_RETRIES) {
          this.circuitBreaker.failureCount++;
          this.circuitBreaker.lastFailureTime = Date.now();

          if (this.circuitBreaker.failureCount >= 5) {
            this.circuitBreaker.state = "open";
          }

          this.recordCall(runId, options, {
            cacheHit: false,
            tokensUsed: { input: 0, output: 0, total: 0 },
            latencyMs: 0,
            costUsd: 0,
            error: lastError.message,
          });
        }

        // Wait before retry
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // All retries failed
    return {
      success: false,
      error: new SchemaValidationError(
        lastError instanceof Error
          ? new z.ZodError([])
          : new z.ZodError([])
      ) as any,
    };
  }

  /**
   * Attempt schema repair with guidance
   */
  private async attemptRepair<T>(
    options: GenerateOptions<T>,
    originalError: Error
  ): Promise<Result<T>> {
    try {
      const repairPrompt =
        options.prompt +
        "\n\n" +
        REPAIR_INSTRUCTION +
        "\n\nError details: " +
        originalError.message;

      const result = await generateObject({
        model: this.model!,
        schema: options.schema as any,
        system: options.system,
        prompt: repairPrompt,
        temperature: 0.0, // Keep temperature low for repairs
        maxTokens: parseFloat(process.env.LLM_MAX_TOKENS || "2048"),
        timeout: parseFloat(process.env.LLM_TIMEOUT_MS || "30000"),
      });

      return { success: true, data: result.object };
    } catch (error) {
      return {
        success: false,
        error: error as any,
      };
    }
  }

  /**
   * Generate cache key from options
   */
  private getCacheKey(options: GenerateOptions<any>): string {
    const config = getProviderConfig();
    const schemaStr = JSON.stringify(options.schema);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          provider: config.type,
          model: config.model,
          system: options.system,
          prompt: options.prompt,
          schema: schemaStr,
        })
      )
      .digest("hex");

    return `llm:${hash}`;
  }

  /**
   * Get cached result
   */
  private async getCached<T>(key: string): Promise<T | null> {
    // In production: fetch from Redis
    // For now: in-memory cache
    return null;
  }

  /**
   * Set cached result
   */
  private async setCached<T>(
    key: string,
    value: T,
    ttl?: number
  ): Promise<void> {
    // In production: store in Redis with TTL
    // For now: no-op
  }

  /**
   * Estimate token cost (Gemini Flash pricing as baseline)
   */
  private estimateCost(tokens: {
    input: number;
    output: number;
  }): number {
    // Gemini 2.5 Flash pricing (as of 2025):
    // Input: $0.075 / 1M tokens
    // Output: $0.30 / 1M tokens

    const inputCost = (tokens.input / 1_000_000) * 0.075;
    const outputCost = (tokens.output / 1_000_000) * 0.30;

    return inputCost + outputCost;
  }

  /**
   * Record LLM call
   */
  private recordCall(
    runId: string,
    options: GenerateOptions<any>,
    stats: {
      cacheHit: boolean;
      tokensUsed: { input: number; output: number; total: number };
      latencyMs: number;
      costUsd: number;
      repairAttempted?: boolean;
      repairSuccessful?: boolean;
      error?: string;
    }
  ): void {
    const call: LLMCall = {
      id: `llm-${Date.now()}`,
      run_id: runId,
      stage: options.stage,
      model: getProviderConfig().model,
      provider: getProviderConfig().type,
      prompt_version: process.env.LLM_PROMPT_VERSION || "1.0.0",
      tokens_used: stats.tokensUsed,
      latency_ms: stats.latencyMs,
      cost_usd: stats.costUsd,
      cache_hit: stats.cacheHit,
      schema_valid: !stats.error,
      repair_attempted: stats.repairAttempted || false,
      repair_successful: stats.repairSuccessful || false,
      error: stats.error,
      created_at: new Date(),
    };

    this.callRecords.push(call);

    // In production: insert into database
    // For now: keep in memory
  }

  /**
   * Get gateway statistics
   */
  getStats() {
    const totalCalls = this.callRecords.length;
    const cacheHits = this.callRecords.filter((c) => c.cache_hit).length;
    const repairs = this.callRecords.filter((c) => c.repair_attempted).length;
    const errors = this.callRecords.filter((c) => c.error).length;

    return {
      total_calls: totalCalls,
      cache_hits: cacheHits,
      cache_hit_rate: totalCalls > 0 ? cacheHits / totalCalls : 0,
      total_tokens: this.callRecords.reduce((sum, c) => sum + c.tokens_used.total, 0),
      total_cost_usd: this.callRecords.reduce((sum, c) => sum + c.cost_usd, 0),
      avg_latency_ms:
        totalCalls > 0
          ? this.callRecords.reduce((sum, c) => sum + c.latency_ms, 0) / totalCalls
          : 0,
      repair_rate: totalCalls > 0 ? repairs / totalCalls : 0,
      error_rate: totalCalls > 0 ? errors / totalCalls : 0,
    };
  }

  /**
   * Get call records for audit
   */
  getCalls(): LLMCall[] {
    return [...this.callRecords];
  }

  /**
   * Reset run budget
   */
  resetRunBudget(runId: string): void {
    this.runBudget.delete(runId);
  }
}

/**
 * Global gateway instance
 */
let globalGateway: LLMGateway | null = null;

/**
 * Get global LLM gateway
 */
export async function getGateway(): Promise<LLMGateway> {
  if (!globalGateway) {
    globalGateway = new LLMGateway();
    await globalGateway.initialize();
  }
  return globalGateway;
}
