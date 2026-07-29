/**
 * GET /api/institutions/enrich-details?institutionId=123
 *
 * Fetch enriched institution details for the dashboard
 * - Returns institution with all contacts, links, and identities
 * - Cached for 1 hour
 */

import { NextRequest, NextResponse } from "next/server";
import { getEnrichedInstitutionDetails } from "@/server/services/contact-enrichment.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const institutionIdStr = searchParams.get("institutionId");

    if (!institutionIdStr) {
      return NextResponse.json(
        {
          success: false,
          error: "institutionId query parameter is required",
        },
        { status: 400 }
      );
    }

    const institutionId = parseInt(institutionIdStr, 10);
    if (isNaN(institutionId)) {
      return NextResponse.json(
        {
          success: false,
          error: "institutionId must be a valid number",
        },
        { status: 400 }
      );
    }

    const details = await getEnrichedInstitutionDetails(institutionId);

    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: "Institution not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: details,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/institutions/enrich-details] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
