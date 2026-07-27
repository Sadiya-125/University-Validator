/**
 * Institution queries.
 * Typed modules for institution lookups and updates.
 */

import { and, eq, ilike, or, gte, lte } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { institutions, institutionIdentities, institutionContacts, institutionLinks } from "@/server/db/schema";

export interface InstitutionFilters {
  type?: string;
  state?: string;
  verdict?: string;
  namePattern?: string;
}

/**
 * Get an institution by ID with all related data.
 */
export async function getInstitutionById(id: number) {
  const db = getDb();

  const institution = await db.query.institutions.findFirst({
    where: eq(institutions.id, id),
    with: {
      identities: {
        columns: {
          source: true,
          externalId: true,
          nameAsSource: true,
        },
      },
      contacts: true,
      links: true,
    },
  });

  return institution;
}

/**
 * Find institutions by normalized name (trigram search).
 * Returns top N matches by similarity.
 */
export async function findInstitutionsByName(name: string, limit: number = 10) {
  const db = getDb();

  const results = await db
    .select()
    .from(institutions)
    .where(ilike(institutions.normalizedName, `%${name}%`))
    .limit(limit);

  return results;
}

/**
 * Find institutions by slug (exact match).
 */
export async function getInstitutionBySlug(slug: string) {
  const db = getDb();

  const institution = await db.query.institutions.findFirst({
    where: eq(institutions.slug, slug),
    with: {
      identities: true,
      contacts: true,
      links: true,
    },
  });

  return institution;
}

/**
 * List institutions with pagination and filtering.
 */
export async function listInstitutions(
  filters: InstitutionFilters & { limit?: number; offset?: number } = {}
) {
  const db = getDb();
  const { type, state, verdict, namePattern, limit = 20, offset = 0 } = filters;

  const conditions: any[] = [];

  if (type) conditions.push(eq(institutions.type as any, type));
  if (state) conditions.push(eq(institutions.state as any, state));
  if (verdict) conditions.push(eq(institutions.verdict as any, verdict));
  if (namePattern) {
    conditions.push(ilike(institutions.normalizedName, `%${namePattern}%`));
  }

  const results = await db
    .select()
    .from(institutions)
    .where(and(...conditions))
    .orderBy(institutions.lastValidatedAt)
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Create or update an institution.
 */
export async function upsertInstitution(
  data: Partial<typeof institutions.$inferInsert> & { id?: number }
) {
  const db = getDb();
  // Implement upsert logic here
  // This is a placeholder; actual implementation depends on Drizzle version
  return null;
}

/**
 * Get institution identities by source.
 */
export async function getIdentitiesBySource(
  institutionId: number,
  source: string
) {
  const db = getDb();

  const identities = await db
    .select()
    .from(institutionIdentities)
    .where(
      and(
        eq(institutionIdentities.institutionId, institutionId),
        eq(institutionIdentities.source as any, source)
      )
    );

  return identities;
}

/**
 * Link an identity to an institution.
 */
export async function linkIdentity(
  institutionId: number,
  source: string,
  externalId: string,
  nameAsSource: string,
  normalizedName: string,
  data?: Partial<typeof institutionIdentities.$inferInsert>
) {
  const db = getDb();

  // Upsert: if exists, update; otherwise, insert
  const existing = await db
    .select()
    .from(institutionIdentities)
    .where(
      and(
        eq(institutionIdentities.institutionId, institutionId),
        eq(institutionIdentities.source as any, source),
        eq(institutionIdentities.externalId, externalId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    return await db
      .update(institutionIdentities)
      .set({
        nameAsSource,
        normalizedName,
        ...data,
      })
      .where(
        and(
          eq(institutionIdentities.institutionId, institutionId),
          eq(institutionIdentities.source as any, source),
          eq(institutionIdentities.externalId, externalId)
        )
      );
  } else {
    // Insert new
    return await db.insert(institutionIdentities).values({
      institutionId,
      source: source as any,
      externalId,
      nameAsSource,
      normalizedName,
      ...data,
    });
  }
}
