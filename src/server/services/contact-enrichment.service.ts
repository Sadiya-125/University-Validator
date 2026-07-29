/**
 * Contact Enrichment Service
 *
 * Integrates Fetch/Extract module with the database to:
 * 1. Search for URLs in registry_entries.attributes (different scraper formats)
 * 2. Fetch and extract contact details from those URLs
 * 3. Populate institutions, contacts, links, and identities tables
 * 4. Serve enriched data to the dashboard
 */

import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/cache/redis";
import { eq, and, isNull } from "drizzle-orm";
import {
  registryEntries,
  institutions,
  institutionContacts,
  institutionLinks,
  institutionIdentities,
} from "@/server/db/schema";
import { getHttpClient } from "@/server/fetch/http";
import { extractPage } from "@/server/fetch/extract";
import { CacheKeys, CacheTTL } from "@/server/cache/keys";

/**
 * Different URL attribute names across scrapers
 */
const URL_ATTRIBUTE_KEYS = [
  "website",
  "official_website",
  "url",
  "official_url",
  "home_page",
  "homepage",
  "site_url",
  "web_url",
  "contact_url",
  "address_url",
  "link",
];

/**
 * Contact detail attribute names across scrapers
 */
const CONTACT_ATTRIBUTE_KEYS = {
  email: ["email", "contact_email", "email_address", "official_email", "support_email"],
  phone: ["phone", "contact_phone", "phone_number", "primary_phone", "official_phone", "tel"],
  address: ["address", "physical_address", "office_address", "contact_address", "location"],
  state: ["state", "state_name", "province", "region"],
  district: ["district", "district_name", "taluka", "tehsil"],
  pincode: ["pincode", "postal_code", "zip_code", "zip"],
};

/**
 * Extracted contact details from website
 */
export interface ExtractedContactDetails {
  email?: string;
  phone?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  websiteTitle?: string;
  affiliationClaim?: string;
  approvalClaim?: string;
}

/**
 * Extract URL from registry entry attributes (handles multiple formats)
 */
export function extractUrlFromAttributes(attributes: Record<string, any> | null): string | null {
  if (!attributes || typeof attributes !== "object") {
    return null;
  }

  // Try each possible URL key
  for (const key of URL_ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (value && typeof value === "string" && (value.startsWith("http://") || value.startsWith("https://"))) {
      return value;
    }
  }

  return null;
}

/**
 * Extract contact details from registry entry attributes
 */
export function extractContactsFromAttributes(
  attributes: Record<string, any> | null
): Partial<ExtractedContactDetails> {
  if (!attributes || typeof attributes !== "object") {
    return {};
  }

  const details: Partial<ExtractedContactDetails> = {};

  // Extract each contact type
  for (const [field, keys] of Object.entries(CONTACT_ATTRIBUTE_KEYS)) {
    for (const key of keys) {
      const value = attributes[key];
      if (value && typeof value === "string") {
        (details as any)[field] = value;
        break; // Use first match
      }
    }
  }

  return details;
}

/**
 * Fetch and extract contact details from institution website
 */
async function fetchContactDetailsFromWebsite(
  url: string
): Promise<Partial<ExtractedContactDetails>> {
  try {
    const httpClient = getHttpClient();
    const fetchResult = await httpClient.fetch(url);
    const html = fetchResult.body.toString("utf-8");
    const extracted = extractPage(html, url);

    return {
      email: extracted.emails[0],
      phone: extracted.phones[0],
      address: extracted.addresses[0],
      state: extracted.detectedState,
      pincode: extracted.detectedPinCode,
      websiteTitle: extracted.title,
      affiliationClaim: extracted.affiliation?.text,
      approvalClaim: extracted.approval?.text,
    };
  } catch (error) {
    console.warn(`[ContactEnrichment] Failed to fetch from ${url}: ${error}`);
    return {};
  }
}

/**
 * Merge contact details (prefer website data over registry data)
 */
