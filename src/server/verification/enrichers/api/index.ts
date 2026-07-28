/**
 * API enrichers
 */

import type { Enricher } from "../../types";
import { AuthorityCode } from "../../types";
import { createWikidataEnricher } from "./wikidata";
import { createWikipediaEnricher } from "./wikipedia";
import { createWebsiteEnricher } from "./website";
import { createDigiLockerEnricher } from "./digilocker";

/**
 * Get all API enrichers
 */
export function getAPIEnrichers(): Enricher[] {
  return [
    createWikidataEnricher(),
    createWikipediaEnricher(),
    createWebsiteEnricher(),
    createDigiLockerEnricher(),
  ];
}

/**
 * Get API enricher by authority
 */
export function getAPIEnricher(authority: AuthorityCode): Enricher | null {
  switch (authority) {
    case AuthorityCode.WIKIDATA:
      return createWikidataEnricher();
    case AuthorityCode.WEBSITE:
      // Website is handled by both Wikipedia and Website enrichers
      return createWebsiteEnricher();
    case AuthorityCode.NAD:
      return createDigiLockerEnricher();
    default:
      return null;
  }
}
