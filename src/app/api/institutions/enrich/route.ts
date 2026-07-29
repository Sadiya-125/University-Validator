/**
 * POST /api/institutions/enrich
 *
 * Trigger contact enrichment for an institution
 * - Search registry entries for URLs
 * - Fetch and extract contact details
 * - Populate database tables
 * - Cache enriched data for dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  enrichRegistryEntryContacts,
  enrichRegistryEntriesByAuthority,
  enrichRegistryEntriesByName,
  enrichInstitutionsMissingContacts,
  getEnrichedInstitutionDetails,
} from "@/server/services/contact-enrichment.service";

const EnrichRequestSchema = z.object({
  action: z.enum(["enrich_entry", "enrich_authority", "enrich_missing", "enrich_by_name"]),
  registryEntryId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }
      return val;
    }),
  authorityCode: z.string().optional(),
  institutionId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }
      return val;
    }),
  institutionName: z.string().optional(),
  limit: z.number().default(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, registryEntryId, authorityCode, institutionId, institutionName, limit } =
      EnrichRequestSchema.parse(body);

    let result: any = { success: false };

    if (action === "enrich_entry" && registryEntryId) {
      // Enrich single registry entry
      const details = await enrichRegistryEntryContacts(registryEntryId);
      result = {
        success: true,
        action: "enrich_entry",
        details,
      };
    } else if (action === "enrich_authority" && authorityCode) {
      // Enrich all entries for an authority
      const enrichResult = await enrichRegistryEntriesByAuthority(authorityCode, limit);
      result = {
        success: true,
        action: "enrich_authority",
        ...enrichResult,
      };
    } else if (action === "enrich_missing") {
      // Enrich institutions missing contacts
      const enrichedCount = await enrichInstitutionsMissingContacts(limit);
      result = {
        success: true,
        action: "enrich_missing",
        enrichedCount,
      };
    } else if (action === "enrich_by_name" && institutionName) {
      // Enrich registry entries for a specific institution by name
      const normalizedName = institutionName.toLowerCase().trim();
      const enrichResult = await enrichRegistryEntriesByName(normalizedName, limit || 50);
      result = {
        success: true,
        action: "enrich_by_name",
        institutionName: normalizedName,
        ...enrichResult,
      };
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid action or missing required parameters",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[POST /api/institutions/enrich] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
