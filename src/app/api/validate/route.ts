/**
 * POST /api/validate
 *
 * Initiate institution validation with 1200ms budget.
 *
 * Behavior:
 * - If L1 cache hit: return verdict immediately (fast path)
 * - If L1 miss: queue to Inngest and return runId (async path)
 * - Timeout: return runId for polling (safe fallback)
 *
 * Body: { normalizedName: string; maxTier?: string; priority?: "low" | "normal" | "high" }
 *
 * Response:
 * - Fast path (200 OK): { success: true; verdict: string; score: number; cached: true; runId: string }
 * - Async path (202 Accepted): { success: true; runId: string; cached: false; validationUrl: string }
 * - Error (400/500): { success: false; error: string; code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql, eq, inArray } from "drizzle-orm";
import { requestValidation } from "@/inngest";
import { validate } from "@/server/services/validation.service";
import { enrichInstitution, getRegistryAttributes } from "@/server/services/enrichment.service";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/cache/redis";
import { institutions, institutionIdentities, authorities, registrySnapshots, registryEntries } from "@/server/db/schema";
import { randomUUID } from "crypto";

/**
 * Calculate confidence score based on profile completeness and verdict
 */
function calculateConfidence(
  verdict: string,
  profile: any,
  authorities: any[]
): number {
  let confidence = 0.5; // Base confidence

  // Verdict strength (genuine/likely_genuine vs unknown/unverified)
  if (verdict === "genuine" || verdict === "Genuine") {
    confidence += 0.3;
  } else if (verdict === "likely_genuine" || verdict === "Likely Genuine") {
    confidence += 0.2;
  } else if (verdict === "NEEDS_REVIEW" || verdict === "Needs Review") {
    confidence += 0.05;
  }

  // Profile completeness
  if (profile) {
    const contactFields = [
      profile.email,
      profile.phone,
      profile.website,
      profile.address,
    ].filter((f) => f).length;
    const locationFields = [
      profile.state,
      profile.city,
      profile.district,
    ].filter((f) => f).length;

    // Add points for each contact field (up to 0.1)
    confidence += (contactFields / 4) * 0.1;
    // Add points for location fields (up to 0.1)
    confidence += (locationFields / 3) * 0.1;
  }

  // Authority matches
  if (authorities && authorities.length > 0) {
    confidence += Math.min(0.1, authorities.length * 0.05);
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Fetch authorities for an institution by normalized name
 */
async function fetchAuthoritiesForInstitution(db: any, normalizedName: string) {
  try {
    // First try institutions table
    const inst = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.normalizedName, normalizedName))
      .limit(1);

    if (inst.length > 0) {
      // Get identities/authorities for this institution
      const identities = await db
        .select({
          source: institutionIdentities.source,
          authName: authorities.display_name,
        })
        .from(institutionIdentities)
        .leftJoin(authorities, eq(institutionIdentities.source, authorities.authority_code))
        .where(eq(institutionIdentities.institutionId, inst[0].id));

      return identities.map((row: any) => ({
        name: row.authName || row.source,
        code: row.source,
        found: true,
        snapshotDate: new Date().toISOString().split('T')[0],
        rowCount: 0,
      }));
    }

    // Fallback: check registry_entries for raw data
    const regEntries = await db
      .select({
        code: registryEntries.code,
      })
      .from(registryEntries)
      .where(eq(registryEntries.normalizedName, normalizedName))
      .limit(10);

    if (regEntries.length > 0) {
      const codes = [...new Set(regEntries.map((r: any) => r.code))];
      const auths = await db
        .select({
          code: registrySnapshots.code,
          name: authorities.display_name,
          validTo: registrySnapshots.validTo,
        })
        .from(registrySnapshots)
        .leftJoin(authorities, eq(registrySnapshots.code, authorities.authority_code))
        .where(inArray(registrySnapshots.code, codes as any));

      return auths.map((row: any) => ({
        name: row.name || row.code,
        code: row.code,
        found: true,
        snapshotDate: row.validTo ? new Date(row.validTo).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        rowCount: 0,
      }));
    }

    return [];
  } catch (error) {
    console.error("[fetchAuthoritiesForInstitution] Error:", error);
    return [];
  }
}

