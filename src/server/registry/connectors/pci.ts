/**
 * PCI (Pharmacy Council of India) Connector
 *
 * Source: https://www.pci.nic.in/
 * Method: Static HTML table scraping
 * Scope: Approved pharmacy education institutions across India
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from '../types';
import { scrapePCIInstitutions } from '../scrapers/pci';

export const pci: RegistryConnector = {
  code: 'pci',
  displayName: 'PCI - Pharmacy Institutions',
  sector: ['pharmacy'],
  cadence: 'quarterly',

  async *fetch(ctx?: FetchContext) {
    yield* scrapePCIInstitutions(ctx);
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
        institutionType: raw.institutionType,
        programType: raw.programType,
        pciCode: raw.pciCode,
        approvalInfo: raw.approvalInfo,
        examinationAuthority: raw.examinationAuthority,
      },
    };
  },

  sourceUrls: [
    'https://www.pci.nic.in/approved_degree_institutes_us__12.html',
    'https://www.pci.nic.in/approved_colleges_diplom_us_12.html',
    'https://www.pci.nic.in/approved_institutes_mpharm.html',
    'https://www.pci.nic.in/Diploma_institutions_only__conduct.html',
    'https://www.pci.nic.in/degre_institutes-only_for-conduct.html',
    'https://www.pci.nic.in/ApprovedInstitutionsForConductofPharmD.html',
    'https://www.pci.nic.in/ApprovedInstitutionsForConductofPharm.D_PostBaccalaureate.html',
    'https://www.pci.nic.in/approved_institutes_bridge-courses_6.html',
  ],

  validation: {
    rowCountVariance: 0.2,
    requiredColumnsThreshold: 0.9,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ['name', 'externalId'],
  } as ValidationRules,
};
