/**
 * Evidence quality assessment
 *
 * Computes 0-1 quality score from:
 * - Tier (mirror 1.0, api 0.4-0.75, live 0.9)
 * - Domain authority (gov.in > ac.in > edu.in > news > aggregator)
 * - Directness (registry entry > page mentioning it)
 * - Recency (fresher = better)
 *
 * SEPARATE from scoring weight:
 * - quality: how good this observation is
 * - weight: how much this source type counts in final score
 */

import type { EvidenceItem } from "../verification/types";
import type { QualityInput } from "./types";

/**
 * Tier quality baseline (before domain/directness adjustments)
 */
const TIER_QUALITY: Record<string, number> = {
  mirror: 1.0, // Authoritative registry snapshot
  api: 0.6, // Public API (middle ground)
  live: 0.9, // Direct authority query (high confidence)
};

/**
 * Domain authority scores
 */
const DOMAIN_AUTHORITY: Record<string, number> = {
  ".gov.in": 1.0, // Government authority
  ".nic.in": 0.95, // National Informatics Centre
  ".ac.in": 0.9, // Academic (college/university)
  ".edu.in": 0.85, // Educational institution
  ".edu": 0.8, // International educational
  // News and aggregators
  ".news": 0.3,
  "wikipedia": 0.4, // Knowledge base (not primary source)
  "wikidata": 0.35,
  "medium.com": 0.2,
  "reddit.com": 0.15,
  // Default
  "default": 0.5, // Unknown domain
};

/**
 * Directness multiplier (how direct is the evidence)
 */
const DIRECTNESS_MULTIPLIER: Record<string, number> = {
  "registry": 1.0, // Direct registry entry (highest directness)
  "official_site": 0.95, // From official website
  "authority_api": 0.9, // From authority's public API
  "public_api": 0.75, // From public third-party API
  "search_result": 0.6, // From search result about institution
  "mention": 0.4, // Mentioned in unrelated content
  "aggregator": 0.3, // From aggregator/index
};

/**
 * Recency adjustment (age in days)
 */
function recencyMultiplier(ageDays: number): number {
  if (ageDays === 0) return 1.0; // Fresh
  if (ageDays <= 7) return 0.95;
  if (ageDays <= 30) return 0.90;
  if (ageDays <= 90) return 0.85;
  if (ageDays <= 365) return 0.75;
  return 0.5; // Very old data (>1 year)
}

/**
 * Calculate domain authority score
 */
function getDomainAuthority(url?: string): number {
  if (!url) return DOMAIN_AUTHORITY["default"] || 0.5;

  const lowerUrl = url.toLowerCase();

  // Check for exact matches
  for (const [domain, score] of Object.entries(DOMAIN_AUTHORITY)) {
    if (domain === "default") continue;
    if (lowerUrl.includes(domain)) return score;
  }

  // Check TLD
  if (lowerUrl.endsWith(".gov") || lowerUrl.endsWith(".gov.in")) return 1.0;
  if (lowerUrl.includes(".edu")) return 0.85;
  if (lowerUrl.includes(".ac.in")) return 0.9;

  return DOMAIN_AUTHORITY["default"] || 0.5;
}

/**
 * Calculate directness based on evidence characteristics
 */
function getDirectness(evidence: EvidenceItem): number {
  switch (evidence.source) {
    // Mirror tier = registry evidence (most direct)
    case "UGC_FAKE":
    case "AISHE":
    case "NAD":
    case "CBSE":
    case "CISCE":
    case "NIOS":
      return DIRECTNESS_MULTIPLIER["registry"] ?? 1.0;

    // API tier - depends on source
    case "WEBSITE":
      // Website evidence from official URL = high directness
      if (evidence.category === "contact" || evidence.category === "approval") {
        return DIRECTNESS_MULTIPLIER["official_site"] ?? 0.95;
      }
      return DIRECTNESS_MULTIPLIER["public_api"] ?? 0.75;

    case "WIKIDATA":
      // Wikidata is identity-corroborating, not legitimacy-proving
      if (evidence.category === "identity") {
        return DIRECTNESS_MULTIPLIER["mention"] ?? 0.4;
      }
      return DIRECTNESS_MULTIPLIER["aggregator"] ?? 0.3;

    // Live tier = direct authority
    case "UGC":
    case "AICTE":
    case "NMC":
    case "INC":
    case "PCI":
    case "NCTE":
    case "COA":
    case "BCI":
      return DIRECTNESS_MULTIPLIER["authority_api"] ?? 0.9;

    default:
      return DIRECTNESS_MULTIPLIER["public_api"] ?? 0.75;
  }
}

/**
 * Calculate evidence quality score (0.0-1.0)
 */
export function calculateQuality(input: QualityInput): number {
  const { evidence, recency_days = 0, domain } = input;

  // Base tier quality
  const tierQuality = TIER_QUALITY[evidence.tier] ?? TIER_QUALITY["api"] ?? 0.6;

  // Domain authority adjustment
  const domainScore = getDomainAuthority(evidence.url || domain);

  // Directness adjustment
  const directness = getDirectness(evidence);

  // Recency adjustment
  const recency = recencyMultiplier(recency_days);

  // Combine: weighted average
  // Tier is most important (40%), then directness (30%), domain (20%), recency (10%)
  const quality =
    tierQuality * 0.4 +
    directness * 0.3 +
    domainScore * 0.2 +
    recency * 0.1;

  // Clamp to 0-1
  return Math.min(1, Math.max(0, quality));
}

/**
 * Calculate quality with stored evidence-level confidence
 */
export function calculateQualityWithConfidence(input: QualityInput): number {
  const baseQuality = calculateQuality(input);

  // Incorporate evidence's own confidence
  const confidence = input.evidence.confidence || 0.5;

  // Blend: base quality 70%, confidence 30%
  return baseQuality * 0.7 + confidence * 0.3;
}

/**
 * Categorize quality level
 */
export function qualityLevel(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

/**
 * Quality rationale (for debugging/UI)
 */
export function qualityRationale(input: QualityInput): string {
  const { evidence, recency_days = 0 } = input;

  const tierQuality = TIER_QUALITY[evidence.tier] ?? TIER_QUALITY["api"] ?? 0.6;
  const domainScore = getDomainAuthority(evidence.url);
  const directness = getDirectness(evidence);
  const recency = recencyMultiplier(recency_days);

  const parts = [
    `Tier (${evidence.tier}): ${(tierQuality * 100).toFixed(0)}%`,
    `Domain: ${(domainScore * 100).toFixed(0)}%`,
    `Directness: ${(directness * 100).toFixed(0)}%`,
    `Recency: ${(recency * 100).toFixed(0)}%`,
  ];

  return parts.join(" | ");
}
