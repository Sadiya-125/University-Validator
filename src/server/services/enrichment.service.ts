/**
 * Institution Data Enrichment Service
 *
 * Enriches validation results with profile data from:
 * 1. Database (registry_entries, institution_identities)
 * 2. Searxng (fallback for missing contact info)
 */

import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/cache/redis";
import { eq, ilike } from "drizzle-orm";
import {
  registryEntries,
  institutions,
  institutionIdentities,
  institutionContacts,
} from "@/server/db/schema";
import { getSearchFactory } from "@/server/search/factory";

export interface InstitutionProfile {
  officialName?: string;
  affiliatedUniversity?: string;
  type?: string;
  state?: string;
  city?: string;
  district?: string;
  address?: string;
  website?: string;
  email?: string;
  phone?: string;
  primaryMobileNumber?: string;
  secondaryMobileNumber?: string;
  attributes?: Record<string, any>;
  sources?: Array<{
    authority: string;
    website?: string;
    email?: string;
    phone?: string;
    address?: string;
  }>;
}

/**
 * Fetch institution profile from database
 */
async function fetchProfileFromDatabase(
  normalizedName: string
): Promise<InstitutionProfile | null> {
  try {
    const db = getDb();

    // First try canonical institutions table
    const inst = await db
      .select()
      .from(institutions)
      .where(eq(institutions.normalizedName, normalizedName))
      .limit(1);

    if (inst.length > 0) {
      const institution = inst[0]!;

      // Get all identities for this institution
      const identities = await db
        .select()
        .from(institutionIdentities)
        .where(eq(institutionIdentities.institutionId, institution.id));

      return {
        officialName: institution.canonicalName,
        type: institution.type,
        state: institution.state || undefined,
        city: undefined,
        district: undefined,
        address: institution.address || undefined,
        website: institution.website || undefined,
        attributes: {
          institutionId: institution.id,
          slug: institution.slug,
          lastValidatedAt: institution.lastValidatedAt,
          validUntil: institution.validUntil,
        },
        sources: identities.map((id) => ({
          authority: id.source,
          website: undefined,
          email: undefined,
          phone: undefined,
          address: undefined,
        })),
      };
    }

    // Fallback: check registry_entries for raw data
    const regEntries = await db
      .select()
      .from(registryEntries)
      .where(eq(registryEntries.normalizedName, normalizedName))
      .limit(5);

    if (regEntries.length > 0) {
      // Merge attributes from all entries to get complete data
      let mergedAttrs: Record<string, any> = {};
      let officialName: string | undefined = undefined;
      const sources = [];

      for (const entry of regEntries) {
        const attrs = entry.attributes as Record<string, any> | null;
        if (attrs) {
          // Extract contact info from various possible attribute names
          const extractedAttrs = {
            state: attrs.state || attrs.State || attrs.state_name || undefined,
            city: attrs.city || attrs.City || attrs.city_name || undefined,
            district: attrs.district || attrs.District || attrs.district_name || undefined,
            address: attrs.address || attrs.Address || attrs.address_text || attrs.full_address || undefined,
            website: attrs.website || attrs.Website || attrs.url || attrs.official_website || undefined,
            email: attrs.email || attrs.Email || attrs.email_address || undefined,
            phone: attrs.phone || attrs.Phone || attrs.phone_number || attrs.primary_phone || undefined,
            primaryMobileNumber: attrs.primary_mobile || attrs.primaryMobileNumber || attrs.mobile || undefined,
            secondaryMobileNumber: attrs.secondary_mobile || attrs.secondaryMobileNumber || undefined,
            affiliatedUniversity: attrs.affiliated_university || attrs.university || undefined,
            type: attrs.type || attrs.Type || undefined,
            zip: attrs.zip || attrs.pincode || attrs.postal_code || undefined,
          };

          mergedAttrs = { ...mergedAttrs, ...extractedAttrs };
        }
        if (!officialName && entry.canonicalName) {
          officialName = entry.canonicalName;
        }

        // Add source info
        sources.push({
          authority: entry.code,
          website: mergedAttrs?.website,
          email: mergedAttrs?.email,
          phone: mergedAttrs?.phone,
          address: mergedAttrs?.address,
        });
      }

      return {
        officialName: officialName || undefined,
        state: mergedAttrs?.state || undefined,
        city: mergedAttrs?.city || undefined,
        district: mergedAttrs?.district || undefined,
        address: mergedAttrs?.address || undefined,
        website: mergedAttrs?.website || undefined,
        email: mergedAttrs?.email || undefined,
        phone: mergedAttrs?.phone || undefined,
        primaryMobileNumber: mergedAttrs?.primaryMobileNumber || undefined,
        secondaryMobileNumber: mergedAttrs?.secondaryMobileNumber || undefined,
        affiliatedUniversity: mergedAttrs?.affiliatedUniversity || undefined,
        type: mergedAttrs?.type || undefined,
        attributes: mergedAttrs || {},
        sources,
      };
    }

    return null;
  } catch (error) {
    console.error("[fetchProfileFromDatabase] Error:", error);
    return null;
  }
}

