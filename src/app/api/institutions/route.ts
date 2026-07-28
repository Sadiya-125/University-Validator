/**
 * GET /api/institutions
 *
 * List institutions with cursor-based pagination and filtering.
 *
 * Query parameters:
 * - cursor?: string (opaque cursor for next page, base64-encoded)
 * - limit?: number (default: 50, max: 100)
 * - search?: string (search in institution name)
 * - verdict?: "genuine" | "likely_genuine" | "likely_fake" | "fake" | "needs_review"
 * - sortBy?: "name" | "score" | "confidence" | "updatedAt"
 * - sortOrder?: "asc" | "desc"
 *
 * Response: {
 *   success: true;
 *   institutions: Array<{
 *     id: string;
 *     normalizedName: string;
 *     verdict: string;
 *     score: number;
 *     confidence: number;
 *     lastValidatedAt: Date;
 *   }>;
 *   nextCursor?: string;
 *   hasMore: boolean;
 *   total: number;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Request query schema
 */
const ListInstitutionsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
  verdict: z
    .enum([
      "genuine",
      "likely_genuine",
      "likely_fake",
      "fake",
      "needs_review",
      "insufficient_evidence",
    ])
    .optional(),
  sortBy: z.enum(["name", "score", "confidence", "updatedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Response schema
 */
const InstitutionSchema = z.object({
  id: z.string(),
  normalizedName: z.string(),
  verdict: z.string(),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  lastValidatedAt: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ListResponseSchema = z.object({
  success: z.literal(true),
  institutions: z.array(InstitutionSchema),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
  total: z.number(),
  limit: z.number(),
});

/**
 * Mock institutions data (in production, use database with cursor pagination)
 */
const mockInstitutions = [
  {
    id: "inst-1",
    normalizedName: "iit bombay",
    verdict: "genuine",
    score: 0.95,
    confidence: 0.92,
    lastValidatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: "inst-2",
    normalizedName: "delhi university",
    verdict: "likely_genuine",
    score: 0.82,
    confidence: 0.85,
    lastValidatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: "inst-3",
    normalizedName: "fake university",
    verdict: "fake",
    score: 0.05,
    confidence: 0.98,
    lastValidatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: "inst-4",
    normalizedName: "stanford university",
    verdict: "genuine",
    score: 0.98,
    confidence: 0.95,
    lastValidatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: "inst-5",
    normalizedName: "oxford university",
    verdict: "genuine",
    score: 0.97,
    confidence: 0.94,
    lastValidatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
];

/**
 * Decode cursor (base64 encoded offset)
 */
function decodeCursor(cursor: string): number {
  try {
    return parseInt(Buffer.from(cursor, "base64").toString(), 10);
  } catch {
    return 0;
  }
}

/**
 * Encode cursor
 */
function encodeCursor(offset: number): string {
  return Buffer.from(offset.toString()).toString("base64");
}

/**
 * GET /api/institutions
 */
export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const params = {
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
      search: searchParams.get("search") ?? undefined,
      verdict: searchParams.get("verdict") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
    };

    const validated = ListInstitutionsSchema.parse(params);
    const { cursor, limit, search, verdict, sortBy, sortOrder } = validated;

    // TODO: Implement actual database query with filtering and sorting
    // For now, use mock data
    let institutions = [...mockInstitutions];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      institutions = institutions.filter((inst) =>
        inst.normalizedName.includes(searchLower)
      );
    }

    // Apply verdict filter
    if (verdict) {
      institutions = institutions.filter((inst) => inst.verdict === verdict);
    }

    // Apply sorting
    institutions.sort((a, b) => {
      let aVal: any = a[sortBy as keyof typeof a];
      let bVal: any = b[sortBy as keyof typeof b];

      if (typeof aVal === "string") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    // Apply cursor-based pagination
    const offset = cursor ? decodeCursor(cursor) : 0;
    const paginatedInstitutions = institutions.slice(offset, offset + limit);
    const hasMore = offset + limit < institutions.length;
    const nextCursor = hasMore ? encodeCursor(offset + limit) : undefined;

    return NextResponse.json(
      {
        success: true,
        institutions: paginatedInstitutions,
        nextCursor,
        hasMore,
        total: institutions.length,
        limit,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/institutions] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
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
 * OPTIONS /api/institutions
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
