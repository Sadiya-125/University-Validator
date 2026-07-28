/**
 * Name normalization for Indian institutions
 *
 * Standardizes institution names for matching:
 * - Lowercase, NFKD normalization, unaccent
 * - Strip punctuation, collapse whitespace
 * - "&" → "and", expand ordinals
 * - Remove honorifics (Sri/Shri/Smt/Dr/Prof)
 * - Canonicalize Indian place variants (Kolkata↔Calcutta, Mumbai↔Bombay, etc.)
 *
 * Pure function with no side effects. Suitable for deterministic matching.
 */

/**
 * Result of name normalization
 */
export interface NormalizedName {
  normalized: string; // All processing applied
  tokens: string[]; // Split tokens (including stop words)
  coreTokens: string[]; // Tokens without generic/stop words
  stripped: string; // Honorifics removed, but otherwise raw
  state?: string; // Detected Indian state
  city?: string; // Detected city
}

/**
 * Indian place variants (canonical → aliases)
 * Maps canonical place names to their known aliases
 */
const PLACE_VARIANTS: Record<string, string[]> = {
  mumbai: ["bombay"],
  kolkata: ["calcutta"],
  bengaluru: ["bangalore"],
  thiruvananthapuram: ["trivandrum"],
  kanyakumari: ["cape comorin"],
  puducherry: ["pondicherry"],
  varanasi: ["benares"],
  lucknow: ["luckhnow"], // Common misspelling
};

/**
 * Generic/stop words to remove from core tokens
 */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "in",
  "to",
  "for",
  "at",
  "by",
  "from",
  "is",
  "are",
  "be",
  "was",
  "were",
  "been",
  "institute",
  "institution",
  "university",
  "college",
  "school",
  "academy",
  "faculty",
  "center",
  "centre",
  "department",
  "division",
  "group",
  "office",
  "pvt",
  "ltd",
  "inc",
  "corp",
  "company",
  "private",
  "limited",
  "government",
  "govt",
  "state",
  "central",
  "national",
  "international",
  "autonomous",
  "affiliated",
  "recognized",
  "approved",
]);

/**
 * Honorifics to strip
 */
const HONORIFICS = ["sri", "shri", "smt", "shrimati", "dr", "prof", "dr.", "prof."];

/**
 * Ordinal mapping: "first" → "1st", "second" → "2nd", etc.
 */
const ORDINALS: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th",
  thirteenth: "13th",
  fourteenth: "14th",
  fifteenth: "15th",
  sixteenth: "16th",
  seventeenth: "17th",
  eighteenth: "18th",
  nineteenth: "19th",
  twentieth: "20th",
};

/**
 * Indian states and Union Territories
 */
const INDIAN_STATES = new Set([
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
  "ladakh",
  "jammu and kashmir",
  "andaman and nicobar",
  "lakshadweep",
  "daman and diu",
  "dadar and nagar haveli",
]);

/**
 * Remove honorifics from name
 */
function stripHonorifics(name: string): string {
  let stripped = name;
  for (const honorific of HONORIFICS) {
    const regex = new RegExp(`\\b${honorific}\\b`, "gi");
    stripped = stripped.replace(regex, "");
  }
  return stripped.trim();
}

/**
 * Expand ordinal words to numbers
 */
function expandOrdinals(text: string): string {
  let result = text;
  for (const [word, num] of Object.entries(ORDINALS)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, num);
  }
  return result;
}

/**
 * Canonicalize place variants
 */
function canonicalizePlaces(text: string): string {
  let result = text;
  for (const [canonical, aliases] of Object.entries(PLACE_VARIANTS)) {
    // Replace all aliases with canonical form
    for (const alias of aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, "gi");
      result = result.replace(regex, canonical);
    }
  }
  return result;
}

/**
 * Normalize a name according to spec
 */
export function normalizeName(raw: string): NormalizedName {
  if (!raw || typeof raw !== "string") {
    return {
      normalized: "",
      tokens: [],
      coreTokens: [],
      stripped: "",
    };
  }

  // Step 1: Strip honorifics (before other processing)
  const stripped = stripHonorifics(raw);

  // Step 2: Expand ordinals
  let text = expandOrdinals(stripped);

  // Step 3: Lowercase
  text = text.toLowerCase();

  // Step 4: NFKD normalization + unaccent
  text = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove diacritical marks

  // Step 5: Convert "&" to "and"
  text = text.replace(/&/g, "and");

  // Step 6: Canonicalize place variants
  text = canonicalizePlaces(text);

  // Step 7: Strip punctuation (except spaces)
  text = text.replace(/[^\w\s]/g, " ");

  // Step 8: Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Step 9: Split into tokens
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);

  // Step 10: Generate core tokens (remove stop words)
  const coreTokens = tokens.filter((t) => !STOP_WORDS.has(t));

  // Step 11: Detect state
  let state: string | undefined;
  for (const token of tokens) {
    if (INDIAN_STATES.has(token)) {
      state = token;
      break;
    }
  }

  // Step 12: Detect city (not implemented yet - would need city database)
  let city: string | undefined;

  return {
    normalized: text,
    tokens,
    coreTokens,
    stripped: stripped.trim(),
    state,
    city,
  };
}

/**
 * Extract city/district from name if present
 * Used after normalization to detect geographic context
 */
export function extractCity(tokens: string[]): string | undefined {
  // Common Indian cities that might appear in institution names
  const commonCities = new Set([
    "delhi",
    "mumbai",
    "bangalore",
    "bengaluru",
    "chennai",
    "madras",
    "kolkata",
    "calcutta",
    "hyderabad",
    "pune",
    "pune",
    "ahmedabad",
    "jaipur",
    "lucknow",
    "kanpur",
    "nagpur",
    "indore",
    "goa",
    "chandigarh",
    "coimbatore",
    "kochi",
    "cochin",
    "thiruvananthapuram",
    "trivandrum",
    "vadodara",
    "bombay",
    "new delhi",
  ]);

  for (const token of tokens) {
    if (commonCities.has(token)) {
      return token;
    }
  }

  return undefined;
}

/**
 * Compare two normalized names for similarity
 * Returns true if they have significant overlap in core tokens
 */
export function areSimilar(name1: NormalizedName, name2: NormalizedName): boolean {
  // Exact match
  if (name1.normalized === name2.normalized) {
    return true;
  }

  // Core token overlap: at least 60% of shorter set
  const shorter = Math.min(name1.coreTokens.length, name2.coreTokens.length);
  if (shorter === 0) return false;

  const set1 = new Set(name1.coreTokens);
  const set2 = new Set(name2.coreTokens);
  const overlap = [...set1].filter((t) => set2.has(t)).length;

  return overlap / shorter >= 0.6;
}
