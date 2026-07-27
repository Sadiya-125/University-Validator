/**
 * Registry lookup utilities.
 * Queries PUBLISHED snapshots to find matching institutions.
 * Optimized for <150ms queries on 200k rows.
 */

import { db } from "@/server/db/client";
import { registryEntries, registrySnapshots, SourceCode } from "@/server/db/schema";
import { eq, and, ilike, sql, inArray } from "drizzle-orm";

export interface LookupOptions {
  /** Maximum number of results to return (default: 100) */
  limit?: number;

  /** Filter by specific authority code(s) */
  codes?: string[];
}

export interface RegistryMatch {
  code: string;
  externalId: string;
  canonicalName: string;
}

/**
 * Look up institutions by normalized name in PUBLISHED registries.
 *
 * Uses LIKE matching on canonical_name.
 * Returns entries from published snapshots.
 *
 * @param normalizedName - Normalized institution name
 * @param options - Lookup options
 * @returns Array of matching registry entries
 */
export async function lookupInRegistries(
  normalizedName: string,
  options: LookupOptions = {}
): Promise<RegistryMatch[]> {
  const limit = options.limit ?? 100;

  // Build where conditions
  const conditions = [eq(registrySnapshots.state, "published")];

  if (normalizedName) {
    conditions.push(ilike(registryEntries.canonicalName, `%${normalizedName}%`));
  }

  if (options.codes && options.codes.length > 0) {
    const codesStr = options.codes.map((c) => `'${c.toUpperCase()}'`).join(",");
    conditions.push(sql.raw(`"code"::text IN (${codesStr})`));
  }

  // Build and execute query
  const results = await db!
    .select({
      code: registrySnapshots.code,
      externalId: registryEntries.externalId,
      canonicalName: registryEntries.canonicalName,
    })
    .from(registryEntries)
    .innerJoin(registrySnapshots, eq(registryEntries.snapshotId, registrySnapshots.id))
    .where(and(...conditions))
    .limit(limit);

  return results.map((r) => ({
    code: r.code,
    externalId: r.externalId,
    canonicalName: r.canonicalName ?? "",
  }));
}

/**
 * Look up a single institution by external ID and authority code.
 * Returns the entry from the published snapshot.
 */
export async function lookupByExternalId(
  authorityCode: string,
  externalId: string
): Promise<RegistryMatch | null> {
  // Validate authority code is a known enum value
  const validCodes = Object.values(SourceCode) as string[];
  if (!validCodes.includes(authorityCode.toUpperCase())) {
    return null;
  }

  const result = await db!
    .select({
      code: registrySnapshots.code,
      externalId: registryEntries.externalId,
      canonicalName: registryEntries.canonicalName,
    })
    .from(registryEntries)
    .innerJoin(registrySnapshots, eq(registryEntries.snapshotId, registrySnapshots.id))
    .where(
      and(
        eq(registrySnapshots.state, "published"),
        eq(registrySnapshots.code, authorityCode.toUpperCase() as any),
        eq(registryEntries.externalId, externalId)
      )
    )
    .limit(1);

  if (!result[0]) return null;

  return {
    code: result[0].code,
    externalId: result[0].externalId,
    canonicalName: result[0].canonicalName ?? "",
  };
}

/**
 * Get statistics about published registries.
 * Returns row counts per authority code.
 */
export async function getRegistryStats(): Promise<Map<string, number>> {
  const stats = await db!
    .select({
      code: registrySnapshots.code,
      count: sql<number>`count(${registryEntries.id})`,
    })
    .from(registryEntries)
    .innerJoin(registrySnapshots, eq(registryEntries.snapshotId, registrySnapshots.id))
    .where(eq(registrySnapshots.state, "published"))
    .groupBy(registrySnapshots.code);

  return new Map(stats.map((s) => [s.code, s.count]));
}
