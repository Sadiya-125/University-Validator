/**
 * UGC (University Grants Commission) - Fake Universities List Connector
 *
 * Fetches fake/fraudulent institutions list from UGC using web scraping.
 * Source: https://www.ugc.gov.in/universitydetails/Fakeuniversity
 * Method: Static HTML parsing
 * Scope: List of fake/fraudulent institutions to avoid
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from '../types';
import { scrapeUGCFake } from '../scrapers/ugc-fake';

export const ugcFake: RegistryConnector = {
  code: 'ugc-fake',
  displayName: 'UGC - Fake Universities List',
  sector: ['higher-education'],
  cadence: 'monthly',

  /**
   * Fetch raw fake institution data from UGC portal.
   * Delegates to the UGC fake universities scraper.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeUGCFake(ctx);
  },

  /**
   * Parse a raw UGC fake institution row into an entry draft.
   * Normalizes fields and marks all as fake/fraudulent.
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

    // Generate externalId from name
    const externalId =
      raw.externalId ||
      `ugc-fake-${name.replace(/\s+/g, "-")}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: raw.website ? String(raw.website) : undefined,
      email: raw.email ? String(raw.email) : undefined,
      rawData: {
        ...raw,
        status: "Fake/Fraudulent", // Mark in raw data for reference
      },
    };
  },

  /**
   * Source URLs for reference.
   */
  sourceUrls: ['https://www.ugc.gov.in/universitydetails/Fakeuniversity'],

  /**
   * Validation rules for UGC fake list.
   * Allow ±30% variance, lower threshold for required columns.
   */
  validation: {
    rowCountVariance: 0.3,
    requiredColumnsThreshold: 0.9,
    duplicateExternalIdThreshold: 0.02,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
