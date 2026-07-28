/**
 * Verification enricher types and interfaces
 *
 * An enricher verifies institution identity by checking authoritative sources.
 * Evidence is collected across three tiers:
 * - mirror: cached registry lookups (fast, <80ms)
 * - api: public web APIs (medium, 1-5s)
 * - live: direct authority checks (slow, 5-30s, gated)
 *
 * Each enricher returns evidence items with quality scores.
 */

import type { ResolvedIdentity } from "../discovery/types";

/**
 * Evidence quality tiers
 */
export type VerificationTier = "mirror" | "api" | "live";

/**
 * Evidence quality scores
 */
export enum EvidenceQuality {
  TIER_MIRROR = 0.8, // Registry snapshot (high confidence, slightly dated)
  TIER_API = 0.7, // Public API (good confidence, delay possible)
  TIER_LIVE = 0.95, // Direct authority (highest confidence, real-time)
}

/**
 * Authority codes (ISO 3166-1 alpha-2 + sector code)
 */
export enum AuthorityCode {
  // Central authorities
  UGC = "UGC", // University Grants Commission
  AISHE = "AISHE", // All India Survey of Higher Education
  UGC_FAKE = "UGC_FAKE", // UGC fake list (terminal short-circuit)

  // Sector regulators
  AICTE = "AICTE", // All India Council for Technical Education (engineering, architecture)
  NMC = "NMC", // National Medical Commission (medical, dental)
  INC = "INC", // Indian Nursing Council
  PCI = "PCI", // Pharmacy Council of India
  NCTE = "NCTE", // National Council for Teacher Education
  COA = "COA", // Council of Architecture
  BCI = "BCI", // Bar Council of India

  // School boards
  CBSE = "CBSE", // Central Board of Secondary Education
  CISCE = "CISCE", // Council for the Indian School Certificate Examinations
  NIOS = "NIOS", // National Institute of Open Schooling

  // Data sources
  WIKIDATA = "WIKIDATA", // Wikidata (identity corroboration)
  WEBSITE = "WEBSITE", // Institution official website
  NAD = "NAD", // DigiLocker NAD (document availability)
}

/**
 * Institution type classification
 */
export enum InstitutionType {
  ENGINEERING = "engineering",
  MEDICAL = "medical",
  DENTAL = "dental",
  PHARMACY = "pharmacy",
  NURSING = "nursing",
  TEACHER_ED = "teacher_education",
  ARCHITECTURE = "architecture",
  LAW = "law",
  UNIVERSITY = "university",
  SCHOOL = "school",
  OTHER = "other",
}

/**
 * Evidence item from verification
 */
export interface EvidenceItem {
  // Source and timing
  source: AuthorityCode;
  tier: VerificationTier;
  timestamp: number;
  snapshot_date?: number; // For mirror tier (date the source was cached)

  // URL and content
  url?: string;
  content?: string;
  content_hash?: string; // SHA-256 of content for deduplication

  // Evidence classification
  category: "identity" | "legitimacy" | "contact" | "affiliation" | "approval" | "unavailable";

  // Quality assessment
  quality_score: number; // 0.0-1.0 (tier-derived)
  confidence?: number; // 0.0-1.0 (evidence-specific)

  // Matched content (for web evidence)
  matched_text?: string; // The specific sentence/excerpt corroborating claim
  claim_type?: "affiliated" | "approved" | "fake"; // For affiliation/approval evidence

  // Metadata
  error?: string; // If category="unavailable"
  metadata?: Record<string, unknown>;
}

/**
 * Enricher interface
 */
export interface Enricher {
  /**
   * Enricher name (e.g., "aicte-mirror", "wikidata-api", "ugc-live")
   */
  name: string;

  /**
   * Authority this enricher represents
   */
  authority: AuthorityCode;

  /**
   * Verification tier
   */
  tier: VerificationTier;

  /**
   * Verify identity and return evidence items
   */
  verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]>;

  /**
   * Health check
   */
  health(): Promise<boolean>;
}

/**
 * Verification context
 */
export interface VerificationContext {
  // Time constraints
  totalBudgetMs?: number; // Default: 6000ms
  tierBudgets?: {
    mirror?: number; // Default: 500ms
    api?: number; // Default: 3000ms
    live?: number; // Default: 2500ms
  };

  // Feature gates
  liveLookupEnabled?: boolean; // Default: USE_LIVE_AUTHORITIES env
  wikidataEnabled?: boolean; // Default: true
  webExtractionEnabled?: boolean; // Default: true

  // Thresholds
  genuineThreshold?: number; // Default: 0.85 - short-circuit before live tier
}

/**
 * Verification result
 */
export interface VerificationResult {
  // Evidence items
  evidence: EvidenceItem[];

  // Metadata
  sourcesAttempted: AuthorityCode[];
  sourcesUnavailable: AuthorityCode[];
  shortCircuitedAt?: string; // Tier name if short-circuited

  // Summary scores
  legitimacyScore?: number; // 0.0-1.0 computed from evidence
  confidence?: number; // Overall confidence in verification

  // Timing
  totalDurationMs: number;
  tierDurations: Record<VerificationTier, number>;
}

/**
 * Source applicability result
 */
export interface ApplicableSource {
  authority: AuthorityCode;
  tier: VerificationTier;
  rationale: string; // Why this source applies (e.g., "engineering colleges verified by AICTE")
}
