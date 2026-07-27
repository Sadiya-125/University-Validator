/**
 * UGC Colleges Connector
 *
 * Fetches UGC-affiliated colleges from the UGC colleges portal using web scraping.
 * Source: https://www.ugc.gov.in/colleges
 * Method: Playwright (CSV/Excel export extraction)
 */

import { RegistryConnector, RawRow, EntryDraft, FetchContext } from "../types";
import { scrapeUGCColleges } from "../scrapers/ugc-colleges";

export const ugcColleges: RegistryConnector = {
  code: "ugc-colleges",
  displayName: "UGC - Colleges",
  sector: ["higher-education"],
  cadence: "quarterly",

  /**
   * Fetch raw college data from UGC colleges portal.
   * Delegates to the UGC colleges scraper.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeUGCColleges(ctx);
  },

  /**
   * Parse a raw UGC college row into an entry draft.
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
      `ugc-college-${name.replace(/\s+/g, "-")}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      affiliatedUniversity: raw.affiliatedUniversity
        ? String(raw.affiliatedUniversity).trim()
        : undefined,
      website: raw.website ? String(raw.website) : undefined,
      email: raw.email ? String(raw.email) : undefined,
      rawData: raw,
    };
  },

  /**
   * Source URLs for reference.
   */
  sourceUrls: ["https://www.ugc.gov.in/colleges"],

  /**
   * Validation rules for UGC colleges registry.
   * Allow ±30% row count variance.
   */
  validation: {
    rowCountVariance: 0.3,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ["name", "externalId"],
  },
};