/**
 * Fetch missing contact info from Searxng
 */
async function enrichWithSearchEngine(
  institutionName: string,
  existingProfile: InstitutionProfile
): Promise<InstitutionProfile> {
  try {
    // Check if we need enrichment for any field
    const needsEnrichment =
      !existingProfile.website ||
      !existingProfile.email ||
      !existingProfile.phone ||
      !existingProfile.address ||
      !existingProfile.city ||
      !existingProfile.state;

    if (!needsEnrichment) {
      return existingProfile;
    }

    const redis = getRedis();
    const cacheKey = `enrichment:${institutionName.toLowerCase()}`;

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached as string);
      return { ...existingProfile, ...cachedData };
    }

    console.log(
      `[enrichWithSearchEngine] Searching for missing info: ${institutionName}`
    );

    // Search for website, email, phone, address
    const searchFactory = getSearchFactory();
    const searchQueries = [
      `${institutionName} official website contact address`,
      `${institutionName} email phone address city state`,
      `${institutionName} college contact details`,
      `"${institutionName}" headquarters location`,
    ];

    let enrichedData: Partial<InstitutionProfile> = {};

    for (const query of searchQueries) {
      try {
        const response = await searchFactory.search(query);

        if (!response.results || response.results.length === 0) continue;

        // Extract contact info from search results
        for (const result of response.results) {
          const description = (result.description || "").toLowerCase();
          const title = (result.title || "").toLowerCase();
          const fullText = `${title} ${description}`;

          // Look for email
          if (!enrichedData.email) {
            const emailMatch = result.description?.match(
              /[\w\.-]+@[\w\.-]+\.\w+/g
            );
            if (emailMatch?.[0]) {
              enrichedData.email = emailMatch[0];
            }
          }

          // Look for phone (Indian format)
          if (!enrichedData.phone) {
            const phoneMatch = result.description?.match(/(?:\+91|0)?[\s.-]?[6-9]\d{2}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g);
            if (phoneMatch?.[0]) {
              enrichedData.phone = phoneMatch[0];
            }
          }

          // Look for website
          if (!enrichedData.website && result.url) {
            enrichedData.website = result.url;
          }

          // Look for address and location info from descriptions
          if (!enrichedData.address && result.description) {
            // Try to extract address patterns
            const addressPatterns = [
              /(?:address|located at|headquarters)[:\s]+([^,\n]+(?:[,][^,\n]+)?)/gi,
              /^(?:.*?(?:Hyderabad|Mumbai|Delhi|Bangalore|Pune|Chennai)[^,\n]*)/i,
            ];

            for (const pattern of addressPatterns) {
              const match = result.description.match(pattern);
              if (match) {
                enrichedData.address = match[1] || match[0];
                enrichedData.address = enrichedData.address.substring(0, 500);
                break;
              }
            }
          }

          // Look for city/state from patterns
          const cityStateMatch = fullText.match(
            /(Delhi|Mumbai|Hyderabad|Bangalore|Pune|Chennai|Kolkata|Ahmedabad|Chandigarh|Jaipur|Lucknow|Noida|Gurgaon|Bhopal|Indore|Surat|Vadodara)/i
          );
          if (cityStateMatch && !enrichedData.city) {
            enrichedData.city = cityStateMatch[1];
          }

          // Map city to state
          if (enrichedData.city && !enrichedData.state) {
            const cityToState: Record<string, string> = {
              'Delhi': 'Delhi',
              'Mumbai': 'Maharashtra',
              'Hyderabad': 'Telangana',
              'Bangalore': 'Karnataka',
              'Pune': 'Maharashtra',
              'Chennai': 'Tamil Nadu',
              'Kolkata': 'West Bengal',
              'Ahmedabad': 'Gujarat',
              'Chandigarh': 'Chandigarh',
              'Jaipur': 'Rajasthan',
              'Lucknow': 'Uttar Pradesh',
              'Noida': 'Uttar Pradesh',
              'Gurgaon': 'Haryana',
              'Bhopal': 'Madhya Pradesh',
              'Indore': 'Madhya Pradesh',
              'Surat': 'Gujarat',
              'Vadodara': 'Gujarat',
            };
            enrichedData.state = cityToState[enrichedData.city];
          }
        }

        // If we found most contact info, stop searching
        if (enrichedData.email && enrichedData.phone && enrichedData.website) {
          break;
        }
      } catch (error) {
        console.warn(`[enrichWithSearchEngine] Query failed: ${query}`, error);
      }
    }

    // Cache the enrichment for 7 days
    if (Object.keys(enrichedData).length > 0) {
      try {
        await redis.set(cacheKey, JSON.stringify(enrichedData));
        await redis.expire(cacheKey, 7 * 24 * 60 * 60);
      } catch (e) {
        // Cache failure is non-fatal
        console.warn("[enrichWithSearchEngine] Cache set failed:", e);
      }
    }

    return { ...existingProfile, ...enrichedData };
  } catch (error) {
    console.error("[enrichWithSearchEngine] Error:", error);
    return existingProfile;
  }
}