function mergeContactDetails(
  registryDetails: Partial<ExtractedContactDetails>,
  websiteDetails: Partial<ExtractedContactDetails>
): ExtractedContactDetails {
  return {
    email: websiteDetails.email || registryDetails.email,
    phone: websiteDetails.phone || registryDetails.phone,
    address: websiteDetails.address || registryDetails.address,
    state: websiteDetails.state || registryDetails.state,
    district: websiteDetails.district || registryDetails.district,
    pincode: websiteDetails.pincode || registryDetails.pincode,
    websiteTitle: websiteDetails.websiteTitle || registryDetails.websiteTitle,
    affiliationClaim: websiteDetails.affiliationClaim || registryDetails.affiliationClaim,
    approvalClaim: websiteDetails.approvalClaim || registryDetails.approvalClaim,
  };
}

/**
 * Save extracted contacts to database
 */
async function saveContactsToDatabase(
  institutionId: number,
  details: ExtractedContactDetails,
  websiteUrl?: string
): Promise<void> {
  const db = getDb();

  try {
    // Update institution with contact details and website
    if (details.address || details.state || details.pincode || websiteUrl) {
      await db
        .update(institutions)
        .set({
          address: details.address || undefined,
          state: details.state || undefined,
          pincode: details.pincode || undefined,
          website: websiteUrl || undefined,
          updatedAt: new Date(),
        })
        .where(eq(institutions.id, institutionId));
    }

    // Save email
    if (details.email) {
      await db
        .insert(institutionContacts)
        .values({
          institutionId,
          kind: "email",
          value: details.email,
        })
        .onConflictDoNothing();
    }

    // Save phone
    if (details.phone) {
      await db
        .insert(institutionContacts)
        .values({
          institutionId,
          kind: "phone",
          value: details.phone,
        })
        .onConflictDoNothing();
    }

    // Save website link
    if (websiteUrl) {
      await db
        .insert(institutionLinks)
        .values({
          institutionId,
          platform: "official_website",
          url: websiteUrl,
          title: details.websiteTitle,
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    console.warn(`[ContactEnrichment] Failed to save contacts for institution ${institutionId}: ${error}`);
  }
}

/**
 * Enrich a single registry entry with contact details
 */
export async function enrichRegistryEntryContacts(
  registryEntryId: number
): Promise<ExtractedContactDetails | null> {
  try {
    const db = getDb();

    // Fetch registry entry
    const entries = await db
      .select()
      .from(registryEntries)
      .where(eq(registryEntries.id, registryEntryId));

    if (entries.length === 0) {
      console.warn(`[ContactEnrichment] Registry entry ${registryEntryId} not found`);
      return null;
    }

    const entry = entries[0]!;
    const attributes = entry.attributes as Record<string, any> | null;

    // Extract contacts from registry attributes
    const registryDetails = extractContactsFromAttributes(attributes);
    let websiteDetails: Partial<ExtractedContactDetails> = {};
    let websiteUrl: string | undefined;

    // Try to fetch from website if URL is available
    const urlFromRegistry = extractUrlFromAttributes(attributes);
    if (urlFromRegistry) {
      websiteUrl = urlFromRegistry;
      websiteDetails = await fetchContactDetailsFromWebsite(urlFromRegistry);
    }

    // Merge details
    const mergedDetails = mergeContactDetails(registryDetails, websiteDetails);

    // Try to link to canonical institution
    const institutionMatches = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.normalizedName, entry.normalizedName || ""));

    if (institutionMatches.length > 0) {
      const institutionId = institutionMatches[0]!.id;

      // Link registry entry to institution
      await db
        .insert(institutionIdentities)
        .values({
          institutionId,
          source: entry.code as any,
          externalId: entry.externalId,
          nameAsSource: entry.canonicalName || entry.normalizedName || "",
          normalizedName: entry.normalizedName || "",
          matchScore: 1.0,
          matchMethod: "registry_enrich",
        })
        .onConflictDoNothing();

      // Save contacts
      await saveContactsToDatabase(institutionId, mergedDetails, websiteUrl);

      return mergedDetails;
    }

    return mergedDetails;
  } catch (error) {
    console.error(`[ContactEnrichment] Error enriching registry entry ${registryEntryId}: ${error}`);
    return null;
  }
}

/**
 * Bulk enrich registry entries for an authority
 */
export async function enrichRegistryEntriesByAuthority(
  authorityCode: string,
  limit: number = 50
): Promise<{ processed: number; enriched: number }> {
  try {
    const db = getDb();

    // Fetch unenriched entries for this authority
    const entries = await db
      .select()
      .from(registryEntries)
      .where(eq(registryEntries.code, authorityCode as any))
      .limit(limit);

    let enriched = 0;

    for (const entry of entries) {
      const result = await enrichRegistryEntryContacts(entry.id);
      if (result && (result.email || result.phone || result.address)) {
        enriched++;
      }
    }

    return { processed: entries.length, enriched };
  } catch (error) {
    console.error(`[ContactEnrichment] Error enriching authority ${authorityCode}: ${error}`);
    return { processed: 0, enriched: 0 };
  }
}

/**
 * Enrich registry entries for a specific institution by normalized name
 */
export async function enrichRegistryEntriesByName(
  normalizedName: string,
  limit: number = 50
): Promise<{ processed: number; enriched: number }> {
  try {
    const db = getDb();

    // Fetch registry entries for this institution
    const entries = await db
      .select()
      .from(registryEntries)
      .where(eq(registryEntries.normalizedName, normalizedName))
      .limit(limit);

    let enriched = 0;

    for (const entry of entries) {
      const result = await enrichRegistryEntryContacts(entry.id);
      if (result && (result.email || result.phone || result.address)) {
        enriched++;
      }
    }

    return { processed: entries.length, enriched };
  } catch (error) {
    console.error(`[ContactEnrichment] Error enriching institution ${normalizedName}: ${error}`);
    return { processed: 0, enriched: 0 };
  }
}

/**
 * Get enriched institution details for dashboard (includes extracted contacts)
 */
export async function getEnrichedInstitutionDetails(institutionId: number) {
  try {
    const db = getDb();
    const redis = getRedis();

    // Check cache first
    const cacheKey = `enriched:institution:${institutionId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    // Fetch institution
    const instRows = await db.select().from(institutions).where(eq(institutions.id, institutionId));

    if (instRows.length === 0) {
      return null;
    }

    const institution = instRows[0]!;

    // Fetch contacts
    const contacts = await db
      .select()
      .from(institutionContacts)
      .where(eq(institutionContacts.institutionId, institutionId));

    // Fetch links
    const links = await db
      .select()
      .from(institutionLinks)
      .where(eq(institutionLinks.institutionId, institutionId));

    // Fetch identities
    const identities = await db
      .select()
      .from(institutionIdentities)
      .where(eq(institutionIdentities.institutionId, institutionId));

    const enriched = {
      institution,
      contacts: contacts.map((c) => ({ kind: c.kind, value: c.value })),
      links: links.map((l) => ({ platform: l.platform, url: l.url, title: l.title })),
      identities: identities.map((i) => ({ source: i.source, externalId: i.externalId })),
    };

    // Cache for 1 hour
    await redis.set(cacheKey, JSON.stringify(enriched));
    await redis.expire(cacheKey, CacheTTL.INSTITUTION);

    return enriched;
  } catch (error) {
    console.error(`[ContactEnrichment] Error fetching enriched details for ${institutionId}: ${error}`);
    return null;
  }
}

/**
 * Find institutions missing contact details and enrich them
 */
export async function enrichInstitutionsMissingContacts(limit: number = 100): Promise<number> {
  try {
    const db = getDb();

    // Find institutions without contacts
    const instWithoutContacts = await db
      .select({ id: institutions.id, normalizedName: institutions.normalizedName })
      .from(institutions)
      .where(isNull(institutions.website))
      .limit(limit);

    let enriched = 0;

    for (const inst of instWithoutContacts) {
      // Find registry entries for this institution
      const regEntries = await db
        .select()
        .from(registryEntries)
        .where(eq(registryEntries.normalizedName, inst.normalizedName));

      for (const entry of regEntries) {
        const attributes = entry.attributes as Record<string, any> | null;
        const websiteUrl = extractUrlFromAttributes(attributes);

        if (websiteUrl) {
          const details = await fetchContactDetailsFromWebsite(websiteUrl);
          const mergedDetails = mergeContactDetails(extractContactsFromAttributes(attributes), details);

          await saveContactsToDatabase(inst.id, mergedDetails, websiteUrl);
          enriched++;
          break; // Use first source with website
        }
      }
    }

    return enriched;
  } catch (error) {
    console.error(`[ContactEnrichment] Error enriching institutions: ${error}`);
    return 0;
  }
}
