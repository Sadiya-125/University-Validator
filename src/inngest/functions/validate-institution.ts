/**
 * Inngest function: Validate Institution
 *
 * Orchestrates the full validation pipeline for a single institution.
 *
 * Idempotency: event.data.normalizedName + dayBucket (UTC)
 * Concurrency:
 *   - { key: "event.data.normalizedName", limit: 1 } (per-institution serialization)
 *   - { scope: "fn", limit: 40 } (global concurrency limit)
 *
 * Steps:
 * 1. Normalize input
 * 2. Call validation.service.validate()
 * 3. Publish progress updates via validationChannel
 * 4. Emit completion or failure event
 * 5. Return result with runId and verdict
 */

import { inngest, completeValidation, failValidation } from "../client";
import { validationChannel } from "../channels";
import { ServerProgressPublisher } from "../channels";
import type { ValidationRequestedEvent } from "../client";
import { validate } from "@/server/services/validation.service";
import type { ValidationOptions } from "@/server/services/validation.service";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/cache/redis";
import { randomUUID } from "crypto";

/**
 * Generate idempotency key: normalizedName + day bucket (UTC)
 */
function getIdempotencyKey(normalizedName: string): string {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${normalizedName}:${today}`;
}

/**
 * Main validate-institution function
 */
export const validateInstitution = inngest.createFunction(
  {
    id: "validate-institution",
    name: "Validate Institution",

    // Triggers
    triggers: [{ event: "validation/requested" }],

    // Concurrency limits
    concurrency: [
      {
        // Serialize validations for same institution
        key: "event.data.normalizedName",
        limit: 1,
      },
      {
        // Global limit: 40 concurrent validations
        scope: "fn",
        limit: 40,
      },
    ],

    // Idempotency: prevent duplicate validations on same day
    idempotency: "event.data.normalizedName",
  },
  // Main handler
  async ({ event, step }: any) => {
    const { normalizedName, maxTier = "finalize", tags = {}, priority = "normal" } = event.data;
    const runId = randomUUID();

    try {
      // Step 1: Publish start event
      await step.run("publish-start", async () => {
        await ServerProgressPublisher.publishProgress(runId, {
          step: "validate-institution",
          status: "start",
        });
      });

      // Step 2: Prepare validation options
      const db = getDb()!;
      const redis = getRedis();

      const validationOpts: ValidationOptions = {
        runId,
        maxTier,
        db: {
          query: async (sql: string, params?: unknown[]) => {
            return (db as any).query?.(sql, params) || null;
          },
        },
        redis: {
          get: async (key: string) => (await redis.get(key)) as string | null,
          setex: async (key: string, ttlSec: number, value: string) => {
            return (redis as any).set(key, value, { ex: ttlSec });
          },
        },
        onProgress: async (step: string, status: "start" | "complete" | "error", meta?: Record<string, unknown>) => {
          // Publish progress to channel
          await ServerProgressPublisher.publishProgress(runId, {
            step,
            status,
            ...meta,
          } as any);
        },
      };

      // Step 3: Run validation with memoization
      const result = await step.run("run-validation", async () => {
        return validate(normalizedName, validationOpts);
      });

      if (!result.success) {
        throw new Error(result.error || "Validation failed");
      }

      // Step 4: Publish completion event
      await step.run("publish-completion", async () => {
        await completeValidation({
          runId,
          normalizedName,
          verdict: result.data.verdict as any,
          score: result.data.decision?.score || 0.5,
          confidence: result.data.decision?.confidence || 0,
          validationRunId: runId,
          duration: 0, // TODO: track actual duration
          tierReachedAt: maxTier as any,
        });

        // Publish final result to channel
        await ServerProgressPublisher.publishDone(runId, {
          verdict: result.data.verdict as any,
          score: result.data.decision?.score || 0.5,
          confidence: result.data.decision?.confidence || 0,
          validationRunId: runId,
          duration: 0,
          tierReachedAt: maxTier as any,
          breakdown: result.data.decision?.breakdown || {},
        });
      });

      return {
        success: true,
        runId,
        verdict: result.data.verdict,
        decision: result.data.decision,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Publish failure event
      await step.run("publish-failure", async () => {
        await failValidation({
          runId,
          normalizedName,
          error: errorMessage,
          stage: maxTier as any,
          retryCount: 0,
        });
      });

      throw error;
    }
  }
);

/**
 * Retry dead-letter handler
 */
export const validateInstitutionRetry = inngest.createFunction(
  {
    id: "validate-institution-retry",
    name: "Retry Failed Validation",
    triggers: [{ event: "deadletter/retry" }],
    concurrency: [
      {
        scope: "fn",
        limit: 10, // Lower concurrency for retries
      },
    ],
  },
  async ({ event, step }: any) => {
    const { originalData, retryAttempt } = event.data;

    // Check retry limit (max 3 retries)
    if (retryAttempt > 3) {
      console.error(`Max retries exceeded for ${originalData.normalizedName}`);
      return { success: false, reason: "max_retries_exceeded" };
    }

    // Re-queue the original event with exponential backoff
    const backoffSeconds = Math.pow(2, retryAttempt) * 10; // 20s, 40s, 80s

    return step.sleep("backoff", `${backoffSeconds}s`).then(async () => {
      return inngest.send({
        name: originalData.eventName || "validation/requested",
        data: originalData,
      });
    });
  }
);
