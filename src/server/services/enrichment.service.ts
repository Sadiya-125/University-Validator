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
import { withCircuitBreaker } from "@/server/cache/circuit-breaker";

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
      console.log(`[fetchProfileFromDatabase] Found institution in institutions table: ${institution.canonicalName}`);
      console.log(`[fetchProfileFromDatabase] Institution table data:`, {
        id: institution.id,
        website: institution.website,
        address: institution.address,
        state: institution.state,
        columnNames: Object.keys(institution),
      });

      // Get all identities for this institution
      const identities = await db
        .select()
        .from(institutionIdentities)
        .where(eq(institutionIdentities.institutionId, institution.id));

      const profile: InstitutionProfile = {
        officialName: institution.canonicalName,
        type: institution.type,
        state: institution.state || undefined,
        city: undefined,
        district: undefined,
        address: institution.address || undefined,
        website: institution.website || undefined,
        email: undefined,
        phone: undefined,
        primaryMobileNumber: undefined,
        secondaryMobileNumber: undefined,
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

      console.log(`[fetchProfileFromDatabase] Returning from institutions table:`, {
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
        address: profile.address,
        state: profile.state,
      });

      return profile;
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
        console.log(`[fetchProfileFromDatabase] Processing registry entry ${entry.code}: ${entry.canonicalName}`, {
          attributeKeys: attrs ? Object.keys(attrs) : [],
          fullAttributes: attrs,
        });

        if (attrs) {
          // Extract contact info from various possible attribute names
          const extractedAttrs = {
            state: attrs.state || attrs.State || attrs.state_name || undefined,
            city: attrs.city || attrs.City || attrs.city_name || undefined,
            district: attrs.district || attrs.District || attrs.district_name || undefined,
            address:
              attrs.address ||
              attrs.Address ||
              attrs.address_text ||
              attrs.full_address ||
              undefined,
            website:
              attrs.website || attrs.Website || attrs.url || attrs.official_website || undefined,
            email: attrs.email || attrs.Email || attrs.email_address || undefined,
            phone:
              attrs.phone || attrs.Phone || attrs.phone_number || attrs.primary_phone || undefined,
            primaryMobileNumber:
              attrs.primary_mobile || attrs.primaryMobileNumber || attrs.mobile || undefined,
            secondaryMobileNumber:
              attrs.secondary_mobile || attrs.secondaryMobileNumber || undefined,
            affiliatedUniversity: attrs.affiliated_university || attrs.university || undefined,
            type: attrs.type || attrs.Type || undefined,
            zip: attrs.zip || attrs.pincode || attrs.postal_code || undefined,
          };

          console.log(`[fetchProfileFromDatabase] Extracted from registry entry:`, {
            email: extractedAttrs.email,
            phone: extractedAttrs.phone,
            website: extractedAttrs.website,
          });

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

      const finalProfile: InstitutionProfile = {
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

      console.log(`[fetchProfileFromDatabase] Returning from registry_entries:`, {
        officialName: finalProfile.officialName,
        email: finalProfile.email,
        phone: finalProfile.phone,
        website: finalProfile.website,
        address: finalProfile.address,
        state: finalProfile.state,
      });

      return finalProfile;
    }

    return null;
  } catch (error) {
    console.error("[fetchProfileFromDatabase] Error:", error);
    return null;
  }
}

/**
 * Scrape a website and extract contact details
 */
