/**
 * HTML content extraction and parsing
 *
 * Features:
 * - Cheerio-based HTML parsing
 * - Structured data extraction: title, description, headings, main text
 * - Contact info: emails, phones (E.164 format), addresses
 * - Links: social media, outbound links
 * - Structured data: JSON-LD, meta tags
 * - India-specific:
 *   - Phone numbers → E.164 (+91)
 *   - PIN code detection (6 digits)
 *   - State detection (Indian states/UTs)
 *   - "affiliated to X" / "approved by Y" phrase mining with snippets
 * - JavaScript detection heuristics
 * - Main text extraction (readability-style, 8k cap)
 *
 * Returns structured ExtractedPage object
 */

import * as cheerio from "cheerio";

/**
 * Extracted page structure
 */
export interface ExtractedPage {
  title?: string;
  description?: string;
  headings: string[];
  mainText: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  socialLinks: SocialLink[];
  outboundLinks: Link[];
  jsonLd: Record<string, any>[];
  metaTags: Record<string, string>;
  detectedState?: string;
  detectedPinCode?: string;
  affiliation?: {
    text: string;
    snippet: string;
  };
  approval?: {
    text: string;
    snippet: string;
  };
  needsJavaScript: boolean;
}

/**
 * Social media link
 */
export interface SocialLink {
  platform:
    | "facebook"
    | "twitter"
    | "linkedin"
    | "youtube"
    | "instagram"
    | "other";
  url: string;
}

/**
 * Outbound link
 */
export interface Link {
  title: string;
  url: string;
  type: "internal" | "external";
}

/**
 * Extract structured data from HTML
 */
export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const result: ExtractedPage = {
    headings: [],
    mainText: "",
    emails: [],
    phones: [],
    addresses: [],
    socialLinks: [],
    outboundLinks: [],
    jsonLd: [],
    metaTags: {},
    needsJavaScript: false,
  };

  // Extract title (prefer og:title for cleaner social media titles)
  result.title = $('meta[property="og:title"]').attr("content")?.trim() ||
                 $('meta[name="title"]').attr("content")?.trim() ||
                 $("title").text().trim() ||
                 undefined;

  // Extract description
  result.description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim();

  // Extract headings
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim();
    if (text) result.headings.push(text);
  });

  // Extract meta tags
  $("meta").each((_, el) => {
    const name = $(el).attr("name") || $(el).attr("property");
    const content = $(el).attr("content");
    if (name && content) {
      result.metaTags[name] = content;
    }
  });

  // Extract JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      result.jsonLd.push(data);
    } catch {
      // Skip invalid JSON-LD
    }
  });

  // Extract main text (readability-style)
  result.mainText = extractMainText($, html).substring(0, 8192); // 8k cap

  // Extract contact info
  result.emails = extractEmails(html);
  result.phones = extractPhones(html);
  result.addresses = extractAddresses($);

  // Extract social links
  result.socialLinks = extractSocialLinks($, pageUrl);

  // Extract outbound links
  result.outboundLinks = extractOutboundLinks($, pageUrl);

  // India-specific extraction
  result.detectedState = detectState(result.mainText);
  result.detectedPinCode = detectPinCode(result.mainText);
  result.affiliation = extractAffiliation(result.mainText);
  result.approval = extractApproval(result.mainText);

  // Check if JavaScript is needed
  result.needsJavaScript = needsJavaScript($, result.mainText);

  return result;
}

/**
 * Extract main text using readability-style approach
 * Prioritize common article/content containers
 */
function extractMainText($: cheerio.CheerioAPI, html: string): string {
  // Remove script, style, and nav elements
  $("script, style, nav, footer, .sidebar, .ads, .advertisement").remove();

  // Find main content container
  let mainContent: string | null = null;

  // Try common selectors
  const selectors = [
    "main",
    "article",
    '[role="main"]',
    ".content",
    ".main-content",
    ".post-content",
    ".entry-content",
    ".page-content",
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0) {
      mainContent = el.text();
      break;
    }
  }

  // Fallback: use body
  if (!mainContent) {
    mainContent = $("body").text();
  }

  // Clean up whitespace
  return mainContent
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract email addresses
 */
function extractEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) || [];
  return [...new Set(matches)]; // Deduplicate
}

/**
 * Extract phone numbers and convert to E.164 format
 */
