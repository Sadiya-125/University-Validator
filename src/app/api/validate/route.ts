/**
 * POST /api/validate
 *
 * Initiate institution validation with 1200ms budget.
 *
 * Behavior:
 * - If L1 cache hit: return verdict immediately (fast path)
 * - If L1 miss: queue to Inngest and return runId (async path)
 * - Timeout: return runId for polling (safe fallback)
 *
 * Body: { normalizedName: string; maxTier?: string; priority?: "low" | "normal" | "high" }
 *
 * Response:
 * - Fast path (200 OK): { success: true; verdict: string; score: number; cached: true; runId: string }
 * - Async path (202 Accepted): { success: true; runId: string; cached: false; validationUrl: string }
 * - Error (400/500): { success: false; error: string; code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestValidation } from "@/inngest";
import { validate } from "@/server/services/validation.service";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/cache/redis";
import { randomUUID } from "crypto";

/**
 * Request schema
 */
const ValidateRequestSchema = z.object({
  normalizedName: z.string().min(1, "Institution name required"),
  maxTier: z
    .enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"])
    .optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Response schema (fast path)
 */
const FastPathResponseSchema = z.object({
  success: z.literal(true),
  verdict: z.string(),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  cached: z.literal(true),
  runId: z.string(),
  cachedAt: z.date().optional(),
  source: z.string().optional(),
});

/**
 * Response schema (async path)
 */
const AsyncPathResponseSchema = z.object({
  success: z.literal(true),
  runId: z.string(),
  cached: z.literal(false),
  validationUrl: z.string(),
  statusUrl: z.string(),
  streamUrl: z.string(),
  estimatedTime: z.number(), // milliseconds
});

/**
 * Error response schema
 */
const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  details: z.any().optional(),
});

/**
 * POST /api/validate - Main validation endpoint
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const budgetMs = 1200; // 1200ms budget for fast path attempt
  const runId = randomUUID();

  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = ValidateRequestSchema.parse(body);
    const { normalizedName, maxTier = "finalize", priority = "normal", tags = {} } = validated;

    // Normalize input
    const normalized = normalizedName.toLowerCase().trim();

    // Attempt fast path with budget
    const fastPathResult = await Promise.race([
      (async () => {
        const db = getDb()!;
        const redis = getRedis();

        // Run validation with fast tier limit
        return validate(normalized, {
          runId,
          maxTier: "mirror",
          redis: {
            get: async (key: string) => (await redis.get(key)) as string | null,
            setex: async (key: string, ttlSec: number, value: string) => {
              await (redis as any).setex(key, ttlSec, value);
            },
          },
        });
      })(),
      // Timeout after budget
      new Promise<{ success: false; timedOut: true }>((resolve) => {
        setTimeout(() => {
          resolve({ success: false, timedOut: true });
        }, budgetMs);
      }),
    ]);

    // Fast path: verdict returned within budget
    if (fastPathResult.success && !("timedOut" in fastPathResult)) {
      const elapsedMs = Date.now() - startTime;

      return NextResponse.json(
        {
          success: true,
          verdict: fastPathResult.data.verdict,
          score: fastPathResult.data.decision?.score || 0.5,
          confidence: fastPathResult.data.decision?.confidence || 0,
          cached: true,
          runId,
          elapsedMs,
        },
        { status: 200 }
      );
    }

    // Async path: queue to Inngest and return runId for polling
    const inngestResult = await requestValidation(normalized, {
      maxTier,
      priority,
      tags,
    });

    const baseUrl = request.nextUrl.origin;

    return NextResponse.json(
      {
        success: true,
        runId,
        cached: false,
        validationUrl: `${baseUrl}/api/validate/${runId}`,
        statusUrl: `${baseUrl}/api/validate/${runId}/status`,
        streamUrl: `${baseUrl}/api/stream/${runId}`,
        estimatedTime: 5000, // 5s estimated for full validation
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[POST /api/validate] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          code: "VALIDATION_ERROR",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message || "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/validate - CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
