/**
 * NMC (National Medical Commission) Connector
 *
 * Source: https://www.nmc.org.in/information-desk/college-and-course-search/archival-data-of-college-and-course/
 * Method: Playwright (DataTables pagination)
 * Scope: Archival closed colleges and course data
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from '../types';
import { scrapeNMCColleges } from '../scrapers/nmc';

export const nmc: RegistryConnector = {
  code: 'nmc',
  displayName: 'NMC - Archival Colleges Data',
  sector: ['medical'],
  cadence: 'monthly',

  async *fetch(ctx?: FetchContext) {
    yield* scrapeNMCColleges(ctx);
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
      city: raw.city ? String(raw.city).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      website: raw.website ? String(raw.website).trim() : undefined,
      rawData: {
        courseName: raw.courseName,
        universityName: raw.universityName,
        yearOfInception: raw.yearOfInception,
        intake: raw.intake,
        recognition: raw.recognition,
        remarks: raw.remarks,
      },
    };
  },

  sourceUrls: [
    'https://www.nmc.org.in/information-desk/college-and-course-search/archival-data-of-college-and-course/',
  ],

  validation: {
    rowCountVariance: 0.15,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
