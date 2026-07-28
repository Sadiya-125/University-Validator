/**
 * Source applicability logic
 *
 * Maps institution types to relevant verification sources.
 * Used by verification service to determine which enrichers to run.
 *
 * Export for scoring/ so a medical college is not penalized for absence from AICTE.
 */

import type { ResolvedIdentity } from "../discovery/types";
import {
  AuthorityCode,
  InstitutionType,
  type ApplicableSource,
} from "./types";

/**
 * Authority to tier mapping
 */
const AUTHORITY_TIERS: Record<AuthorityCode, "mirror" | "api" | "live"> = {
  // Always available (cached or direct)
  [AuthorityCode.UGC_FAKE]: "mirror", // UGC fake list
  [AuthorityCode.AISHE]: "mirror", // All India Survey
  [AuthorityCode.WIKIDATA]: "api", // Wikidata (external API)
  [AuthorityCode.WEBSITE]: "api", // Web fetch
  [AuthorityCode.NAD]: "api", // DigiLocker NAD

  // Sector regulators (all live access or mirror if available)
  [AuthorityCode.AICTE]: "live", // AICTE approval
  [AuthorityCode.NMC]: "live", // Medical Commission
  [AuthorityCode.INC]: "live", // Nursing Council
  [AuthorityCode.PCI]: "live", // Pharmacy Council
  [AuthorityCode.NCTE]: "live", // Teacher Education
  [AuthorityCode.COA]: "live", // Architecture Council
  [AuthorityCode.BCI]: "live", // Bar Council
  [AuthorityCode.UGC]: "live", // UGC (general)

  // School boards
  [AuthorityCode.CBSE]: "mirror", // CBSE (typically cached)
  [AuthorityCode.CISCE]: "mirror", // CISCE
  [AuthorityCode.NIOS]: "mirror", // NIOS
};

/**
 * Institution type to required authorities mapping
 */
const TYPE_TO_AUTHORITIES: Record<InstitutionType, AuthorityCode[]> = {
  // Engineering colleges
  [InstitutionType.ENGINEERING]: [
    AuthorityCode.AICTE,
    AuthorityCode.UGC,
    AuthorityCode.NAAC,
  ],

  // Medical colleges
  [InstitutionType.MEDICAL]: [
    AuthorityCode.NMC,
    AuthorityCode.UGC,
  ],

  // Dental colleges
  [InstitutionType.DENTAL]: [
    AuthorityCode.NMC,
    AuthorityCode.UGC,
  ],

  // Pharmacy colleges
  [InstitutionType.PHARMACY]: [
    AuthorityCode.PCI,
    AuthorityCode.AICTE,
    AuthorityCode.UGC,
  ],

  // Nursing institutions
  [InstitutionType.NURSING]: [
    AuthorityCode.INC,
    AuthorityCode.UGC,
  ],

  // Teacher education
  [InstitutionType.TEACHER_ED]: [
    AuthorityCode.NCTE,
    AuthorityCode.UGC,
  ],

  // Architecture colleges
  [InstitutionType.ARCHITECTURE]: [
    AuthorityCode.COA,
    AuthorityCode.AICTE,
    AuthorityCode.UGC,
  ],

  // Law colleges
  [InstitutionType.LAW]: [
    AuthorityCode.BCI,
    AuthorityCode.UGC,
  ],

  // Universities
  [InstitutionType.UNIVERSITY]: [
    AuthorityCode.UGC,
    AuthorityCode.AISHE,
  ],

  // Schools
  [InstitutionType.SCHOOL]: [
    AuthorityCode.CBSE,
    AuthorityCode.CISCE,
    AuthorityCode.NIOS,
    // State boards handled dynamically
  ],

  // Uncategorized
  [InstitutionType.OTHER]: [
    AuthorityCode.UGC,
  ],
};

/**
 * Always-included authorities (across all types)
 */
const ALWAYS_INCLUDED: AuthorityCode[] = [
  AuthorityCode.UGC_FAKE, // Terminal short-circuit if fake
  AuthorityCode.AISHE, // General verification
  AuthorityCode.WIKIDATA, // Identity corroboration
  AuthorityCode.WEBSITE, // Official site verification
  AuthorityCode.NAD, // DigiLocker document availability
];

/**
 * Determine relevant verification sources for an identity
 */
export function relevantSources(identity: ResolvedIdentity): ApplicableSource[] {
  const sources: ApplicableSource[] = [];

  // Infer institution type from identity (heuristic)
  const instituteType = inferInstitutionType(identity);

  // Get authorities for this type
  const typeAuthorities = TYPE_TO_AUTHORITIES[instituteType] || [];

  // Always-included authorities
  for (const authority of ALWAYS_INCLUDED) {
    if (!sources.some((s) => s.authority === authority)) {
      sources.push({
        authority,
        tier: AUTHORITY_TIERS[authority] || "api",
        rationale: "Always-included verification source",
      });
    }
  }

  // Type-specific authorities
  for (const authority of typeAuthorities) {
    if (!sources.some((s) => s.authority === authority)) {
      const rationale = getAuthorityRationale(instituteType, authority);
      sources.push({
        authority,
        tier: AUTHORITY_TIERS[authority] || "live",
        rationale,
      });
    }
  }

  // State-specific authorities (for schools)
  if (instituteType === InstitutionType.SCHOOL && identity.state) {
    const stateBoard = getStateBoardAuthority(identity.state);
    if (
      stateBoard &&
      !sources.some((s) => s.authority === stateBoard)
    ) {
      sources.push({
        authority: stateBoard,
        tier: "mirror",
        rationale: `State board verification (${identity.state})`,
      });
    }
  }

  return sources;
}

/**
 * Infer institution type from identity
 */
