/**
 * GET /api/batches/[id]/items
 *
 * Get paginated batch items with validation results.
 *
 * Query params:
 *   - page: number (1-indexed, default 1)
 *   - pageSize: number (default 50, max 500)
 *   - status: "pending" | "succeeded" | "failed" (optional filter)
 *
 * Response: {
 *   success: true;
 *   data: {
 *     items: Array<{
 *       id: number;
 *       rowNo: number;
 *       inputName: string;
 *       inputUniversity?: string;
 *       state: string;
 *       error?: string;
 *       verdict?: string;
 *       confidence?: number;
 *       createdAt: Date;
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
import { batchItems, validationRuns } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Query params schema
 */
const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  status: z.enum(["pending", "succeeded", "failed"]).optional(),
});

/**
 * GET /api/batches/[id]/items
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

    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams;
    const queryParams = QuerySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status"),
    });

    const { page, pageSize, status } = queryParams;
    const offset = (page - 1) * pageSize;

    const db = getDb()!;

    // Build where clause
    const whereConditions = [eq(batchItems.batchId, batchId)];
    if (status) {
      whereConditions.push(eq(batchItems.state, status));
    }

    // Get total count
    const countResult = await db
      .select({ count: batchItems.id })
      .from(batchItems)
      .where(and(...whereConditions));

    const total = countResult.length;

    // Fetch items with validation details
    const items = await db
      .select({
        id: batchItems.id,
        rowNo: batchItems.rowNo,
        inputName: batchItems.inputName,
        inputUniversity: batchItems.inputUniversity,
        state: batchItems.state,
        error: batchItems.error,
        runId: batchItems.runId,
        createdAt: batchItems.createdAt,
        verdict: validationRuns.verdict,
        confidence: validationRuns.confidence,
      })
      .from(batchItems)
      .leftJoin(validationRuns, eq(batchItems.runId, validationRuns.id))
      .where(and(...whereConditions))
      .orderBy(batchItems.rowNo)
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json(
      {
        success: true,
        data: {
          items: items.map((item) => ({
            id: item.id,
            rowNo: item.rowNo,
            inputName: item.inputName,
            inputUniversity: item.inputUniversity || undefined,
            state: item.state,
            error: item.error || undefined,
            verdict: item.verdict || undefined,
            confidence: item.confidence || undefined,
            createdAt: item.createdAt,
          })),
          total,
          page,
          pageSize,
          totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/batches/[id]/items] Error:", error);

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
 * OPTIONS /api/batches/[id]/items
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
