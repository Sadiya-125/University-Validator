/**
 * DigiLocker NAD (National Academic Depository) Connector
 *
 * Source: https://nad.digilocker.gov.in/recordsbyyear
 * Method: Scraping NAD registry to extract all registered institutions
 * Scope: All degree-issuing institutions registered with DigiLocker
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from '../types';
import { fetchNADInstitutions } from '../verification/digilocker';

/**
 * Scrape DigiLocker NAD institutions
 * Fetches all registered institutions from the National Academic Depository
 */
async function* scrapeDigiLockerNAD(ctx?: FetchContext): AsyncIterable<RawRow> {
  ctx?.logger?.info('DigiLocker: Starting NAD institution scrape');

  try {
    // Fetch all institutions from NAD
    const institutions = await fetchNADInstitutions(ctx);

    ctx?.logger?.info(`DigiLocker: Retrieved ${institutions.length} institutions from NAD`);

    // Convert to RawRow format
    let count = 0;
    for (const inst of institutions) {
      count++;
      yield {
        externalId: `digilocker-${inst.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
        name: inst.name,
        state: inst.state || undefined,
        documentTypes: inst.documentTypes ? inst.documentTypes.join('; ') : undefined,
      } as RawRow;
    }

    ctx?.logger?.info(`DigiLocker: Yielded ${count} institutions`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`DigiLocker: Error scraping NAD: ${errorMsg}`);
  }
}

export const digilocker: RegistryConnector = {
  code: 'digilocker',
  displayName: 'DigiLocker NAD - Registered Institutions',
  sector: ['higher-education', 'research'],
  cadence: 'monthly',

  async *fetch(ctx?: FetchContext) {
    yield* scrapeDigiLockerNAD(ctx);
  },

  parse(raw: RawRow): EntryDraft | null {
    // Validate required fields
    if (!raw.name || typeof raw.name !== 'string') {
      return null;
    }

    const name = String(raw.name).trim();
    if (name.length === 0) {
      return null;
    }

    return {
      externalId: String(raw.externalId),
      name,
      state: raw.state ? String(raw.state).trim() : undefined,
      rawData: {
        documentTypes: raw.documentTypes,
      },
    };
  },

  sourceUrls: [
    'https://nad.digilocker.gov.in/recordsbyyear',
  ],

  validation: {
    rowCountVariance: 0.15,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