function inferInstitutionType(identity: ResolvedIdentity): InstitutionType {
  const name = identity.canonicalName.toLowerCase();

  // Check for keywords in name
  if (
    name.includes("engineering") ||
    name.includes("polytechnic") ||
    name.includes("nit") ||
    name.includes("iit")
  ) {
    return InstitutionType.ENGINEERING;
  }

  if (
    name.includes("medical") ||
    name.includes("medical college")
  ) {
    return InstitutionType.MEDICAL;
  }

  if (
    name.includes("dental") ||
    name.includes("dental college")
  ) {
    return InstitutionType.DENTAL;
  }

  if (
    name.includes("pharmacy") ||
    name.includes("pharmaceutical")
  ) {
    return InstitutionType.PHARMACY;
  }

  if (
    name.includes("nursing") ||
    name.includes("nurse")
  ) {
    return InstitutionType.NURSING;
  }

  if (
    name.includes("teacher") ||
    name.includes("education college") ||
    name.includes("ttes")
  ) {
    return InstitutionType.TEACHER_ED;
  }

  if (
    name.includes("architecture") ||
    name.includes("architect")
  ) {
    return InstitutionType.ARCHITECTURE;
  }

  if (
    name.includes("law") ||
    name.includes("legal")
  ) {
    return InstitutionType.LAW;
  }

  if (
    name.includes("university") ||
    name.includes("university college")
  ) {
    return InstitutionType.UNIVERSITY;
  }

  if (
    name.includes("school") ||
    name.includes("academy") ||
    name.includes("vidyalaya")
  ) {
    return InstitutionType.SCHOOL;
  }

  return InstitutionType.OTHER;
}

/**
 * Get rationale for why an authority applies
 */
function getAuthorityRationale(
  type: InstitutionType,
  authority: AuthorityCode
): string {
  const rationales: Record<InstitutionType, Record<AuthorityCode, string>> = {
    [InstitutionType.ENGINEERING]: {
      [AuthorityCode.AICTE]: "Engineering colleges are AICTE-approved",
      [AuthorityCode.UGC]: "Engineering colleges are UGC-affiliated",
      [AuthorityCode.NAAC]: "Quality assurance agency",
    },
    [InstitutionType.MEDICAL]: {
      [AuthorityCode.NMC]: "Medical colleges are NMC-regulated",
      [AuthorityCode.UGC]: "Medical colleges are UGC-affiliated",
    },
    [InstitutionType.DENTAL]: {
      [AuthorityCode.NMC]: "Dental colleges are NMC-regulated",
      [AuthorityCode.UGC]: "Dental colleges are UGC-affiliated",
    },
    [InstitutionType.PHARMACY]: {
      [AuthorityCode.PCI]: "Pharmacy colleges are PCI-regulated",
      [AuthorityCode.AICTE]: "Pharmacy colleges are AICTE-accredited",
      [AuthorityCode.UGC]: "Pharmacy colleges are UGC-affiliated",
    },
    [InstitutionType.NURSING]: {
      [AuthorityCode.INC]: "Nursing colleges are INC-regulated",
      [AuthorityCode.UGC]: "Nursing colleges are UGC-affiliated",
    },
    [InstitutionType.TEACHER_ED]: {
      [AuthorityCode.NCTE]: "Teacher education is NCTE-regulated",
      [AuthorityCode.UGC]: "Teacher education is UGC-affiliated",
    },
    [InstitutionType.ARCHITECTURE]: {
      [AuthorityCode.COA]: "Architecture colleges are COA-regulated",
      [AuthorityCode.AICTE]: "Architecture colleges are AICTE-accredited",
      [AuthorityCode.UGC]: "Architecture colleges are UGC-affiliated",
    },
    [InstitutionType.LAW]: {
      [AuthorityCode.BCI]: "Law colleges are BCI-regulated",
      [AuthorityCode.UGC]: "Law colleges are UGC-affiliated",
    },
    [InstitutionType.UNIVERSITY]: {
      [AuthorityCode.UGC]: "Universities are UGC-regulated",
      [AuthorityCode.AISHE]: "Universities are AISHE-surveyed",
    },
    [InstitutionType.SCHOOL]: {
      [AuthorityCode.CBSE]: "CBSE-affiliated schools",
      [AuthorityCode.CISCE]: "ICSE-affiliated schools",
      [AuthorityCode.NIOS]: "Open schooling",
    },
    [InstitutionType.OTHER]: {
      [AuthorityCode.UGC]: "General higher education verification",
    },
  };

  return (
    rationales[type]?.[authority] ||
    `Verification via ${authority}`
  );
}

/**
 * Get state board authority code
 */
function getStateBoardAuthority(state: string): AuthorityCode | undefined {
  // In production, this would map each state to its board
  // For now, return generic state board reference
  const stateLower = state.toLowerCase();

  // A few key states
  if (stateLower.includes("maharashtra")) {
    return AuthorityCode.CBSE; // Could also be state board
  }
  if (stateLower.includes("karnataka")) {
    return AuthorityCode.CBSE; // Could also be state board
  }
  if (stateLower.includes("tamil")) {
    return AuthorityCode.CBSE; // Could also be state board
  }

  return undefined; // Generic state board - no specific code
}

/**
 * Check if authority is applicable for institution type
 */
export function isAuthorityApplicable(
  type: InstitutionType,
  authority: AuthorityCode
): boolean {
  // Always-included are always applicable
  if (ALWAYS_INCLUDED.includes(authority)) {
    return true;
  }

  // Check type-specific mapping
  const typeAuthorities = TYPE_TO_AUTHORITIES[type] || [];
  return typeAuthorities.includes(authority);
}

/**
 * Export authority tiers for external use
 */
export { AUTHORITY_TIERS, ALWAYS_INCLUDED };