/**
 * Save enriched institution data to database
 */
export async function saveEnrichedInstitution(
  normalizedName: string,
  profile: InstitutionProfile
): Promise<void> {
  try {
    const db = getDb();

    // Check if institution already exists
    const existing = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.normalizedName, normalizedName))
      .limit(1);

    if (existing.length === 0 && profile.officialName) {
      // Create new institution record with all available data
      const result = await db
        .insert(institutions)
        .values({
          canonicalName: profile.officialName,
          normalizedName: normalizedName,
          slug: normalizedName.replace(/\s+/g, '-').toLowerCase().substring(0, 256),
          type: 'college' as any,
          state: profile.state || undefined,
          district: profile.district || undefined,
          address: profile.address || undefined,
          website: profile.website || undefined,
          lastValidatedAt: new Date(),
          validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months validity
        })
        .returning();

      if (result.length > 0) {
        const institutionId = result[0]!.id;

        // Add contacts if available
        const contacts: Array<{ kind: 'email' | 'phone' | 'website'; value: string }> = [];
        if (profile.email) contacts.push({ kind: 'email', value: profile.email });
        if (profile.phone) contacts.push({ kind: 'phone', value: profile.phone });
        if (profile.website) contacts.push({ kind: 'website', value: profile.website });
        if (profile.primaryMobileNumber) contacts.push({ kind: 'phone', value: profile.primaryMobileNumber });
        if (profile.secondaryMobileNumber) contacts.push({ kind: 'phone', value: profile.secondaryMobileNumber });

        for (const contact of contacts) {
          try {
            await db
              .insert(institutionContacts)
              .values({
                institutionId,
                kind: contact.kind as any,
                value: contact.value,
              })
              .onConflictDoNothing();
          } catch (e) {
            // Contact might already exist, continue
            console.warn(`[saveEnrichedInstitution] Failed to save contact:`, e);
          }
        }

        // Link to WEBSITE authority
        try {
          await db
            .insert(institutionIdentities)
            .values({
              institutionId,
              source: 'WEBSITE' as any,
              externalId: profile.website || normalizedName,
              nameAsSource: profile.officialName || normalizedName,
              normalizedName: normalizedName,
              matchScore: 1.0,
              matchMethod: 'search_engine',
            })
            .onConflictDoNothing();
        } catch (e) {
          console.warn(`[saveEnrichedInstitution] Failed to link authority:`, e);
        }
      }
    }
  } catch (error) {
    console.error("[saveEnrichedInstitution] Error:", error);
    // Don't throw - this is best-effort enrichment
  }
}

/**
 * Main enrichment function - orchestrates fetching from DB and Searxng
 */
export async function enrichInstitution(
  institutionName: string,
  skipSearchEngine: boolean = false
): Promise<InstitutionProfile> {
  // First, fetch from database
  const dbProfile = await fetchProfileFromDatabase(institutionName);

  if (!dbProfile) {
    // No database record, try search engine
    if (!skipSearchEngine) {
      // Search for institution and save if found
      console.log(`[enrichInstitution] Institution not in DB, searching: ${institutionName}`);
      const searchProfile = await enrichWithSearchEngine(institutionName, {});

      if (Object.keys(searchProfile).length > 0) {
        // Save to database for future lookups
        await saveEnrichedInstitution(institutionName, searchProfile);
      }

      return searchProfile;
    }
    return {};
  }

  // If we have database data but missing contact info, enrich from search
  if (!skipSearchEngine) {
    return enrichWithSearchEngine(institutionName, dbProfile);
  }

  return dbProfile;
}

/**
 * Extract attributes from registry entries for a given institution
 */
export async function getRegistryAttributes(
  normalizedName: string
): Promise<
  Array<{
    authority: string;
    attributes?: Record<string, any>;
    externalId?: string;
  }>
> {
  try {
    const db = getDb();

    const entries = await db
      .select()
      .from(registryEntries)
      .where(eq(registryEntries.normalizedName, normalizedName));

    return entries.map((entry) => ({
      authority: entry.code,
      attributes: entry.attributes as Record<string, any>,
      externalId: entry.externalId,
    }));
  } catch (error) {
    console.error("[getRegistryAttributes] Error:", error);
    return [];
  }
}
