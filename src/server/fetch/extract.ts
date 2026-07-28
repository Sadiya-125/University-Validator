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

  // Extract title
  result.title = $("title").text().trim() || $('meta[property="og:title"]').attr("content")?.trim();

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

  // Indian phone patterns
  const patterns = [
    /\b(\+91|0)?[-.]?([6-9]\d{2})[-.]?(\d{4})[-.]?(\d{4})\b/g, // 10-digit
    /\b(\+91)[-.]?(\d{10})\b/g, // +91 format
    /\b0(\d{3,4})[-.]?(\d{6,7})\b/g, // Landline
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
  // Remove common separators and +
  let cleaned = phone.replace(/[-.\s()+]/g, "");

  // Handle already formatted +919876543210
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    if (/^91[6-9]/.test(cleaned)) {
      return `+${cleaned}`;
    }
  }

  // Handle 10-digit Indian numbers
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Handle 11-digit with leading 0
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
    if (/^[6-9]/.test(cleaned)) {
      return `+91${cleaned}`;
    }
  }

  return "";
}

/**
 * Extract addresses
 */
function extractAddresses($: cheerio.CheerioAPI): string[] {
  const addresses: string[] = [];

  // Look for address elements
  $("address, [itemprop='address'], .address, .location").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 5) {
      addresses.push(text);
    }
  });

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
  // Heuristic 1: Body text < 200 chars
  if (mainText.trim().length < 200) {
    return true;
  }

  // Heuristic 2: Empty root div (common in SPAs)
  const rootDivs = $("#root, #app");
  if (rootDivs.length > 0) {
    for (const div of rootDivs) {
      const content = $(div).text().trim();
      if (!content || content.length < 50) {
        return true;
      }
    }
  }

  // Heuristic 3: Meta refresh (redirect)
  if ($('meta[http-equiv="refresh"]').length > 0) {
    return true;
  }

  // Heuristic 4: SPA markers
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
