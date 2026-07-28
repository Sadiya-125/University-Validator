/**
 * GET /api/institutions/[id]
 *
 * Get detailed institution information with evidence and validation history.
 *
 * Response: {
 *   success: true;
 *   id: string;
 *   normalizedName: string;
 *   verdict: string;
 *   score: number;
 *   confidence: number;
 *   breakdown: {
 *     evidenceCount: number;
 *     tierDistribution: Record<string, number>;
 *   };
 *   evidence: Array<{
 *     id: string;
 *     kind: string;
 *     tier: string;
 *     category: string;
 *     status: string;
 *     quality: number;
 *     collectedAt: Date;
 *   }>;
 *   validationHistory: Array<{
 *     id: string;
 *     verdict: string;
 *     score: number;
 *     confidence: number;
 *     tierReachedAt: string;
 *     validatedAt: Date;
 *   }>;
 *   metadata: Record<string, unknown>;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Response schema
 */
const DetailedInstitutionSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  normalizedName: z.string(),
  verdict: z.string(),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  breakdown: z.object({
    evidenceCount: z.number(),
    tierDistribution: z.record(z.string(), z.number()),
  }),
  evidence: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      tier: z.string(),
      category: z.string(),
      status: z.string(),
      quality: z.number(),
      collectedAt: z.date(),
    })
  ),
  validationHistory: z.array(
    z.object({
      id: z.string(),
      verdict: z.string(),
      score: z.number(),
      confidence: z.number(),
      tierReachedAt: z.string(),
      validatedAt: z.date(),
    })
  ),
  metadata: z.record(z.string(), z.unknown()),
});

/**
 * Mock institution details (in production, use database)
 */
const mockInstitutionDetails: Record<
  string,
  Omit<z.infer<typeof DetailedInstitutionSchema>, "success">
> = {
  "inst-1": {
    id: "inst-1",
    normalizedName: "iit bombay",
    verdict: "genuine",
    score: 0.95,
    confidence: 0.92,
    breakdown: {
      evidenceCount: 12,
      tierDistribution: {
        mirror: 5,
        live: 4,
        api: 3,
      },
    },
    evidence: [
      {
        id: "ev-1",
        kind: "verified_source",
        tier: "mirror",
        category: "ugc_listed",
        status: "confirmed",
        quality: 0.95,
        collectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: "ev-2",
        kind: "verified_source",
        tier: "mirror",
        category: "aishe_listed",
        status: "confirmed",
        quality: 0.94,
        collectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: "ev-3",
        kind: "web_evidence",
        tier: "api",
        category: "official_website",
        status: "verified",
        quality: 0.85,
        collectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    ],
    validationHistory: [
      {
        id: "run-1",
        verdict: "genuine",
        score: 0.95,
        confidence: 0.92,
        tierReachedAt: "finalize",
        validatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        id: "run-2",
        verdict: "genuine",
        score: 0.93,
        confidence: 0.90,
        tierReachedAt: "finalize",
        validatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    ],
    metadata: {
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      founded: 1958,
      acronym: "IIT-B",
    },
  },
};

/**
 * GET /api/institutions/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Validate ID format
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid institution ID",
          code: "INVALID_ID",
        },
        { status: 400 }
      );
    }

    // TODO: Fetch from database
    // const institution = await db.query("SELECT * FROM institutions WHERE id = ?", [id]);

    // Use mock data for demo
    const details = mockInstitutionDetails[id];

    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: "Institution not found",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...details,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`[GET /api/institutions/${id}] Error:`, error);

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
 * OPTIONS /api/institutions/[id]
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
