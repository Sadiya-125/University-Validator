/**
 * Evidence store types
 *
 * Handles persistence, quality assessment, and LLM projection of verification evidence.
 */

import type { EvidenceItem } from "../verification/types";

/**
 * Stored evidence record (database row)
 */
export interface StoredEvidence {
  id: string;
  run_id: string;

  // Evidence classification
  kind: "identity" | "legitimacy" | "contact" | "affiliation" | "approval" | "unavailable";
  source: string; // AuthorityCode
  tier: "mirror" | "api" | "live";

  // Content references
  url?: string;
  matched_text?: string;
  blob_key?: string; // For large payloads (HTML, screenshots)
  content_hash: string; // SHA-256

  // Quality and assessment
  quality_score: number; // 0.0-1.0 (from quality.ts)
  confidence?: number;

  // Metadata
  observed_at: number; // timestamp
  snapshot_date?: number; // For mirror tier

  // Context
  claim_type?: "affiliated" | "approved" | "fake";
  metadata?: Record<string, unknown>;

  // Indexing
  created_at: Date;
  updated_at: Date;
}

/**
 * Evidence collector item (before storage)
 */
export interface CollectorItem extends EvidenceItem {
  run_id: string;
}

/**
 * LLM payload evidence (compact, stripped HTML)
 */
export interface LLMPayloadEvidence {
  ref: string; // e.g., "e1", "e2" (stable short reference)
  kind: string;
  source: string;
  tier: string;
  quality: number; // 0.0-1.0
  text?: string; // matched_text or summary
  url?: string;
  claim?: string; // For affiliation/approval claims
}

/**
 * LLM payload
 */
export interface LLMPayload {
  run_id: string;
  institution_name: string;
  evidence: LLMPayloadEvidence[];
  sources_summary: {
    total: number;
    by_tier: Record<string, number>;
    by_kind: Record<string, number>;
  };
  generated_at: number;
}

/**
 * Grouped evidence for UI
 */
export interface GroupedEvidence {
  by_kind: Record<string, StoredEvidence[]>;
  by_source: Record<string, StoredEvidence[]>;
  by_tier: Record<string, StoredEvidence[]>;
  summary: {
    total: number;
    unavailable: number;
    quality_distribution: {
      high: number; // >= 0.8
      medium: number; // 0.5-0.8
      low: number; // < 0.5
    };
  };
}

/**
 * Quality input (evidence + context)
 */
export interface QualityInput {
  evidence: EvidenceItem;
  recency_days?: number; // Age of snapshot/observation
  domain?: string; // For domain authority calculation
}
