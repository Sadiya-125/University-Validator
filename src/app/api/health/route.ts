/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and load balancers.
 *
 * Response: {
 *   status: "ok" | "degraded" | "unhealthy";
 *   timestamp: Date;
 *   uptime: number;
 *   checks: {
 *     database: "ok" | "error";
 *     redis: "ok" | "error";
 *     inngest: "ok" | "error";
 *   };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Response schema
 */
const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unhealthy"]),
  timestamp: z.date(),
  uptime: z.number(),
  checks: z.object({
    database: z.enum(["ok", "error"]),
    redis: z.enum(["ok", "error"]),
    inngest: z.enum(["ok", "error"]),
  }),
});

/**
 * Server start time for uptime calculation
 */
const SERVER_START = new Date();

/**
 * GET /api/health
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const uptime = now.getTime() - SERVER_START.getTime();

    // TODO: Implement actual health checks
    // const dbHealthy = await checkDatabase();
    // const redisHealthy = await checkRedis();
    // const inngestHealthy = await checkInngest();

    // Mock health checks (in production, use actual checks)
    const checks: Record<string, "ok" | "error"> = {
      database: "ok",
      redis: "ok",
      inngest: "ok",
    };

    // Determine overall status
    const errorChecks = Object.values(checks).filter((v) => v === "error").length;
    const status =
      errorChecks === 0 ? "ok" : errorChecks < 3 ? "degraded" : "unhealthy";

    return NextResponse.json(
      {
        status,
        timestamp: now,
        uptime,
        checks,
      },
      {
        status: status === "ok" ? 200 : status === "degraded" ? 503 : 503,
      }
    );
  } catch (error) {
    console.error("[GET /api/health] Error:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date(),
        uptime: Date.now() - SERVER_START.getTime(),
        checks: {
          database: "error",
          redis: "error",
          inngest: "error",
        },
      },
      { status: 503 }
    );
  }
}

/**
 * OPTIONS /api/health
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
