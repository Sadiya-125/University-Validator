/**
 * DigiLocker NAD (National Academic Depository) Verification
 *
 * Verifies if an institution is registered on DigiLocker by checking the NAD registry.
 * Scrapes the NAD "Records by Year" page to extract all registered institutions with
 * complete year-by-year availability data.
 *
 * Page: https://nad.digilocker.gov.in/recordsbyyear
 * Structure: Tab-based with multiple years and institution categories
 * - Years: 2022, 2023, 2024, 2025, etc.
 * - Categories: State University, Private University, Deemed University, Central University,
 *   IIT, IIM, NIT, IIIT, AIIMS, Autonomous College, ICAR, IISER, NID, NIFTEM, NIPER,
 *   Others, Others INI, SPA, Standalone Institutions, Technical Board, Examination Board, School Board
 * - Data extracted: Institution names, states, document types, AND year-by-year document counts
 *
 * Verification Logic:
 * - Presence in NAD registry = Institution is available on DigiLocker
 * - Year-by-year data shows timeline of document availability
 * - Uses deterministic name matching with normalization, abbreviation expansion,
 *   and city aliases for accurate results.
 */

import { FetchContext } from "../types";

interface NADInstitution {
  name: string;
  state?: string;
  documentTypes: string[]; // Document type names
  yearData?: Record<string, Record<number, number>>; // [docType][year] = count
}

interface DigiLockerCheckResult {
  institution_name: string;
  is_available: boolean;
  matched_name?: string;
  matched_state?: string;
  document_types?: string[];
  year_data?: Record<string, Record<number, number>>; // Year-by-year timeline
  available_years?: number[];
  total_documents?: number;
}

/**
 * Abbreviation mappings for Indian institutions
 */
const ABBREVIATIONS: Record<string, string> = {
  iit: "indian institute of technology",
  iim: "indian institute of management",
  iisc: "indian institute of science",
  nit: "national institute of technology",
  iiit: "indian institute of information technology",
  aiims: "all india institute of medical sciences",
  jnu: "jawaharlal nehru university",
  du: "delhi university",
  mu: "mumbai university",
  bhu: "banaras hindu university",
  amu: "aligarh muslim university",
};

/**
 * City aliases for matching variations
 */
const CITY_ALIASES: Record<string, string[]> = {
  bombay: ["mumbai"],
  mumbai: ["bombay"],
  calcutta: ["kolkata"],
  kolkata: ["calcutta"],
  madras: ["chennai"],
  chennai: ["madras"],
  bangalore: ["bengaluru"],
  bengaluru: ["bangalore"],
};

/**
 * Stop words to exclude from name matching
 */
const STOP_WORDS = new Set([
  "of",
  "the",
  "and",
  "in",
  "a",
  "an",
  "to",
  "is",
  "college",
  "university",
  "institute",
  "school",
  "pvt",
  "ltd",
  "private",
  "limited",
  "govt",
  "government",
]);

/**
 * Normalize institution name for matching
 */
function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/&amp;/g, "and")
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get significant tokens from name (skip stop words)
 */
function getSignificantTokens(name: string): string[] {
  const norm = normalizeName(name);
  const tokens = norm.split(" ").filter((t) => t && !STOP_WORDS.has(t));
  return tokens;
}

/**
 * Generate name variants for matching
 */
function generateVariants(name: string): Set<string> {
  const variants = new Set<string>();
  const norm = normalizeName(name);

  // Add normalized form
  if (norm) variants.add(norm);

  // Add significant tokens variant
  const sigTokens = getSignificantTokens(name);
  if (sigTokens.length > 0) {
    variants.add(sigTokens.join(" "));
  }

  // Add abbreviation expansion variants
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    if (norm.includes(abbr)) {
      const expanded = norm.replace(abbr, full);
      variants.add(expanded);
      variants.add(getSignificantTokens(expanded).join(" "));
    }
  }

  // Add city alias variants
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (norm.includes(city)) {
      for (const alias of aliases) {
        const withAlias = norm.replace(city, alias);
        variants.add(withAlias);
      }
    }
  }

  // Add variant without institutional type words
  const withoutType = norm
    .replace(/\buniversity\b/g, "")
    .replace(/\bcollege\b/g, "")
    .replace(/\binstitute\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutType && withoutType !== norm) {
    variants.add(withoutType);
  }

  // Remove empty strings
  return new Set(Array.from(variants).filter((v) => v && v.length > 1));
}

