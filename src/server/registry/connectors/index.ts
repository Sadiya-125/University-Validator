/**
 * Registry connectors index.
 * Exports all implemented connectors with web scraping capabilities.
 *
 * Only includes connectors with active scrapers:
 * - ugc-recognized, ugc-fake, ugc-colleges (UGC scraping)
 * - aicte (AICTE scraping)
 * - aishe-universities, aishe-colleges (AISHE scraping)
 * - nmc (NMC scraping)
 * - pci (PCI scraping)
 * - ini (AISHE Dashboard scraping)
 * - digilocker (NAD registry verification)
 */

import { RegistryConnector } from "../types";

// Import all active scrapers
import { ugcRecognized } from "./ugc-recognized";
import { ugcFake } from "./ugc-fake";
import { ugcColleges } from "./ugc-colleges";
import { aicte } from "./aicte";
import { aisheUniversities, aisheColleges } from "./aishe";
import { nmc } from "./nmc";
import { pci } from "./pci";
import { ini } from "./ini";
import { digilocker } from "./digilocker";

/**
 * Registry of all implemented connectors.
 * Maps authority codes to connector implementations.
 * All connectors use live data sources (no fixtures).
 */
export const connectors: Record<string, RegistryConnector> = {
  "ugc-recognized": ugcRecognized,
  "ugc-fake": ugcFake,
  "ugc-colleges": ugcColleges,
  "aicte": aicte,
  "aishe-universities": aisheUniversities,
  "aishe-colleges": aisheColleges,
  "nmc": nmc,
  "pci": pci,
  "ini": ini,
  "digilocker": digilocker,
};

// Aliases for compatibility
export const CONNECTORS = connectors;
export const ALL_CODES = Object.keys(connectors);

/**
 * Get a connector by code.
 * Throws if the connector is not found.
 */
export function getConnector(code: string): RegistryConnector {
  const connector = connectors[code];
  if (!connector) {
    throw new Error(`Unknown connector: ${code}`);
  }
  return connector;
}

/**
 * List all available connectors.
 */
export function listConnectors(): Array<{ code: string; displayName: string }> {
  return Object.entries(connectors).map(([code, conn]) => ({
    code,
    displayName: conn.displayName,
  }));
}

// Export individual connectors
export { ugcRecognized, ugcFake, ugcColleges, aicte, aisheUniversities, aisheColleges, nmc, pci, ini, digilocker };