function extractPhones(html: string): string[] {
  const phones = new Set<string>();

  // Indian phone patterns (ordered by priority)
  const patterns = [
    // +91 followed by 10 digits (mobile) - most common format
    /\+91[-.\s]?([6-9]\d{9})/g,
    // Standalone 10-digit mobile (starts with 6-9)
    /\b([6-9]\d{9})\b/g,
    // +91 with flexible separators (mobile 3-3-4 or 3-4-3 pattern)
    /\+91[-.\s]?([6-9]\d{2})[-.\s]?(\d{3,4})[-.\s]?(\d{3,4})/g,
    // Landline: 0 + area code + number (0XX-XXXX-XXXX format)
    /\b0([ \d]{2,4})[-.\s]?(\d{3,4})[-.\s]?(\d{4,5})\b/g,
    // Landline: +91 + area code + number
    /\+91[-.\s]?([1-4]\d{1,3})[-.\s]?(\d{3,4})[-.\s]?(\d{4,5})/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const phone = normalizePhone(match[0]);
      if (phone) phones.add(phone);
    }
  }

  return Array.from(phones);
}

/**
 * Normalize phone to E.164 format
 */
export function normalizePhone(phone: string): string {
  // Remove common separators
  let cleaned = phone.replace(/[-.\s()]/g, "");

  // Remove leading + if present
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Handle already formatted 919876543210 (12 digits)
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    if (/^91[6-9]/.test(cleaned)) {
      return `+${cleaned}`;
    }
    // Landline format like 912225767086 (must have recognizable area code pattern)
    if (/^91[1-4][0-9]{8,9}$/.test(cleaned)) {
      return `+${cleaned}`;
    }
  }

  // Handle 10-digit Indian mobile numbers (must start with 6-9)
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Handle 11-digit with leading 0 (mobile)
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    const withoutZero = cleaned.substring(1);
    if (/^[6-9]/.test(withoutZero)) {
      return `+91${withoutZero}`;
    }
    // Landline like 02225767086 (0 + area code + number)
    if (/^[1-4][0-9]{8,9}$/.test(withoutZero)) {
      return `+91${withoutZero}`;
    }
  }

  // Handle 10-digit starting with 0 (landline format: 0XX XXXXXXX)
  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    const areaCode = cleaned.substring(0, 3);
    // Check if it looks like a valid area code (1-4)
    if (/^0[1-4]/.test(cleaned)) {
      return `+91${cleaned.substring(1)}`;
    }
  }

  // Handle landline with area code (e.g., 2225767086) - must not look like a mobile
  if (cleaned.length >= 9 && cleaned.length <= 11 && /^[1-4][0-9]*$/.test(cleaned)) {
    // Only if first digit is 1-4 (area code range, not mobile 6-9)
    return `+91${cleaned}`;
  }

  return "";
}

/**
 * Extract addresses
 */
function extractAddresses($: cheerio.CheerioAPI): string[] {
  const addresses: string[] = [];
  const seen = new Set<string>();

  // Look for address elements with multiple selectors
  const selectors = [
    "address",
    "[itemprop='address']",
    ".address",
    ".location",
    ".contact-address",
    "[data-address]",
    ".footer-address",
    "[role='contentinfo'] address",
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      let text = $(el).text().trim();
      // Clean up multiple spaces
      text = text.replace(/\s+/g, " ");
      if (text && text.length > 5 && !seen.has(text)) {
        addresses.push(text);
        seen.add(text);
      }
    });
  }

  return addresses;
}

/**
 * Extract social media links
 */
function extractSocialLinks(
  $: cheerio.CheerioAPI,
  pageUrl: string
): SocialLink[] {
  const links: SocialLink[] = [];
  const pageHost = new URL(pageUrl).hostname;

  const platformPatterns = {
    facebook: /facebook\.com|fb\.com/i,
    twitter: /twitter\.com|x\.com/i,
    linkedin: /linkedin\.com/i,
    youtube: /youtube\.com|youtu\.be/i,
    instagram: /instagram\.com/i,
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const url = new URL(href, pageUrl);
      if (url.hostname === pageHost) return; // Skip internal links

      for (const [platform, pattern] of Object.entries(platformPatterns)) {
        if (pattern.test(url.href)) {
          links.push({
            platform: platform as any,
            url: url.href,
          });
          return;
        }
      }
    } catch {
      // Skip invalid URLs
    }
  });

  return links;
}

/**
 * Extract outbound links
 */
function extractOutboundLinks($: cheerio.CheerioAPI, pageUrl: string): Link[] {
  const links: Link[] = [];
  const pageHost = new URL(pageUrl).hostname;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).text().trim();

    if (!href || !title) return;

    try {
      const url = new URL(href, pageUrl);
      const type = url.hostname === pageHost ? "internal" : "external";

      links.push({
        title,
        url: url.href,
        type,
      });
    } catch {
      // Skip invalid URLs
    }
  });

  return links;
}

/**
 * Detect Indian state from text
 */