/**
 * Request schema
 */
const ValidateRequestSchema = z.object({
  normalizedName: z.string().min(1, "Institution name required"),
  maxTier: z
    .enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"])
    .optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Response schema (fast path)
 */
const FastPathResponseSchema = z.object({
  success: z.literal(true),
  verdict: z.string(),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  cached: z.literal(true),
  runId: z.string(),
  cachedAt: z.date().optional(),
  source: z.string().optional(),
});

/**
 * Response schema (async path)
 */
const AsyncPathResponseSchema = z.object({
  success: z.literal(true),
  runId: z.string(),
  cached: z.literal(false),
  validationUrl: z.string(),
  statusUrl: z.string(),
  streamUrl: z.string(),
  estimatedTime: z.number(), // milliseconds
});

/**
 * Error response schema
 */
const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  details: z.any().optional(),
});

/**
 * POST /api/validate - Main validation endpoint
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const budgetMs = 1200; // 1200ms budget for fast path attempt
  const runId = randomUUID();

  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = ValidateRequestSchema.parse(body);
    const { normalizedName, maxTier = "finalize", priority = "normal", tags = {} } = validated;

    // Normalize input
    const normalized = normalizedName.toLowerCase().trim();

    // Attempt fast path with budget
    const fastPathResult = await Promise.race([
      (async () => {
        const db = getDb()!;
        const redis = getRedis();

        // Run validation with fast tier limit
        return validate(normalized, {
          runId,
          maxTier: "mirror",
          redis: {
            get: async (key: string) => (await redis.get(key)) as string | null,
            setex: async (key: string, ttlSec: number, value: string) => {
              await (redis as any).setex(key, ttlSec, value);
            },
          },
        });
      })(),
      // Timeout after budget
      new Promise<{ success: false; timedOut: true }>((resolve) => {
        setTimeout(() => {
          resolve({ success: false, timedOut: true });
        }, budgetMs);
      }),
    ]);

    // Fast path: verdict returned within budget
    if (fastPathResult.success && !("timedOut" in fastPathResult)) {
      const elapsedMs = Date.now() - startTime;
      const db = getDb()!;

      // Fetch authorities and enrich profile data in parallel
      const [authorities, profile, registryAttrs] = await Promise.all([
        fetchAuthoritiesForInstitution(db, normalized),
        enrichInstitution(normalized, false),
        getRegistryAttributes(normalized),
      ]);

      // Calculate confidence based on data completeness
      const confidence = calculateConfidence(
        fastPathResult.data.verdict,
        profile,
        authorities
      );

      return NextResponse.json(
        {
          id: runId,
          institutionName: normalized,
          verdict: fastPathResult.data.verdict,
          confidence: confidence,
          status: "completed",
          responseTime: elapsedMs,
          source: "cache",
          evidence: [],
          runs: [],
          authorities: authorities,
          profile: profile,
          registryAttributes: registryAttrs,
        },
        { status: 200 }
      );
    }

    // Async path: queue to Inngest and return runId for polling
    const inngestResult = await requestValidation(normalized, {
      maxTier,
      priority,
      tags,
    });

    const baseUrl = request.nextUrl.origin;

    return NextResponse.json(
      {
        success: true,
        runId,
        cached: false,
        validationUrl: `${baseUrl}/api/validate/${runId}`,
        statusUrl: `${baseUrl}/api/validate/${runId}/status`,
        streamUrl: `${baseUrl}/api/stream/${runId}`,
        estimatedTime: 5000, // 5s estimated for full validation
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[POST /api/validate] Error:", error);

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

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message || "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/validate - CORS preflight
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