async function scrapeWebsiteForDetails(
  websiteUrl: string,
  existingProfile: InstitutionProfile,
  institutionName: string
): Promise<InstitutionProfile> {
  try {
    const { getHttpClient } = await import("@/server/fetch/http");
    const { extractPage } = await import("@/server/fetch/extract");

    console.log(`[scrapeWebsiteForDetails] Scraping website: ${websiteUrl}`);

    const httpClient = getHttpClient();
    const fetchResult = await withCircuitBreaker("website-fetch", () =>
      httpClient.fetch(websiteUrl)
    );
    const html = fetchResult.body.toString("utf-8");

    // Log HTML for debugging (first 1000 chars)
    console.log(`[scrapeWebsiteForDetails] HTML fetched from ${websiteUrl} (${html.length} chars)`);
    console.log(`[scrapeWebsiteForDetails] HTML preview:`, html.substring(0, 1000));

    const extracted = extractPage(html, websiteUrl);

    console.log(`[scrapeWebsiteForDetails] Extraction results:`, {
      emails: extracted.emails,
      phones: extracted.phones,
      addresses: extracted.addresses,
      detectedState: extracted.detectedState,
      detectedPinCode: extracted.detectedPinCode,
      title: extracted.title,
      headings: extracted.headings.slice(0, 3),
    });

    let enrichedData: Partial<InstitutionProfile> = { ...existingProfile };

    console.log(`[scrapeWebsiteForDetails] Existing profile data:`, {
      email: enrichedData.email,
      phone: enrichedData.phone,
      website: enrichedData.website,
    });

    // Extract contact details
    if (extracted.emails && extracted.emails.length > 0 && !enrichedData.email) {
      enrichedData.email = extracted.emails[0];
      console.log(`[scrapeWebsiteForDetails] Set email from website: ${enrichedData.email}`);
    }
    if (extracted.phones && extracted.phones.length > 0 && !enrichedData.phone) {
      enrichedData.phone = extracted.phones[0];
      console.log(`[scrapeWebsiteForDetails] Set phone from website: ${enrichedData.phone}`);
    }
    if (extracted.addresses && extracted.addresses.length > 0 && !enrichedData.address) {
      enrichedData.address = extracted.addresses[0];
      console.log(`[scrapeWebsiteForDetails] Set address: ${enrichedData.address}`);
    }
    if (extracted.detectedState && !enrichedData.state) {
      enrichedData.state = extracted.detectedState;
      console.log(`[scrapeWebsiteForDetails] Set state: ${enrichedData.state}`);
    }
    if (extracted.detectedPinCode && !enrichedData.address) {
      enrichedData.address = extracted.detectedPinCode;
      console.log(`[scrapeWebsiteForDetails] Set address from pincode: ${enrichedData.address}`);
    }

    return enrichedData as InstitutionProfile;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[scrapeWebsiteForDetails] Failed to scrape ${websiteUrl}: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      console.error(`[scrapeWebsiteForDetails] Stack trace:`, error.stack);
    }
    return existingProfile;
  }
}

/**
 * Get website URL from institution_contacts table
 */
async function getWebsiteFromContacts(institutionId: number): Promise<string | null> {
  try {
    const db = getDb();

    const contacts = await db
      .select()
      .from(institutionContacts)
      .where(eq(institutionContacts.institutionId, institutionId));

    // Find website contact
    for (const contact of contacts) {
      if (contact.kind === "website" && contact.value) {
        console.log(`[getWebsiteFromContacts] Found website in contacts: ${contact.value}`);
        return contact.value;
      }
    }

    return null;
  } catch (error) {
    console.error(`[getWebsiteFromContacts] Error fetching contacts:`, error);
    return null;
  }
}

/**
 * Use Gemini as fallback to identify institution website
 */
async function getWebsiteFromGemini(institutionName: string): Promise<string | null> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      console.warn("[getWebsiteFromGemini] GOOGLE_GEMINI_API_KEY not configured");
      return null;
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an expert at finding institutional websites. Given an institution name, provide ONLY the official website URL for that institution. Return only the URL, nothing else.

Institution name: ${institutionName}

Respond with only the URL or "NOT_FOUND" if you cannot identify it.`;

    console.log(`[getWebsiteFromGemini] Querying Gemini for: ${institutionName}`);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (text === "NOT_FOUND" || !text.startsWith("http")) {
      console.log(`[getWebsiteFromGemini] No website found for ${institutionName}`);
      return null;
    }

    console.log(`[getWebsiteFromGemini] Found website for ${institutionName}: ${text}`);
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[getWebsiteFromGemini] Error: ${errorMsg}`);
    return null;
  }
}

