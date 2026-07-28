/**
 * GET /api/batches/list
 *
 * List all batches with pagination.
 *
 * Query params:
 *   - page: number (1-indexed, default 1)
 *   - pageSize: number (default 20, max 100)
 *   - state: string (optional filter)
 *
 * Response: {
 *   success: true;
 *   data: {
 *     batches: Array<{
 *       id: number;
 *       name: string;
 *       total: number;
 *       queued: number;
 *       succeeded: number;
 *       failed: number;
 *       state: string;
 *       progress: number;
 *       createdAt: Date;
 *       finishedAt?: Date;
 *     }>;
 *     total: number;
 *     page: number;
 *     pageSize: number;
 *     totalPages: number;
 *   };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { batches } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Query params schema
 */
const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  state: z.string().optional(),
});

/**
 * GET /api/batches/list
 */
export async function GET(request: NextRequest) {
  try {
    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams;
    const queryParams = QuerySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      state: searchParams.get("state"),
    });

    const { page, pageSize, state } = queryParams;
    const offset = (page - 1) * pageSize;

    const db = getDb()!;

    // Build where clause
    const whereConditions = state ? eq(batches.state, state as any) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: batches.id })
      .from(batches)
      .where(whereConditions);

    const total = countResult.length;

    // Fetch batches
    const batchList = await db
      .select()
      .from(batches)
      .where(whereConditions)
      .orderBy(desc(batches.createdAt))
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.ceil(total / pageSize);

    // Calculate progress for each batch
    const result = batchList.map((b) => {
      const succeeded = b.succeeded ?? 0;
      const failed = b.failed ?? 0;
      return {
        id: b.id,
        name: b.name,
        total: b.total,
        queued: b.queued ?? 0,
        succeeded,
        failed,
        state: b.state,
        progress: b.total > 0 ? Math.round(((succeeded + failed) / b.total) * 100) : 0,
        createdAt: b.createdAt,
        finishedAt: b.finishedAt || undefined,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          batches: result,
          total,
          page,
          pageSize,
          totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/batches/list] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          code: "VALIDATION_ERROR",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

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
 * OPTIONS /api/batches/list
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
