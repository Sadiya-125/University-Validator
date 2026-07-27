/**
 * AISHE (All India Survey on Higher Education) Connectors
 *
 * Fetches institution data from AISHE portal using web scraping.
 * Source: https://dashboard.aishe.gov.in/hedirectory/
 * Method: Playwright (JavaScript-rendered Angular portal with pagination)
 * Scope: Universities and Colleges across India
 */

import {
  RegistryConnector,
  RawRow,
  EntryDraft,
  ValidationRules,
  FetchContext,
} from '../types';
import {
  scrapeAISHEUniversities,
  scrapeAISHEColleges,
} from '../scrapers/aishe';

/**
 * AISHE Universities Connector
 * Fetches all universities registered with AISHE
 */
export const aisheUniversities: RegistryConnector = {
  code: 'aishe-universities',
  displayName: 'AISHE - Universities',
  sector: ['higher-education'],
  cadence: 'annually',

  /**
   * Fetch raw university data from AISHE portal.
   * Delegates to the AISHE universities scraper.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeAISHEUniversities(ctx);
  },

  /**
   * Parse a raw AISHE university row into an entry draft.
   * Normalizes fields and stores additional data in rawData.
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

    // Use provided externalId or generate from AISHE code
    const externalId =
      raw.externalId ||
      `aishe-university-${raw.aisheCode}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: raw.website ? String(raw.website).trim() : undefined,
      rawData: {
        aisheCode: raw.aisheCode,
        district: raw.district,
        institutionType: raw.institutionType,
        yearOfEstablishment: raw.yearOfEstablishment,
        location: raw.location,
      },
    };
  },

  /**
   * Source URLs for reference.
   */
  sourceUrls: [
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/U/ALL',
  ],

  /**
   * Validation rules for AISHE universities.
   */
  validation: {
    rowCountVariance: 0.25,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};

/**
 * AISHE Colleges Connector
 * Fetches all colleges registered with AISHE
 */
export const aisheColleges: RegistryConnector = {
  code: 'aishe-colleges',
  displayName: 'AISHE - Colleges',
  sector: ['higher-education'],
  cadence: 'annually',

  /**
   * Fetch raw college data from AISHE portal.
   * Delegates to the AISHE colleges scraper.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeAISHEColleges(ctx);
  },

  /**
   * Parse a raw AISHE college row into an entry draft.
   * Normalizes fields and stores additional data in rawData.
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

    // Use provided externalId or generate from AISHE code
    const externalId =
      raw.externalId ||
      `aishe-college-${raw.aisheCode}`.toLowerCase();

    return {
      externalId: String(externalId),
      name,
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: raw.website ? String(raw.website).trim() : undefined,
      rawData: {
        aisheCode: raw.aisheCode,
        district: raw.district,
      },
    };
  },

  /**
   * Source URLs for reference.
   */
  sourceUrls: [
    'https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/C/ALL',
  ],

  /**
   * Validation rules for AISHE colleges.
   */
  validation: {
    rowCountVariance: 0.25,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
