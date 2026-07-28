/**
 * Evidence collector
 *
 * Per-run accumulator with typed add* methods
 * Collects evidence as it's generated and prepares for storage/LLM projection
 */

import type { EvidenceItem } from "../verification/types";
import type { CollectorItem } from "./types";
import { calculateQualityWithConfidence } from "./quality";

/**
 * Evidence collector for a single verification run
 */
export class EvidenceCollector {
  private run_id: string;
  private institution_name: string;
  private items: CollectorItem[] = [];
  private created_at: number = Date.now();

  constructor(run_id: string, institution_name: string) {
    this.run_id = run_id;
    this.institution_name = institution_name;
  }

  /**
   * Add evidence item
   */
  add(evidence: EvidenceItem, recency_days?: number): void {
    // Calculate quality
    const quality_score = calculateQualityWithConfidence({
      evidence,
      recency_days,
      domain: new URL(evidence.url || "").hostname || undefined,
    });

    this.items.push({
      ...evidence,
      run_id: this.run_id,
      quality_score,
    });
  }

  /**
   * Add mirror tier evidence (registry lookup)
   */
  addMirror(
    source: string,
    text: string,
    url?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.add({
      source: source as any,
      tier: "mirror",
      timestamp: Date.now(),
      url,
      category: "legitimacy",
      quality_score: 1.0, // Will be recalculated
      matched_text: text,
      metadata,
    });
  }

  /**
   * Add API tier evidence (web APIs, public data)
   */
  addAPI(
    source: string,
    category: "identity" | "legitimacy" | "contact" | "affiliation" | "approval" | "unavailable",
    text: string,
    url?: string,
    confidence?: number,
    metadata?: Record<string, unknown>
  ): void {
    this.add({
      source: source as any,
      tier: "api",
      timestamp: Date.now(),
      url,
      category,
      quality_score: 0.6, // Will be recalculated
      confidence,
      matched_text: text,
      metadata,
    });
  }

  /**
   * Add live tier evidence (direct authority check)
   */
  addLive(
    source: string,
    text: string,
    url?: string,
    confidence?: number,
    metadata?: Record<string, unknown>
  ): void {
    this.add({
      source: source as any,
      tier: "live",
      timestamp: Date.now(),
      url,
      category: "legitimacy",
      quality_score: 0.9, // Will be recalculated
      confidence,
      matched_text: text,
      metadata,
    });
  }

  /**
   * Add contact information
   */
  addContact(
    source: string,
    contact_text: string,
    contact_type: "email" | "phone" | "address",
    url?: string
  ): void {
    this.add({
      source: source as any,
      tier: "api",
      timestamp: Date.now(),
      url,
      category: "contact",
      quality_score: 0.8, // Will be recalculated
      matched_text: contact_text,
      metadata: { contact_type },
    });
  }

  /**
   * Add affiliation claim
   */
  addAffiliation(
    source: string,
    claim: string,
    snippet: string,
    url?: string,
    confidence?: number
  ): void {
    this.add({
      source: source as any,
      tier: "api",
      timestamp: Date.now(),
      url,
      category: "affiliation",
      quality_score: 0.6, // Will be recalculated
      confidence,
      matched_text: snippet,
      claim_type: "affiliated",
      metadata: { claim },
    });
  }

  /**
   * Add approval claim
   */
  addApproval(
    source: string,
    claim: string,
    snippet: string,
    url?: string,
    confidence?: number
  ): void {
    this.add({
      source: source as any,
      tier: "api",
      timestamp: Date.now(),
      url,
      category: "approval",
      quality_score: 0.7, // Will be recalculated
      confidence,
      matched_text: snippet,
      claim_type: "approved",
      metadata: { claim },
    });
  }

  /**
   * Add unavailable source (failed check)
   */
  addUnavailable(source: string, error: string, url?: string): void {
    this.add({
      source: source as any,
      tier: "api",
      timestamp: Date.now(),
      url,
      category: "unavailable",
      quality_score: 0, // No quality for unavailable
      error,
    });
  }

  /**
   * Get all collected items
   */
  getItems(): CollectorItem[] {
    return [...this.items];
  }

  /**
   * Get items by tier
   */
  getByTier(tier: "mirror" | "api" | "live"): CollectorItem[] {
    return this.items.filter((item) => item.tier === tier);
  }

  /**
   * Get items by category
   */
  getByCategory(
    category: "identity" | "legitimacy" | "contact" | "affiliation" | "approval" | "unavailable"
  ): CollectorItem[] {
    return this.items.filter((item) => item.category === category);
  }

  /**
   * Get items sorted by quality (descending)
   */
  getByQuality(): CollectorItem[] {
    return [...this.items].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    by_tier: Record<string, number>;
    by_category: Record<string, number>;
    avg_quality: number;
  } {
    const by_tier: Record<string, number> = { mirror: 0, api: 0, live: 0 };
    const by_category: Record<string, number> = {
      identity: 0,
      legitimacy: 0,
      contact: 0,
      affiliation: 0,
      approval: 0,
      unavailable: 0,
    };

    let totalQuality = 0;

    for (const item of this.items) {
      const tierKey = item.tier as string;
      const categoryKey = item.category as string;
      if (tierKey in by_tier) {
        (by_tier as any)[tierKey]++;
      }
      if (categoryKey in by_category) {
        (by_category as any)[categoryKey]++;
      }
      totalQuality += item.quality_score || 0;
    }

    return {
      total: this.items.length,
      by_tier,
      by_category,
      avg_quality: this.items.length > 0 ? totalQuality / this.items.length : 0,
    };
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Get run ID
   */
  getRunId(): string {
    return this.run_id;
  }

  /**
   * Get institution name
   */
  getInstitutionName(): string {
    return this.institution_name;
  }

  /**
   * Get creation timestamp
   */
  getCreatedAt(): number {
    return this.created_at;
  }
}

/**
 * Factory function
 */
export function createCollector(
  run_id: string,
  institution_name: string
): EvidenceCollector {
  return new EvidenceCollector(run_id, institution_name);
}
