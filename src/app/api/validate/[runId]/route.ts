/**
 * GET /api/validate/[runId]
 *
 * Poll for validation status and result.
 *
 * Response:
 * - Pending (202): { status: "pending"; stage: string; estimatedTimeLeft: number }
 * - Complete (200): { status: "complete"; verdict: string; score: number; confidence: number }
 * - Failed (400): { status: "failed"; error: string }
 * - NotFound (404): { error: "Validation run not found" }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Response schemas
 */
const PendingResponseSchema = z.object({
  status: z.literal("pending"),
  stage: z.string(),
  estimatedTimeLeft: z.number(),
  progress: z.number().min(0).max(1).optional(),
});

const CompleteResponseSchema = z.object({
  status: z.literal("complete"),
  verdict: z.enum([
    "genuine",
    "likely_genuine",
    "likely_fake",
    "fake",
    "needs_review",
    "insufficient_evidence",
  ]),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  duration: z.number().min(0),
  tierReachedAt: z.string(),
});

const FailedResponseSchema = z.object({
  status: z.literal("failed"),
  error: z.string(),
  stage: z.string().optional(),
  code: z.string().optional(),
});

/**
 * Mock validation runs storage (in production, use database)
 */
const validationRuns = new Map<
  string,
  {
    status: "pending" | "complete" | "failed";
    stage?: string;
    verdict?: string;
    score?: number;
    confidence?: number;
    duration?: number;
    error?: string;
    createdAt: Date;
  }
>();

/**
 * GET /api/validate/[runId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;

  try {
    // Validate runId format
    if (!runId || typeof runId !== "string" || runId.length < 10) {
      return NextResponse.json(
        {
          error: "Invalid runId format",
          code: "INVALID_RUN_ID",
        },
        { status: 400 }
      );
    }

    // TODO: Fetch from database
    // const run = await db.query("SELECT * FROM validation_runs WHERE id = ?", [runId]);
    // if (!run) return 404

    // Mock: check if run exists in memory (for demo purposes)
    const run = validationRuns.get(runId);

    if (!run) {
      // Check if run was created recently (within 10 minutes)
      const now = Date.now();
      if (!run) {
        return NextResponse.json(
          {
            error: "Validation run not found",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }
    }

    if (run.status === "pending") {
      // Return pending status
      const elapsedMs = Date.now() - run.createdAt.getTime();
      const estimatedTotalMs = 5000;
      const timeLeftMs = Math.max(0, estimatedTotalMs - elapsedMs);
      const progress = Math.min(1, elapsedMs / estimatedTotalMs);

      return NextResponse.json(
        {
          status: "pending",
          stage: run.stage || "initialize",
          estimatedTimeLeft: timeLeftMs,
          progress,
        },
        { status: 202 }
      );
    }

    if (run.status === "complete") {
      // Return completed result
      return NextResponse.json(
        {
          status: "complete",
          verdict: run.verdict || "needs_review",
          score: run.score || 0.5,
          confidence: run.confidence || 0.5,
          duration: run.duration || Date.now() - run.createdAt.getTime(),
          tierReachedAt: "finalize",
        },
        { status: 200 }
      );
    }

    if (run.status === "failed") {
      // Return error status
      return NextResponse.json(
        {
          status: "failed",
          error: run.error || "Validation failed",
          stage: run.stage,
          code: "VALIDATION_FAILED",
        },
        { status: 400 }
      );
    }

    // Unknown status
    return NextResponse.json(
      {
        error: "Unknown validation status",
        code: "UNKNOWN_STATUS",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error(`[GET /api/validate/${params.runId}] Error:`, error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/validate/[runId]
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
