/**
 * UGC (University Grants Commission) Recognized Universities Connector
 *
 * Fetches recognized institutions from UGC portal using real web scraping.
 * Source: https://www.ugc.gov.in/universitydetails/university
 * Method: Playwright (JavaScript-rendered portal)
 */

import { RegistryConnector, RawRow, EntryDraft, FetchContext } from "../types";
import { scrapeUGCRecognized } from "../scrapers/ugc-recognized";

export const ugcRecognized: RegistryConnector = {
  code: "ugc-recognized",
  displayName: "UGC - Recognized Universities",
  sector: ["higher-education"],
  cadence: "quarterly",

  /**
   * Fetch raw institution data from UGC portal.
   * Delegates to the UGC recognized scraper.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeUGCRecognized(ctx);
  },

  /**
   * Parse a raw UGC row into an entry draft.
   * Normalizes fields from raw data to standard EntryDraft format.
   */
  parse(raw: RawRow): EntryDraft | null {
    // Validate required fields
    if (!raw.name || typeof raw.name !== "string") {
      return null;
    }

    const name = String(raw.name).trim();
    if (name.length === 0) {
      return null;
    }

    // Generate externalId from name if not provided
    const externalId =
      raw.externalId ||
      `ugc-recognized-${name.replace(/\s+/g, "-")}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: raw.website ? String(raw.website) : undefined,
      email: raw.email ? String(raw.email) : undefined,
      rawData: raw,
    };
  },

  /**
   * Source URLs for reference.
   */
  sourceUrls: [
    "https://www.ugc.gov.in/universitydetails/university",
  ],

  /**
   * Validation rules for UGC registry.
   * Allow ±30% row count variance (UGC portal can be unstable).
   */
  validation: {
    rowCountVariance: 0.3,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ["name", "externalId"],
  },
};