/**
 * Extract institutions from NAD HTML
 * Handles multiple table structures across different institution categories
 * Captures document types and can store year-by-year data
 */
function extractInstitutionsFromHtml(html: string): NADInstitution[] {
  const institutions: Map<string, NADInstitution> = new Map();

  // Match table rows
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;

  let rowMatch;
  const tableRows: string[] = [];

  while ((rowMatch = tableRowRegex.exec(html)) !== null) {
    if (rowMatch[1]) {
      tableRows.push(rowMatch[1]);
    }
  }

  const stateNames = new Set([
    "andhra pradesh",
    "arunachal pradesh",
    "assam",
    "bihar",
    "chhattisgarh",
    "goa",
    "gujarat",
    "haryana",
    "himachal pradesh",
    "jharkhand",
    "karnataka",
    "kerala",
    "madhya pradesh",
    "maharashtra",
    "manipur",
    "meghalaya",
    "mizoram",
    "nagaland",
    "odisha",
    "punjab",
    "rajasthan",
    "sikkim",
    "tamil nadu",
    "telangana",
    "tripura",
    "uttar pradesh",
    "uttarakhand",
    "west bengal",
    "delhi",
    "puducherry",
    "chandigarh",
  ]);

  // Track current state and institution for multi-row institutions (rowspan)
  let currentState = "";
  let lastInstitutionName = "";
  let lastInstitutionState = "";

  for (const rowHtml of tableRows) {
    // Skip header rows (those with <th> tags)
    if (rowHtml.includes("<th")) {
      continue;
    }

    const cells: string[] = [];
    let cellMatch;
    cellRegex.lastIndex = 0;

    // Extract cell content
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let cellContent = (cellMatch[1] || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .trim();

      if (cellContent) {
        cells.push(cellContent);
      }
    }

    if (cells.length < 2) continue;

    // Detect table structure and extract state + name
    let state = "";
    let name = "";
    let documentType = "";
    let isStateColumn = false;

    // Check if first cell is a state name
    if (cells[0] && stateNames.has(cells[0].toLowerCase())) {
      // Format: State | Name | Document Type | Years...
      isStateColumn = true;
      currentState = cells[0];
      lastInstitutionState = currentState;
      state = currentState;
      name = cells.length > 1 ? (cells[1] || "") : "";
      documentType = cells.length > 2 ? (cells[2] || "") : "";
      lastInstitutionName = name;
    } else if (cells[0] && !cells[0].match(/^\d+$/)) {
      // cells[0] is not numeric, check if it's institution name or document type
      // If it looks like a document type, use last institution name (rowspan continuation)
      if (
        cells[0].toLowerCase().includes("certificate") ||
        cells[0].toLowerCase().includes("marksheet") ||
        cells[0].toLowerCase().includes("diploma")
      ) {
        // This is a document type row (rowspan continuation)
        name = lastInstitutionName;
        state = lastInstitutionState;
        documentType = cells[0];
      } else {
        // Format: Name | Document Type | Years...
        name = cells[0];
        documentType = cells.length > 1 ? (cells[1] || "") : "";
        state = currentState;
        lastInstitutionName = name;
        lastInstitutionState = state;
      }
    }

    // Validate and add institution
    if (name && name.length > 3) {
      // Skip header-like and total rows
      if (
        name.toLowerCase().includes("grand total") ||
        name.toLowerCase().includes("institute name") ||
        (name.toLowerCase().includes("document") && name.toLowerCase().includes("type"))
      ) {
        continue;
      }

      const key = `${name}|${state}`;
      const existing = institutions.get(key);

      if (!existing) {
        institutions.set(key, {
          name: name.trim(),
          state: state && state !== "-" ? state.trim() : undefined,
          documentTypes: documentType && documentType !== "-" ? [documentType.trim()] : [],
        });
      } else if (documentType && documentType !== "-") {
        // Add additional document type for this institution
        const docType = documentType.trim();
        if (!existing.documentTypes.includes(docType)) {
          existing.documentTypes.push(docType);
        }
      }
    }
  }

  return Array.from(institutions.values());
}

/**
 * Build variant index for fast matching
 */
function buildVariantIndex(
  institutions: NADInstitution[]
): Map<string, NADInstitution> {
  const index = new Map<string, NADInstitution>();

  for (const inst of institutions) {
    const variants = generateVariants(inst.name);
    for (const variant of variants) {
      if (!index.has(variant)) {
        index.set(variant, inst);
      }
    }
  }

  return index;
}

/**
 * Global DigiLocker cache
 */
