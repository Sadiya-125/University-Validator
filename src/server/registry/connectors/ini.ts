/**
 * INI (Institutes of National Importance) Connector
 *
 * Scope: Parliament-created institutions (IIT, NIT, IIIT, AIIMS, IISc, etc.)
 * Source: AISHE Dashboard (https://dashboard.aishe.gov.in/hedirectory/)
 * Method: Playwright-based scraping from mat-table data
 * Total institutions: 173+
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
   * Fetch raw institution data from AISHE Dashboard.
   * Delegates to the INI scraper which uses Playwright to extract data from mat-tables.
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
   * Source URLs for INI data from AISHE Dashboard.
   * Covers all 13 INI categories with 173+ institutions.
   */
  sourceUrls: [
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20information%20technology',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20management',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20science%20education%20&%20research',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20technology',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20statistical%20institute',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20desig',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20fashion%20technology',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20technology',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/school%20of%20planning%20&%20architecture',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20pharmaceutical',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/inicu',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/all%20india%20institute%20of%20medical%20science',
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/others',
  ],

  /**
   * Validation rules for INI registry.
   * Scraping from AISHE may have some variance; expected ~173 institutions.
   */
  validation: {
    rowCountVariance: 0.15, // Allow some variance for scraping variations
    requiredColumnsThreshold: 0.95, // Most should have names
    duplicateExternalIdThreshold: 0.01, // Very few duplicates allowed
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