function detectState(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  const stateList = [
    "maharashtra",
    "karnataka",
    "tamil nadu",
    "telangana",
    "andhra pradesh",
    "uttar pradesh",
    "delhi",
    "west bengal",
    "rajasthan",
    "punjab",
    "haryana",
    "bihar",
    "madhya pradesh",
    "jharkhand",
    "assam",
    "kerala",
    "goa",
    "himachal pradesh",
    "uttarakhand",
    "chhattisgarh",
    "odisha",
    "chandigarh",
    "puducherry",
    "jammu and kashmir",
    "ladakh",
  ];

  // Look for states with location context keywords
  const locationKeywords = ["located", "based", "situated", "campus", "headquarters", "address", "contact", "location"];

  // First, try to find states near location keywords (within 100 chars)
  for (const keyword of locationKeywords) {
    const regex = new RegExp(`.{0,100}${keyword}.{0,100}`, "gi");
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const context = match[0].toLowerCase();
      for (const state of stateList) {
        if (context.includes(state)) {
          return state;
        }
      }
    }
  }

  // Fallback: search in first 500 chars (more relevant content usually near start)
  const firstPart = lowerText.substring(0, 500);
  for (const state of stateList) {
    if (firstPart.includes(state)) {
      return state;
    }
  }

  // Last resort: search anywhere
  for (const state of stateList) {
    if (lowerText.includes(state)) {
      return state;
    }
  }

  return undefined;
}

/**
 * Detect 6-digit PIN code
 */
function detectPinCode(text: string): string | undefined {
  const pinMatch = text.match(/\b([0-9]{6})\b/);
  if (pinMatch && pinMatch[1]) {
    const pin = pinMatch[1];
    // Validate: PIN codes shouldn't start with 0
    if (!pin.startsWith("0")) {
      return pin;
    }
  }
  return undefined;
}

/**
 * Extract affiliation phrase with snippet
 */
function extractAffiliation(text: string): { text: string; snippet: string } | undefined {
  const pattern = /affiliated?\s+(?:with|to)\s+([^,.!?]+)/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    const snippet = text.substring(
      Math.max(0, match.index! - 50),
      Math.min(text.length, match.index! + match[0].length + 50)
    );
    return {
      text: match[1]!.trim(),
      snippet: snippet.trim(),
    };
  }
  return undefined;
}

/**
 * Extract approval phrase with snippet
 */
function extractApproval(text: string): { text: string; snippet: string } | undefined {
  const pattern = /approved?\s+(?:by|under)\s+([^,.!?]+)/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    const snippet = text.substring(
      Math.max(0, match.index! - 50),
      Math.min(text.length, match.index! + match[0].length + 50)
    );
    return {
      text: match[1]!.trim(),
      snippet: snippet.trim(),
    };
  }
  return undefined;
}

/**
 * Detect if page needs JavaScript rendering
 */
function needsJavaScript($: cheerio.CheerioAPI, mainText: string): boolean {
  // Heuristic 1: Meta refresh (redirect) - strong indicator
  if ($('meta[http-equiv="refresh"]').length > 0) {
    return true;
  }

  // Heuristic 2: SPA framework markers - strong indicator
  const spaMarkers = [
    'div[ng-app]',      // AngularJS
    '[data-reactroot]', // React
    '[data-react]',
    '.app--root',
    '.nuxt-child',      // Nuxt
    '[v-app]',          // Vue
  ];

  for (const marker of spaMarkers) {
    if ($(marker).length > 0) {
      return true;
    }
  }

  // Heuristic 3: Empty root div + very little content (combined indicator)
  const rootDivs = $("#root, #app");
  if (rootDivs.length > 0) {
    for (const div of rootDivs) {
      const content = $(div).text().trim();
      // Only flag as SPA if root div is empty/minimal AND page has little content overall
      if ((!content || content.length < 50) && mainText.trim().length < 100) {
        return true;
      }
    }
  }

  // Heuristic 4: Very minimal content combined with no h1/h2/main tags (last resort)
  // Only trigger if text is < 50 chars AND page lacks structure
  if (mainText.trim().length < 50) {
    const hasStructure = $("h1, h2, main, article, section").length > 0;
    if (!hasStructure) {
      return true;
    }
  }

  return false;
}

// Export state list for reuse
export const INDIAN_STATES_LIST = [
  "maharashtra",
  "karnataka",
  "tamil nadu",
  "telangana",
  "andhra pradesh",
  "uttar pradesh",
  "delhi",
  "west bengal",
  "rajasthan",
  "punjab",
  "haryana",
  "bihar",
  "madhya pradesh",
  "jharkhand",
  "assam",
  "kerala",
  "goa",
  "himachal pradesh",
  "uttarakhand",
  "chhattisgarh",
  "odisha",
  "chandigarh",
  "puducherry",
  "jammu and kashmir",
  "ladakh",
];
