/**
 * GET /api/batches/[id]
 *
 * Get batch status and metadata.
 *
 * Response: {
 *   success: true;
 *   data: {
 *     id: number;
 *     name: string;
 *     total: number;
 *     queued: number;
 *     succeeded: number;
 *     failed: number;
 *     state: string;
 *     progress: number; // 0-100
 *     createdAt: Date;
 *     finishedAt?: Date;
 *   };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { batches } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/batches/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batchId = parseInt(id, 10);

    if (isNaN(batchId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid batch ID",
          code: "INVALID_ID",
        },
        { status: 400 }
      );
    }

    const db = getDb()!;

    // Fetch batch details
    const batch = await db
      .select()
      .from(batches)
      .where(eq(batches.id, batchId))
      .limit(1);

    if (batch.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Batch not found",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }

    const b = batch[0]!;

    // Calculate progress
    const completed = (b.succeeded ?? 0) + (b.failed ?? 0);
    const progress = b.total > 0 ? Math.round((completed / b.total) * 100) : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          id: b.id,
          name: b.name,
          total: b.total,
          queued: b.queued,
          succeeded: b.succeeded,
          failed: b.failed,
          state: b.state,
          progress,
          createdAt: b.createdAt,
          finishedAt: b.finishedAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/batches/[id]] Error:", error);

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
 * OPTIONS /api/batches/[id]
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
