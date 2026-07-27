/**
 * Shared enums for database schema.
 * Defined separately to avoid circular dependencies.
 */

// Institution types from §6 (16 authorities)
export const InstitutionType = {
  PUBLIC_UNIVERSITY: "public_university",
  DEEMED_UNIVERSITY: "deemed_university",
  PRIVATE_UNIVERSITY: "private_university",
  CENTRAL_UNIVERSITY: "central_university",
  STATE_UNIVERSITY: "state_university",
  INSTITUTE_OF_NATIONAL_IMPORTANCE: "institute_of_national_importance",
  ENGINEERING_COLLEGE: "engineering_college",
  MEDICAL_COLLEGE: "medical_college",
  PHARMACY_COLLEGE: "pharmacy_college",
  NURSING_COLLEGE: "nursing_college",
  TEACHER_TRAINING: "teacher_training",
  ARCHITECTURE_COLLEGE: "architecture_college",
  LAW_COLLEGE: "law_college",
  SCHOOL: "school",
  COLLEGE: "college",
  OTHER: "other",
} as const;

// Verdict bands from §11
export const Verdict = {
  GENUINE: "Genuine",
  LIKELY_GENUINE: "Likely Genuine",
  UNKNOWN: "Unknown",
  UNVERIFIED: "Unverified",
  FAKE: "Fake",
  NEW: "New",
} as const;

// Run state machine from §12
export const ValidationRunState = {
  QUEUED: "queued",
  DISCOVERING: "discovering",
  VERIFYING: "verifying",
  REASONING: "reasoning",
  SCORING: "scoring",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
} as const;

// Step status
export const StepStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  SKIPPED: "skipped",
  TIMEOUT: "timeout",
} as const;

// Evidence kinds
export const EvidenceKind = {
  INSTITUTION_RECORD: "institution_record",
  CONTACT_INFO: "contact_info",
  AFFILIATION_CLAIM: "affiliation_claim",
  APPROVAL_CLAIM: "approval_claim",
  WEBSITE: "website",
  IDENTITY_CORROBORATION: "identity_corroboration",
  CHECK_UNAVAILABLE: "check_unavailable",
  CONFLICTING_EVIDENCE: "conflicting_evidence",
} as const;

// Evidence tiers
export const EvidenceTier = {
  MIRROR: "mirror",        // Local DB, 20-80ms
  API: "api",              // Known endpoint, 200-600ms
  LIVE: "live",            // Government portal, 3-20s
} as const;

// Source codes
export const SourceCode = {
  UGC: "UGC",
  UGC_FAKE: "UGC_FAKE",
  AICTE: "AICTE",
  NMC: "NMC",
  PCI: "PCI",
  NCTE: "NCTE",
  COA: "COA",
  INC: "INC",
  BCI: "BCI",
  INI: "INI",
  AISHE: "AISHE",
  NAAC: "NAAC",
  NIRF: "NIRF",
  CBSE: "CBSE",
  CISCE: "CISCE",
  NIOS: "NIOS",
  NAD: "NAD",
  WIKIDATA: "WIKIDATA",
  WIKIPEDIA: "WIKIPEDIA",
  WEBSITE: "WEBSITE",
  MANUAL: "MANUAL",
} as const;

// Identity source (subset of SourceCode)
export const IdentitySource = {
  AICTE: "AICTE",
  UGC: "UGC",
  AISHE: "AISHE",
  NIRF: "NIRF",
  NAAC: "NAAC",
  NMC: "NMC",
  PCI: "PCI",
  NCTE: "NCTE",
  COA: "COA",
  INC: "INC",
  BCI: "BCI",
  INI: "INI",
  CBSE: "CBSE",
  CISCE: "CISCE",
  NIOS: "NIOS",
  WIKIDATA: "WIKIDATA",
  NAD: "NAD",
  WEBSITE: "WEBSITE",
  MANUAL: "MANUAL",
} as const;

// Snapshot state
export const SnapshotState = {
  RUNNING: "running",
  VALIDATING: "validating",
  PUBLISHED: "published",
  REJECTED: "rejected",
  FAILED: "failed",
  UNCHANGED: "unchanged",
} as const;

// Batch state
export const BatchState = {
  CREATED: "created",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

// Provider state (for circuit breaker)
export const ProviderState = {
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
} as const;

// Contact kinds
export const ContactKind = {
  EMAIL: "email",
  PHONE: "phone",
  FAX: "fax",
  WEBSITE: "website",
} as const;

// Link platforms
export const LinkPlatform = {
  OFFICIAL_WEBSITE: "official_website",
  SOCIAL_MEDIA: "social_media",
  WIKIDATA: "wikidata",
  WIKIPEDIA: "wikipedia",
} as const;
