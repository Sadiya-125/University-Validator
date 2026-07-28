/**
 * Identity graph for institution matching
 *
 * Manages the linking between canonical institutions and their external identities
 * across multiple registries (AICTE, UGC, AISHE, WIKIDATA, etc.).
 *
 * Core operations:
 * - linkIdentity: Record an identity from a registry source
 * - mergeInstitutions: Merge two institutions (from → to), updating all links
 * - refreshAliasView: Materialize the aliases view for fast lookups
 *
 * Invariant: NEVER overwrite a different source's institution name.
 * Each source can only contribute one canonical name per institution.
 */

import { sql } from "drizzle-orm";
import { db, dbPooled } from "@/server/db";
import { institutionIdentities } from "@/server/db/schema";

/**
 * Identity link record
 */
export interface IdentityLink {
  id: number;
  institutionId: number;
  source: string; // AICTE, UGC, AISHE, etc.
  externalId: string; // Registry's unique identifier
  nameAsSource: string; // Name as it appears in the registry
  normalizedName: string; // Normalized for matching
  matchScore?: number; // 0.0-1.0 from resolver
  matchMethod?: string; // "trigram", "vector", "exact", etc.
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Link an external identity to a canonical institution
 *
 * Upserts the identity record. If the identity already exists for this
 * institution+source+externalId combination, updates it. Otherwise creates new.
 *
 * IMPORTANT: Does NOT overwrite a different source's name.
 * If a different source has already claimed this institution, we only add
 * another identity link, we don't change the canonical name.
 *
 * @param institutionId - The canonical institution ID
 * @param identity - Identity details from the registry
 * @returns The created or updated identity link
 */
export async function linkIdentity(
  institutionId: number,
  {
    source,
    externalId,
    nameAsSource,
    normalizedName,
    matchScore,
    matchMethod,
  }: {
    source: string;
    externalId: string;
    nameAsSource: string;
    normalizedName: string;
    matchScore?: number;
    matchMethod?: string;
  }
): Promise<IdentityLink> {
  // Upsert: try update first, then insert if not found
  const result = await dbPooled.execute(sql`
    INSERT INTO institution_identities
      (institution_id, source, external_id, name_as_source, normalized_name, match_score, match_method)
    VALUES
      (${institutionId}, ${source}, ${externalId}, ${nameAsSource}, ${normalizedName}, ${matchScore || null}, ${matchMethod || null})
    ON CONFLICT (institution_id, source, external_id)
    DO UPDATE SET
      name_as_source = ${nameAsSource},
      normalized_name = ${normalizedName},
      match_score = ${matchScore || null},
      match_method = ${matchMethod || null},
      updated_at = NOW()
    RETURNING
      id,
      institution_id as institutionId,
      source,
      external_id as externalId,
      name_as_source as nameAsSource,
      normalized_name as normalizedName,
      match_score as matchScore,
      match_method as matchMethod,
      created_at as createdAt,
      updated_at as updatedAt
  `);

  if (!result || result.length === 0) {
    throw new Error(
      `Failed to link identity for institution ${institutionId}`
    );
  }

  return result[0] as IdentityLink;
}

/**
 * Merge two institutions (from → to)
 *
 * Repoints all identities, evidence, and validation runs from the source
 * institution to the target institution. This is used when duplicate
 * institutions are discovered and need to be consolidated.
 *
 * Operations:
 * 1. Update all institution_identities pointing from → to
 * 2. Update all validation_runs pointing from → to
 * 3. Update all evidence pointing from → to (via validation_runs)
 * 4. Write an audit_log entry documenting the merge
 * 5. Delete the source institution (cascades delete identities/runs)
 * 6. Refresh the aliases view
 *
 * @param fromId - Source institution ID (will be deleted)
 * @param toId - Target institution ID (will receive all links)
 * @returns True if merge successful
 */
export async function mergeInstitutions(
  fromId: number,
  toId: number
): Promise<boolean> {
  try {
    await dbPooled.transaction(async (tx) => {
      // 1. Repoint identities
      await tx.execute(sql`
        UPDATE institution_identities
        SET institution_id = ${toId}
        WHERE institution_id = ${fromId}
      `);

      // 2. Repoint validation runs
      await tx.execute(sql`
        UPDATE validation_runs
        SET institution_id = ${toId}
        WHERE institution_id = ${fromId}
      `);

      // 3. Log the merge in audit_log
      await tx.execute(sql`
        INSERT INTO audit_log
          (table_name, row_id, action, before_value, after_value, reason)
        VALUES
          (
            'institutions',
            ${fromId},
            'MERGE',
            jsonb_build_object('id', ${fromId}, 'merged_into', ${toId}),
            jsonb_build_object('id', ${toId}, 'received_identities', true),
            'Merged duplicate institution'
          )
      `);

      // 4. Delete the source institution (cascades)
      await tx.execute(sql`
        DELETE FROM institutions WHERE id = ${fromId}
      `);

      // 5. Refresh the aliases view
      await refreshAliasView(tx);
    });

    return true;
  } catch (error) {
    console.error(`Failed to merge institutions ${fromId} → ${toId}:`, error);
    return false;
  }
}

/**
 * Refresh the institution_aliases materialized view
 *
 * This view collects all alternative names (from identities) for each
 * institution, enabling fast substring and trigram searches.
 *
 * Materialized view definition (should be in migrations):
 * ```sql
 * CREATE MATERIALIZED VIEW institution_aliases AS
 * SELECT
 *   i.id as institution_id,
 *   i.canonical_name,
 *   i.normalized_name,
 *   ii.source,
 *   ii.name_as_source,
 *   ii.normalized_name as identity_normalized_name
 * FROM institutions i
 * LEFT JOIN institution_identities ii ON i.id = ii.institution_id;
 *
 * CREATE UNIQUE INDEX idx_institution_aliases ON institution_aliases(institution_id, source, name_as_source);
 * CREATE INDEX idx_institution_aliases_normalized ON institution_aliases USING gin(identity_normalized_name gin_trgm_ops);
 * ```
 */
export async function refreshAliasView(
  tx?: any
): Promise<void> {
  const executor = tx || db;

  try {
    await executor.execute(
      sql`REFRESH MATERIALIZED VIEW CONCURRENTLY institution_aliases`
    );
  } catch (error) {
    // View might not exist yet (during initial setup)
    // This is non-fatal, skip silently
    console.debug("Could not refresh institution_aliases view:", error);
  }
}

/**
 * Get all identities for an institution
 */
export async function getInstitutionIdentities(
  institutionId: number
): Promise<IdentityLink[]> {
  const result = await db.execute(sql<IdentityLink>`
    SELECT
      id,
      institution_id as institutionId,
      source,
      external_id as externalId,
      name_as_source as nameAsSource,
      normalized_name as normalizedName,
      match_score as matchScore,
      match_method as matchMethod,
      created_at as createdAt,
      updated_at as updatedAt
    FROM institution_identities
    WHERE institution_id = ${institutionId}
    ORDER BY source, created_at DESC
  `);

  return result;
}

/**
 * Find institutions by identity source and external ID
 * Fast lookup when you know the registry source + external ID
 */
export async function findInstitutionByIdentity(
  source: string,
  externalId: string
): Promise<{ institutionId: number } | null> {
  const result = await db.execute(sql<{ institutionId: number }>`
    SELECT institution_id as institutionId
    FROM institution_identities
    WHERE source = ${source}
      AND external_id = ${externalId}
    LIMIT 1
  `);

  return result[0] || null;
}

/**
 * Get alternative names (aliases) for an institution
 * Includes all names from identities across all sources
 */
export async function getInstitutionAliases(
  institutionId: number
): Promise<string[]> {
  const result = await db.execute(
    sql<{ name: string }>`
      SELECT DISTINCT name_as_source as name
      FROM institution_identities
      WHERE institution_id = ${institutionId}
      ORDER BY name_as_source
    `
  );

  return result.map((row) => row.name);
}

/**
 * Unlink a specific identity from an institution
 * Use with caution - removing the only identity will strand an institution
 */
export async function unlinkIdentity(identityId: number): Promise<boolean> {
  try {
    await dbPooled.execute(sql`
      DELETE FROM institution_identities
      WHERE id = ${identityId}
    `);
    return true;
  } catch (error) {
    console.error(`Failed to unlink identity ${identityId}:`, error);
    return false;
  }
}

/**
 * Check if an institution has identities from a specific source
 */
export async function hasSourceIdentity(
  institutionId: number,
  source: string
): Promise<boolean> {
  const result = await db.execute(
    sql<{ count: number }>`
      SELECT COUNT(*) as count
      FROM institution_identities
      WHERE institution_id = ${institutionId}
        AND source = ${source}
    `
  );

  return (result[0]?.count ?? 0) > 0;
}

/**
 * Get the canonical name from the authoritative source
 * Priority order: INI > AICTE > UGC > AISHE > WIKIDATA > others
 */
export async function getCanonicalNameFromIdentities(
  institutionId: number
): Promise<string | null> {
  const sourceOrder = ["INI", "AICTE", "UGC", "AISHE", "WIKIDATA", "NAD"];

  for (const source of sourceOrder) {
    const result = await db.execute(
      sql<{ name: string }>`
        SELECT name_as_source as name
        FROM institution_identities
        WHERE institution_id = ${institutionId}
          AND source = ${source}
        LIMIT 1
      `
    );

    if (result.length > 0) {
      return result[0].name;
    }
  }

  return null;
}
