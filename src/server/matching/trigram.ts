/**
 * Trigram-based similarity search for institution matching
 *
 * Uses PostgreSQL's pg_trgm extension with GIN indexes for efficient
 * similarity matching across institution names in multiple registries.
 *
 * Trigram similarity: breaks text into 3-character overlapping substrings
 * and compares sets to calculate similarity score (0.0 to 1.0).
 * Threshold: 0.35 (default PostgreSQL threshold for meaningful matches)
 *
 * Pure function with no side effects. Uses database indexes efficiently.
 * Uses ONE UNION ALL query across institutions, institution_identities, and
 * registry_entries tables for efficiency.
 */

import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Candidate result from trigram similarity search
 */
export interface TrigramCandidate {
  id: number;
  type: "institution" | "identity" | "registry";
  name: string;
  normalizedName: string;
  source?: string; // For identity and registry entries
  externalId?: string; // For registry entries
  similarity: number;
}

/**
 * Find candidates matching input names using trigram similarity
 *
 * Searches across:
 * - institutions table (canonical and normalized names)
 * - institution_identities table (identity records with source tracking)
 * - registry_entries table (raw registry data)
 *
 * Uses ONE UNION ALL query with GIN indexes for efficiency.
 * Threshold: similarity > 0.35 (PostgreSQL pg_trgm default)
 *
 * @param params.names - Array of normalized names to match
 * @param params.sources - Optional array of registry sources to filter by (e.g., 'AICTE', 'UGC')
 * @param params.limit - Max number of candidates per name (default 50)
 * @returns Array of matching candidates, sorted by similarity (highest first)
 */
export async function findTrigramCandidates({
  names,
  sources,
  limit = 50,
}: {
  names: string[];
  sources?: string[];
  limit?: number;
}): Promise<TrigramCandidate[]> {
  if (names.length === 0) {
    return [];
  }

  const searchName = names[0];

  // Build UNION ALL query across three tables
  // Each union branch searches one table with trigram similarity > 0.35
  // The GIN indexes created on normalized_name columns enable fast queries
  const query = sql<{
    id: number;
    type: string;
    name: string;
    normalized_name: string;
    source: string | null;
    external_id: string | null;
    similarity_score: number;
  }>`
    SELECT * FROM (
      -- Branch 1: institutions table
      SELECT
        i.id,
        'institution'::text as type,
        i.canonical_name as name,
        i.normalized_name,
        NULL::text as source,
        NULL::text as external_id,
        similarity(i.normalized_name, ${searchName}) as similarity_score
      FROM institutions i
      WHERE similarity(i.normalized_name, ${searchName}) > 0.35
        AND i.deleted_at IS NULL

      UNION ALL

      -- Branch 2: institution_identities table
      SELECT
        ii.id,
        'identity'::text as type,
        ii.name_as_source as name,
        ii.normalized_name,
        ii.source::text as source,
        ii.external_id,
        similarity(ii.normalized_name, ${searchName}) as similarity_score
      FROM institution_identities ii
      WHERE similarity(ii.normalized_name, ${searchName}) > 0.35

      UNION ALL

      -- Branch 3: registry_entries table
      SELECT
        re.id,
        'registry'::text as type,
        re.canonical_name as name,
        COALESCE(re.canonical_name, re.normalized_name) as normalized_name,
        re.authority_code::text as source,
        re.external_id,
        similarity(
          COALESCE(re.canonical_name, re.normalized_name),
          ${searchName}
        ) as similarity_score
      FROM registry_entries re
      WHERE (
        similarity(re.canonical_name, ${searchName}) > 0.35
        OR similarity(re.normalized_name, ${searchName}) > 0.35
      )
      ${sources && sources.length > 0 ? sql`AND re.authority_code = ANY(${sources}::text[])` : sql``}
    ) candidates
    ORDER BY similarity_score DESC
    LIMIT ${limit}
  `;

  const results = await db.execute(query);

  return results.map((row) => ({
    id: row.id,
    type: row.type as "institution" | "identity" | "registry",
    name: row.name,
    normalizedName: row.normalized_name,
    source: row.source || undefined,
    externalId: row.external_id || undefined,
    similarity: row.similarity_score,
  }));
}

/**
 * Find trigram similarity between two strings
 *
 * Directly calls PostgreSQL similarity() function.
 * Returns value between 0.0 (completely different) and 1.0 (identical).
 *
 * @param text1 - First string to compare
 * @param text2 - Second string to compare
 * @returns Similarity score (0.0 to 1.0)
 */
export async function calculateSimilarity(
  text1: string,
  text2: string
): Promise<number> {
  const result = await db.execute(
    sql<{ similarity: number }>`SELECT similarity(${text1}, ${text2}) as similarity`
  );

  return result[0]?.similarity ?? 0;
}

/**
 * Batch search multiple names
 *
 * @param params.queries - Array of { name, sources? } to search
 * @param params.limit - Max candidates per query
 * @returns Map of query index to candidates
 */
export async function findTrigramCandidatesBatch({
  queries,
  limit = 50,
}: {
  queries: Array<{ name: string; sources?: string[] }>;
  limit?: number;
}): Promise<Map<number, TrigramCandidate[]>> {
  const results = new Map<number, TrigramCandidate[]>();

  // Run each query sequentially to avoid connection pool exhaustion
  for (let i = 0; i < queries.length; i++) {
    const { name, sources } = queries[i];
    const candidates = await findTrigramCandidates({
      names: [name],
      sources,
      limit,
    });
    results.set(i, candidates);
  }

  return results;
}

/**
 * Check if a similarity score meets the threshold for acceptance
 *
 * @param similarity - Similarity score (0.0 to 1.0)
 * @param threshold - Minimum acceptable similarity (default 0.35)
 * @returns True if similarity meets threshold
 */
export function meetsThreshold(similarity: number, threshold = 0.35): boolean {
  return similarity >= threshold;
}
