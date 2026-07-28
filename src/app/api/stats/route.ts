/**
 * GET /api/stats
 *
 * System statistics and metrics.
 *
 * Response: {
 *   timestamp: Date;
 *   institutions: {
 *     total: number;
 *     byVerdict: Record<string, number>;
 *     averageScore: number;
 *     averageConfidence: number;
 *   };
 *   validations: {
 *     total: number;
 *     today: number;
 *     avgDuration: number;
 *     byTier: Record<string, number>;
 *   };
 *   registries: {
 *     lastIngestAt: Record<string, Date>;
 *     recordCounts: Record<string, number>;
 *   };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Response schema
 */
const StatsResponseSchema = z.object({
  timestamp: z.date(),
  institutions: z.object({
    total: z.number(),
    byVerdict: z.record(z.string(), z.number()),
    averageScore: z.number(),
    averageConfidence: z.number(),
  }),
  validations: z.object({
    total: z.number(),
    today: z.number(),
    avgDuration: z.number(),
    byTier: z.record(z.string(), z.number()),
  }),
  registries: z.object({
    lastIngestAt: z.record(z.string(), z.date()),
    recordCounts: z.record(z.string(), z.number()),
  }),
});

/**
 * GET /api/stats
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Implement actual stats queries from database
    // SELECT COUNT(*) FROM institutions;
    // SELECT verdict, COUNT(*) FROM institutions GROUP BY verdict;
    // SELECT AVG(score), AVG(confidence) FROM institutions;
    // SELECT COUNT(*) FROM validation_runs WHERE DATE(created_at) = TODAY();
    // SELECT tier_reached_at, COUNT(*) FROM validation_runs GROUP BY tier_reached_at;
    // SELECT authority, MAX(ingested_at) FROM registries GROUP BY authority;

    // Mock stats (in production, use actual database queries)
    const stats = {
      timestamp: new Date(),
      institutions: {
        total: 1250,
        byVerdict: {
          genuine: 450,
          likely_genuine: 380,
          needs_review: 180,
          likely_fake: 120,
          fake: 95,
          insufficient_evidence: 25,
        },
        averageScore: 0.72,
        averageConfidence: 0.78,
      },
      validations: {
        total: 3450,
        today: 284,
        avgDuration: 2850, // milliseconds
        byTier: {
          fast: 850,
          mirror: 1200,
          discovery: 650,
          verify: 380,
          extract: 220,
          judge: 100,
          finalize: 50,
        },
      },
      registries: {
        lastIngestAt: {
          aishe: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          ugc: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          nad: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        },
        recordCounts: {
          aishe: 45000,
          ugc: 38000,
          nad: 22000,
        },
      },
    };

    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    console.error("[GET /api/stats] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/stats
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
