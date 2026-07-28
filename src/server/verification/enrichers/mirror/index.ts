/**
 * Mirror enrichers for all authorities
 */

import type { Enricher } from "../../types";
import { AuthorityCode } from "../../types";
import { createMirrorEnricher } from "./base";

/**
 * Mirror enrichers by authority
 */
export const MIRROR_ENRICHERS: Record<AuthorityCode, Enricher | null> = {
  // Always-included
  [AuthorityCode.UGC_FAKE]: createMirrorEnricher(AuthorityCode.UGC_FAKE),
  [AuthorityCode.AISHE]: createMirrorEnricher(AuthorityCode.AISHE),
  [AuthorityCode.WIKIDATA]: null, // API tier, not mirror
  [AuthorityCode.WEBSITE]: null, // API tier, not mirror
  [AuthorityCode.NAD]: createMirrorEnricher(AuthorityCode.NAD),

  // Sector regulators
  [AuthorityCode.AICTE]: createMirrorEnricher(AuthorityCode.AICTE),
  [AuthorityCode.NMC]: createMirrorEnricher(AuthorityCode.NMC),
  [AuthorityCode.INC]: createMirrorEnricher(AuthorityCode.INC),
  [AuthorityCode.PCI]: createMirrorEnricher(AuthorityCode.PCI),
  [AuthorityCode.NCTE]: createMirrorEnricher(AuthorityCode.NCTE),
  [AuthorityCode.COA]: createMirrorEnricher(AuthorityCode.COA),
  [AuthorityCode.BCI]: createMirrorEnricher(AuthorityCode.BCI),
  [AuthorityCode.UGC]: createMirrorEnricher(AuthorityCode.UGC),

  // School boards
  [AuthorityCode.CBSE]: createMirrorEnricher(AuthorityCode.CBSE),
  [AuthorityCode.CISCE]: createMirrorEnricher(AuthorityCode.CISCE),
  [AuthorityCode.NIOS]: createMirrorEnricher(AuthorityCode.NIOS),
};

/**
 * Get mirror enricher for authority
 */
export function getMirrorEnricher(authority: AuthorityCode): Enricher | null {
  return MIRROR_ENRICHERS[authority] || null;
}

/**
 * Get all available mirror enrichers
 */
export function getAllMirrorEnrichers(): Enricher[] {
  return Object.values(MIRROR_ENRICHERS).filter((e) => e !== null) as Enricher[];
}
