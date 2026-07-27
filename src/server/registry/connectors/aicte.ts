/**
 * AICTE Connector
 *
 * Converts raw AICTE API responses to normalized EntryDraft format.
 * Does NOT fetch data, does NOT handle Playwright, does NOT touch the database.
 * Only concern: normalize institution records.
 *
 * Source: https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php
 * Raw Data Format: [AICTE ID, Name, Address, District, Type, Women, Minority, PID]
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from "../types";
import { scrapeAICTE } from "../scrapers/aicte";

export const aicte: RegistryConnector = {
  code: "aicte",
  displayName: "AICTE - Approved Technical Institutions",
  sector: ["engineering"],
  cadence: "annually",

  /**
   * Fetch raw data from AICTE API.
   * Delegates to the scraper which handles downloading.
   */
  async *fetch(ctx?: FetchContext) {
    yield* scrapeAICTE(ctx);
  },

  /**
   * Parse raw AICTE row into normalized EntryDraft.
   * AICTE API returns rows where:
   * [0] = AICTE ID
   * [1] = Institution Name
   * [2] = Address
   * [3] = District
   * [4] = Institution Type
   * [5] = Women (Y/N)
   * [6] = Minority (Y/N)
   * [7] = Program ID
   */
  parse(raw: RawRow): EntryDraft | null {
    // Validate required fields
    if (!raw.name || typeof raw.name !== "string") {
      return null;
    }

    // AICTE ID is the authoritative external identifier
    const externalId = String(raw.aicteId || `aicte-${raw.name}`);

    return {
      externalId,
      name: String(raw.name).trim(),
      city: raw.district ? String(raw.district).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: undefined, // AICTE API doesn't provide website
      email: undefined,   // AICTE API doesn't provide email
      rawData: raw,
    };
  },

  sourceUrls: [
    "https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php",
    "https://facilities.aicte-india.org/dashboard/pages/angulardashboard.php#!/approved",
  ],

  validation: {
    rowCountVariance: 0.15,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.005,
    requiredColumns: ["name", "externalId", "state"],
  } as ValidationRules,
};