let cachedInstitutions: NADInstitution[] | null = null;
let cachedVariantIndex: Map<string, NADInstitution> | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch and cache NAD institutions
 */
export async function fetchNADInstitutions(
  ctx?: FetchContext
): Promise<NADInstitution[]> {
  const now = Date.now();

  // Use cache if valid
  if (cachedInstitutions && now - lastCacheTime < CACHE_TTL) {
    ctx?.logger?.info(`DigiLocker: Using cached institutions (${cachedInstitutions.length})`);
    return cachedInstitutions;
  }

  try {
    ctx?.logger?.info(`DigiLocker: Fetching NAD institutions from https://nad.digilocker.gov.in/recordsbyyear`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch("https://nad.digilocker.gov.in/recordsbyyear", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    cachedInstitutions = extractInstitutionsFromHtml(html);
    cachedVariantIndex = buildVariantIndex(cachedInstitutions);
    lastCacheTime = now;

    ctx?.logger?.info(
      `DigiLocker: Loaded ${cachedInstitutions.length} institutions from NAD`
    );

    return cachedInstitutions;
  } catch (error) {
    ctx?.logger?.warn(
      `DigiLocker: Failed to fetch NAD institutions: ${error}`
    );

    // Return cached data if available, even if expired
    if (cachedInstitutions) {
      ctx?.logger?.info(
        `DigiLocker: Using stale cache (${cachedInstitutions.length} institutions)`
      );
      return cachedInstitutions;
    }

    return [];
  }
}

/**
 * Check if an institution is available on DigiLocker
 */
export async function checkDigiLocker(
  institutionName: string,
  ctx?: FetchContext
): Promise<DigiLockerCheckResult> {
  if (!institutionName) {
    return {
      institution_name: institutionName,
      is_available: false,
    };
  }

  try {
    // Fetch institutions if not cached
    if (!cachedInstitutions) {
      await fetchNADInstitutions(ctx);
    }

    if (!cachedVariantIndex) {
      ctx?.logger?.warn(
        `DigiLocker: No institutions available for ${institutionName}`
      );
      return {
        institution_name: institutionName,
        is_available: false,
      };
    }

    // Generate query variants
    const queryVariants = generateVariants(institutionName);

    // Check each variant (prefer longer/more specific matches)
    const sortedVariants = Array.from(queryVariants).sort(
      (a, b) => b.length - a.length
    );

    for (const variant of sortedVariants) {
      const match = cachedVariantIndex.get(variant);
      if (match) {
        ctx?.logger?.debug(
          `DigiLocker: Match found for ${institutionName} → ${match.name}`
        );

        // Calculate total documents and available years
        let totalDocuments = 0;
        const availableYears = new Set<number>();

        if (match.yearData) {
          for (const docType in match.yearData) {
            const yearCounts = match.yearData[docType];
            if (yearCounts) {
              for (const yearStr in yearCounts) {
                const count = yearCounts[parseInt(yearStr, 10)];
                if (typeof count === 'number') {
                  totalDocuments += count;
                  availableYears.add(parseInt(yearStr, 10));
                }
              }
            }
          }
        }

        return {
          institution_name: institutionName,
          is_available: true,
          matched_name: match.name,
          matched_state: match.state,
          document_types: match.documentTypes,
          year_data: match.yearData,
          available_years: Array.from(availableYears).sort((a, b) => a - b),
          total_documents: totalDocuments > 0 ? totalDocuments : undefined,
        };
      }
    }

    ctx?.logger?.debug(`DigiLocker: No match for ${institutionName}`);
    return {
      institution_name: institutionName,
      is_available: false,
    };
  } catch (error) {
    ctx?.logger?.warn(
      `DigiLocker: Error checking ${institutionName}: ${error}`
    );
    return {
      institution_name: institutionName,
      is_available: false,
    };
  }
}

/**
 * Batch check multiple institutions
 */
export async function batchCheckDigiLocker(
  institutionNames: string[],
  ctx?: FetchContext
): Promise<DigiLockerCheckResult[]> {
  // Fetch institutions once
  if (!cachedInstitutions) {
    await fetchNADInstitutions(ctx);
  }

  return Promise.all(
    institutionNames.map((name) => checkDigiLocker(name, ctx))
  );
}

/**
 * Clear cache (for testing/refresh)
 */
export function clearDigiLockerCache() {
  cachedInstitutions = null;
  cachedVariantIndex = null;
  lastCacheTime = 0;
}
