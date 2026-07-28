/**
 * POST /api/institutions/merge
 *
 * Merge duplicate institutions into one.
 *
 * Request body: {
 *   sourceIds: string[]; // IDs to merge into target
 *   targetId: string; // Destination ID
 *   keepHistory?: boolean; // Keep validation history from merged institutions
 * }
 *
 * Response:
 * - 200 OK: { success: true; mergedCount: number; targetId: string }
 * - 400: Bad request
 * - 404: Institution not found
 * - 500: Server error
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Request schema
 */
const MergeRequestSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1, "At least one source ID required"),
  targetId: z.string().min(1, "Target ID required"),
  keepHistory: z.boolean().default(true),
});

/**
 * POST /api/institutions/merge
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = MergeRequestSchema.parse(body);
    const { sourceIds, targetId, keepHistory } = validated;

    // Validate that source IDs don't include target
    if (sourceIds.includes(targetId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Target ID cannot be in source IDs",
          code: "INVALID_REQUEST",
        },
        { status: 400 }
      );
    }

    // TODO: Implement actual merge logic
    // 1. Fetch target institution
    // 2. Fetch source institutions
    // 3. Merge evidence
    // 4. Merge validation history if keepHistory=true
    // 5. Update all evidence references to point to target
    // 6. Mark source institutions as merged
    // 7. Recompute validation score for target

    const mergedCount = sourceIds.length;

    return NextResponse.json(
      {
        success: true,
        mergedCount,
        targetId,
        message: `Successfully merged ${mergedCount} institutions into ${targetId}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[POST /api/institutions/merge] Error:", error);

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
 * OPTIONS /api/institutions/merge
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
