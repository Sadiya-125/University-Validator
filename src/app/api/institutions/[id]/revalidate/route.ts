/**
 * POST /api/institutions/[id]/revalidate
 *
 * Trigger manual revalidation of an institution.
 *
 * Request body: {
 *   force?: boolean; // Force re-validation regardless of last check time
 *   maxTier?: string; // Override max tier
 * }
 *
 * Response:
 * - 202 Accepted: { success: true; runId: string; validationUrl: string }
 * - 404: Institution not found
 * - 400: Bad request
 * - 500: Server error
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestValidation } from "@/inngest";
import { randomUUID } from "crypto";

/**
 * Request schema
 */
const RevalidateRequestSchema = z.object({
  force: z.boolean().default(false),
  maxTier: z
    .enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"])
    .default("finalize"),
});

/**
 * POST /api/institutions/[id]/revalidate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = RevalidateRequestSchema.parse(body);
    const { force, maxTier } = validated;

    // TODO: Fetch institution from database
    // const institution = await db.query("SELECT * FROM institutions WHERE id = ?", [id]);
    // if (!institution) return 404

    // Mock: validate ID exists
    if (!id || !id.startsWith("inst-")) {
      return NextResponse.json(
        {
          success: false,
          error: "Institution not found",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // TODO: Check if revalidation is needed
    // If force=false and last check was recent, return 400

    // Request validation via Inngest
    const runId = randomUUID();
    const inngestResult = await requestValidation("mock-institution-name", {
      maxTier,
      priority: force ? "high" : "normal",
    });

    const baseUrl = request.nextUrl.origin;

    return NextResponse.json(
      {
        success: true,
        runId,
        validationUrl: `${baseUrl}/api/validate/${runId}`,
        statusUrl: `${baseUrl}/api/validate/${runId}/status`,
        streamUrl: `${baseUrl}/api/stream/${runId}`,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error(`[POST /api/institutions/${id}/revalidate] Error:`, error);

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
 * OPTIONS /api/institutions/[id]/revalidate
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