/**
 * Fetch missing contact info from Searxng (with website source prioritization)
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
      try {
        // Handle both string and object responses from Redis
        const cachedData = typeof cached === "string" ? JSON.parse(cached) : cached;
        return { ...existingProfile, ...cachedData };
      } catch (parseError) {
        console.warn(`[enrichWithSearchEngine] Failed to parse cached data:`, parseError);
        // Continue without cache if parsing fails
      }
    }

    // If website already exists in profile, use it directly without searching
    if (existingProfile.website) {
      console.log(`[enrichWithSearchEngine] Website exists in profile: ${existingProfile.website}, scraping directly`);
      return await scrapeWebsiteForDetails(existingProfile.website, existingProfile, institutionName);
    }

    // Try to get website from institution_contacts table (Priority 2)
    if (existingProfile.attributes?.institutionId) {
      const contactsWebsite = await getWebsiteFromContacts(existingProfile.attributes.institutionId);
      if (contactsWebsite) {
        console.log(`[enrichWithSearchEngine] Using website from contacts table: ${contactsWebsite}`);
        return await scrapeWebsiteForDetails(contactsWebsite, existingProfile, institutionName);
      }
    }

    console.log(`[enrichWithSearchEngine] Searching for missing info: ${institutionName}`);

    // Import fetch and extract utilities for website scraping
    const { getHttpClient } = await import("@/server/fetch/http");
    const { extractPage } = await import("@/server/fetch/extract");

    // Filter function to identify main institutional websites vs department pages
    const isMainInstitutionalSite = (url: string): boolean => {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        const hostname = urlObj.hostname.toLowerCase();

        // Skip known non-main pages (path-based)
        const skipPathPatterns = [
          "/acr",
          "/alumni",
          "/admissions",
          "/placement",
          "/recruitment",
          "/college",
          "/department",
          "/research",
          "/faculty",
          "/students",
          "/library",
          "/hostel",
          "/sports",
          "/cultural",
          "/club",
        ];

        // Check if URL path contains skip patterns
        for (const pattern of skipPathPatterns) {
          if (pathname.includes(pattern)) {
            console.log(
              `[enrichWithSearchEngine] Skipping ${url} - path matches pattern ${pattern}`
            );
            return false;
          }
        }

        // Skip known non-main subdomains
        const skipSubdomains = [
          "acr",
          "alumni",
          "admissions",
          "placement",
          "recruitment",
          "college",
          "department",
          "research",
          "faculty",
          "students",
          "library",
          "hostel",
          "sports",
          "cultural",
          "club",
        ];

        // Check if URL hostname starts with skip subdomains
        for (const subdomain of skipSubdomains) {
          if (hostname.startsWith(subdomain + ".")) {
            console.log(
              `[enrichWithSearchEngine] Skipping ${url} - subdomain matches ${subdomain}`
            );
            return false;
          }
        }

        // Prioritize base domain (no deep paths)
        // Main site usually is at / or /index or /home
        const pathDepth = pathname.split("/").filter((p) => p.length > 0).length;
        if (pathDepth > 2) {
          // This is a deep path, likely a department or sub-page
          return false;
        }

        return true;
      } catch (e) {
        return true; // If URL parsing fails, try it anyway
      }
    };

    // Search for website, email, phone, address
    // Prioritize specific institutional website searches
    const searchFactory = getSearchFactory();
    const searchQueries = [
      `"${institutionName}"`,
      `"${institutionName}" contact email phone address`,
    ];

    let enrichedData: Partial<InstitutionProfile> = {};
    const processedWebsites: string[] = [];

    for (const query of searchQueries) {
      try {
        console.log(`[enrichWithSearchEngine] Searching: ${query}`);
        const response = await withCircuitBreaker("searxng-search", () =>
          searchFactory.search(query)
        );

        if (!response.results || response.results.length === 0) continue;

        // Collect valid candidates (main sites only)
        const candidates: Array<{ url: string; priority: number }> = [];
        for (const result of response.results) {
          const resultUrl = result.url;
          if (!resultUrl || processedWebsites.includes(resultUrl)) continue;

          // Check if it's a main institutional site
          if (isMainInstitutionalSite(resultUrl)) {
            // Calculate priority: prefer main domain (fewer subdomains, shorter paths)
            try {
              const urlObj = new URL(resultUrl);
              const hostname = urlObj.hostname;
              const pathname = urlObj.pathname;

              // Count subdomains - main domain typically has fewer
              const subdomainCount = hostname.split('.').length;
              const pathDepth = pathname.split('/').filter(p => p.length > 0).length;

              // Priority: lower subdomain count and path depth = higher priority
              const priority = -subdomainCount * 10 - pathDepth;

              candidates.push({ url: resultUrl, priority });
              console.log(`[enrichWithSearchEngine] Valid candidate: ${resultUrl} (priority: ${priority})`);
            } catch (e) {
              console.warn(`[enrichWithSearchEngine] Failed to parse candidate URL: ${resultUrl}`);
            }
          } else {
            console.log(`[enrichWithSearchEngine] Skipping non-main site: ${resultUrl}`);
          }
        }

        // Sort by priority (higher priority first)
        candidates.sort((a, b) => b.priority - a.priority);

        // Try to scrape top candidates
        for (const candidate of candidates) {
          const resultUrl = candidate.url;
          processedWebsites.push(resultUrl);

          try {
            console.log(`[enrichWithSearchEngine] Scraping candidate: ${resultUrl} (priority: ${candidate.priority})`);
            const httpClient = getHttpClient();
            const fetchResult = await withCircuitBreaker("website-fetch", () =>
              httpClient.fetch(resultUrl)
            );
            const html = fetchResult.body.toString("utf-8");

            // Log HTML for debugging
            console.log(`[enrichWithSearchEngine] HTML fetched from ${resultUrl} (${html.length} chars)`);
            console.log(`[enrichWithSearchEngine] HTML preview:`, html.substring(0, 1000));

            const extracted = extractPage(html, resultUrl);

            // Log extraction results
            console.log(`[enrichWithSearchEngine] Extraction results from ${resultUrl}:`, {
              emails: extracted.emails,
              phones: extracted.phones,
              addresses: extracted.addresses,
              detectedState: extracted.detectedState,
              detectedPinCode: extracted.detectedPinCode,
              title: extracted.title,
            });

            // Set website from first successful scrape
            if (!enrichedData.website) {
              enrichedData.website = resultUrl;
              console.log(`[enrichWithSearchEngine] Set website to: ${resultUrl}`);
            }

            // Extract from scraped website (prefer this over search descriptions)
            if (extracted.emails && extracted.emails.length > 0 && !enrichedData.email) {
              enrichedData.email = extracted.emails[0];
              console.log(`[enrichWithSearchEngine] Extracted email: ${enrichedData.email}`);
            }
            if (extracted.phones && extracted.phones.length > 0 && !enrichedData.phone) {
              enrichedData.phone = extracted.phones[0];
              console.log(`[enrichWithSearchEngine] Extracted phone: ${enrichedData.phone}`);
            }
            if (extracted.addresses && extracted.addresses.length > 0 && !enrichedData.address) {
              enrichedData.address = extracted.addresses[0];
              console.log(`[enrichWithSearchEngine] Extracted address: ${enrichedData.address}`);
            }
            if (extracted.detectedState && !enrichedData.state) {
              enrichedData.state = extracted.detectedState;
            }
            if (extracted.detectedPinCode && !enrichedData.address) {
              enrichedData.address = extracted.detectedPinCode;
            }

            // Stop scraping if we found enough info
            if (enrichedData.email && enrichedData.phone && enrichedData.website) {
              console.log(
                `[enrichWithSearchEngine] Found sufficient contact info from: ${resultUrl}`
              );
              break;
            }
          } catch (scrapeError) {
            const scrapeErrorMsg = scrapeError instanceof Error ? scrapeError.message : String(scrapeError);
            console.warn(`[enrichWithSearchEngine] Failed to scrape ${resultUrl}: ${scrapeErrorMsg}`);
            // Continue to next candidate
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

    // Try Gemini as fallback if website still not found (Priority 4)
    if (!enrichedData.website) {
      console.log(`[enrichWithSearchEngine] Website not found via Searxng, trying Gemini fallback...`);
      const geminiWebsite = await getWebsiteFromGemini(institutionName);

      if (geminiWebsite) {
        console.log(`[enrichWithSearchEngine] Gemini found website: ${geminiWebsite}`);
        // Scrape the Gemini-provided website for contact details
        // But DO NOT save the Gemini website or result to database
        try {
          const geminiScraped = await scrapeWebsiteForDetails(geminiWebsite, existingProfile, institutionName);
          // Mark that this came from Gemini so we don't persist it
          return { ...geminiScraped, _geminiSource: true } as any;
        } catch (e) {
          console.warn(`[enrichWithSearchEngine] Failed to scrape Gemini website ${geminiWebsite}:`, e);
        }
      }
    }

    // Map city to state if city exists
    if (enrichedData.state && !enrichedData.state) {
      const cityToState: Record<string, string> = {
        Delhi: "Delhi",
        Mumbai: "Maharashtra",
        Hyderabad: "Telangana",
        Bangalore: "Karnataka",
        Pune: "Maharashtra",
        Chennai: "Tamil Nadu",
        Kolkata: "West Bengal",
        Ahmedabad: "Gujarat",
        Chandigarh: "Chandigarh",
        Jaipur: "Rajasthan",
        Lucknow: "Uttar Pradesh",
        Noida: "Uttar Pradesh",
        Gurgaon: "Haryana",
        Bhopal: "Madhya Pradesh",
        Indore: "Madhya Pradesh",
        Surat: "Gujarat",
        Vadodara: "Gujarat",
      };
      enrichedData.state = cityToState[enrichedData.state];
    }

    // Cache the enrichment for 7 days (but NOT Gemini results)
    if (Object.keys(enrichedData).length > 0 && !(enrichedData as any)._geminiSource) {
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
    // Don't save Gemini-sourced data to database
    if ((profile as any)._geminiSource) {
      console.log(`[saveEnrichedInstitution] Skipping database save for Gemini-sourced data for ${normalizedName}`);
      return;
    }

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
          slug: normalizedName.replace(/\s+/g, "-").toLowerCase().substring(0, 256),
          type: "college" as any,
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
        const contacts: Array<{ kind: "email" | "phone" | "website"; value: string }> = [];
        if (profile.email) contacts.push({ kind: "email", value: profile.email });
        if (profile.phone) contacts.push({ kind: "phone", value: profile.phone });
        if (profile.website) contacts.push({ kind: "website", value: profile.website });
        if (profile.primaryMobileNumber)
          contacts.push({ kind: "phone", value: profile.primaryMobileNumber });
        if (profile.secondaryMobileNumber)
          contacts.push({ kind: "phone", value: profile.secondaryMobileNumber });

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

        // Link to real registry authorities if available
        if (profile.sources && profile.sources.length > 0) {
          for (const source of profile.sources) {
            try {
              await db
                .insert(institutionIdentities)
                .values({
                  institutionId,
                  source: source.authority as any,
                  externalId: normalizedName,
                  nameAsSource: profile.officialName || normalizedName,
                  normalizedName: normalizedName,
                  matchScore: 0.9, // Slightly lower than exact matches
                  matchMethod: "enrichment",
                })
                .onConflictDoNothing();
            } catch (e) {
              console.warn(
                `[saveEnrichedInstitution] Failed to link authority ${source.authority}:`,
                e
              );
            }
          }
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
  console.log(`[enrichInstitution] Starting enrichment for: ${institutionName}`);

  // First, fetch from database
  const dbProfile = await fetchProfileFromDatabase(institutionName);

  console.log(`[enrichInstitution] DB profile retrieved:`, {
    found: dbProfile ? true : false,
    email: dbProfile?.email,
    phone: dbProfile?.phone,
  });

  if (!dbProfile) {
    // No database record, try search engine
    if (!skipSearchEngine) {
      // Search for institution and save if found
      console.log(`[enrichInstitution] Institution not in DB, searching: ${institutionName}`);
      const searchProfile = await enrichWithSearchEngine(institutionName, {});

      console.log(`[enrichInstitution] Search profile result:`, {
        email: searchProfile?.email,
        phone: searchProfile?.phone,
      });

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
    const enrichedProfile = await enrichWithSearchEngine(institutionName, dbProfile);
    console.log(`[enrichInstitution] Final enriched profile:`, {
      email: enrichedProfile?.email,
      phone: enrichedProfile?.phone,
      website: enrichedProfile?.website,
      source: 'enrichWithSearchEngine',
    });
    return enrichedProfile;
  }

  console.log(`[enrichInstitution] Returning DB profile (skip search):`, {
    email: dbProfile?.email,
    phone: dbProfile?.phone,
  });

  return dbProfile;
}

/**
 * Extract attributes from registry entries for a given institution
 */
export async function getRegistryAttributes(normalizedName: string): Promise<
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
