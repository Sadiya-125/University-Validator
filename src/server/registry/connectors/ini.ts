/**
 * INI (Institutes of National Importance) Connector
 *
 * Scope: Parliament-created institutions (IIT, NIT, IIIT, AIIMS, IISc, etc.)
 * Source: Wikipedia (https://en.wikipedia.org/wiki/Institutes_of_National_Importance)
 * Method: HTTP fetch + HTML table parsing with regex
 * Total institutions: 173+ (as of June 2026)
 *
 * These are established by Acts of Parliament and are not under UGC or AICTE.
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from '../types';
import { scrapeINI } from '../scrapers/ini';

export const ini: RegistryConnector = {
  code: 'ini',
  displayName: 'INI - Institutes of National Importance',
  sector: ['higher-education', 'research'],
  cadence: 'annually',

  /**
   * Fetch raw institution data from Wikipedia.
   * Delegates to the INI scraper which fetches and parses Wikipedia tables.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeINI(ctx);
  },

  /**
   * Parse a raw INI row into an entry draft.
   * Normalizes fields from raw data to standard EntryDraft format.
   */
  parse(raw: RawRow): EntryDraft | null {
    // Validate required fields
    if (!raw.name || typeof raw.name !== 'string') {
      return null;
    }

    const name = String(raw.name).trim();
    if (name.length === 0) {
      return null;
    }

    // Generate externalId
    const externalId =
      raw.externalId ||
      `ini-${name.replace(/\s+/g, '-')}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      state: raw.state ? String(raw.state).trim() : undefined,
      city: raw.city ? String(raw.city).trim() : undefined,
      website: raw.website ? String(raw.website) : undefined,
      email: raw.email ? String(raw.email) : undefined,
      rawData: {
        ...raw,
      },
    };
  },

  /**
   * Source URL for INI data from Wikipedia.
   * Contains all 173+ institutions across all categories.
   */
  sourceUrls: [
    'https://en.wikipedia.org/wiki/Institutes_of_National_Importance',
  ],

  /**
   * Validation rules for INI registry.
   * Wikipedia provides a stable, well-maintained list of 173+ institutions.
   */
  validation: {
    rowCountVariance: 0.10, // ±10% variance from expected 173
    requiredColumnsThreshold: 0.99, // Almost all should have names
    duplicateExternalIdThreshold: 0.01, // Very few duplicates allowed
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
