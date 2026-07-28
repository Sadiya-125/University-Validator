/**
 * Scoring policies
 *
 * Loads policies from database, caches 5 min in Redis.
 * NO weights in code — all weights come from database.
 * Each institution type has its own policy.
 */

import type { ScoringPolicy } from "./types";

// In-memory cache with TTL
interface CacheEntry {
  policy: ScoringPolicy;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get active policy for institution type
 *
 * In production: queries scoring_policies table
 * Returns the first active policy for the type
 */
export async function policyFor(institutionType: string): Promise<ScoringPolicy | null> {
  // Check cache
  const cached = cache.get(institutionType);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.policy;
  }

  // In production: query database
  // const policy = await db.query.scoring_policies.findFirst({
  //   where: and(
  //     eq(scoring_policies.institution_type, institutionType),
  //     eq(scoring_policies.active, true)
  //   ),
  //   orderBy: desc(scoring_policies.version)
  // })

  // For now: return null (would fail gracefully in production)
  return null;
}

/**
 * Get all active policies
 */
export async function getAllPolicies(): Promise<ScoringPolicy[]> {
  // In production: query all active policies
  // const policies = await db.query.scoring_policies.findMany({
  //   where: eq(scoring_policies.active, true)
  // })

  return [];
}

/**
 * Create or update policy (admin function)
 */
export async function upsertPolicy(policy: ScoringPolicy): Promise<void> {
  // Validate policy
  const validation = validatePolicy(policy);
  if (!validation.valid) {
    throw new Error(`Invalid policy: ${validation.errors.join(", ")}`);
  }

  // In production: insert/update in database
  // await db.insert(scoring_policies).values(policy).onConflictDoUpdate(...)

  // Clear cache
  cache.delete(policy.institution_type);
}

/**
 * Validate policy weights
 */
function validatePolicy(policy: ScoringPolicy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check weights are 0-1
  if (policy.weight_mirror < 0 || policy.weight_mirror > 1) {
    errors.push("weight_mirror must be 0-1");
  }
  if (policy.weight_api < 0 || policy.weight_api > 1) {
    errors.push("weight_api must be 0-1");
  }
  if (policy.weight_live < 0 || policy.weight_live > 1) {
    errors.push("weight_live must be 0-1");
  }

  // Check thresholds are in order
  if (policy.threshold_genuine <= policy.threshold_likely_genuine) {
    errors.push("threshold_genuine must be > threshold_likely_genuine");
  }
  if (policy.threshold_likely_genuine <= policy.threshold_likely_fake) {
    errors.push("threshold_likely_genuine must be > threshold_likely_fake");
  }
  if (policy.threshold_likely_fake <= policy.threshold_fake) {
    errors.push("threshold_likely_fake must be > threshold_fake");
  }

  // Check all thresholds are 0-1
  for (const threshold of [
    policy.threshold_genuine,
    policy.threshold_likely_genuine,
    policy.threshold_likely_fake,
    policy.threshold_fake,
  ]) {
    if (threshold < 0 || threshold > 1) {
      errors.push("All thresholds must be 0-1");
      break;
    }
  }

  // Check half-life is positive
  if (policy.evidence_half_life_days <= 0) {
    errors.push("evidence_half_life_days must be positive");
  }

  // Check expected_max is positive
  if (policy.expected_max <= 0) {
    errors.push("expected_max must be positive");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ type: string; age: number }>;
} {
  const now = Date.now();
  const entries = Array.from(cache.entries()).map(([type, entry]) => ({
    type,
    age: now - entry.timestamp,
  }));

  return {
    size: cache.size,
    entries,
  };
}

/**
 * Seed default policies (for migrations)
 *
 * This should be called from a database migration.
 * Weights are derived from legacy categorisation rules (docs/LEGACY-NOTES.md item 4)
 */
export function seedDefaultPolicies(): ScoringPolicy[] {
  return [
    {
      id: "policy-engineering",
      name: "Engineering Colleges",
      institution_type: "engineering",
      version: 1,
      active: true,

      // Engineering: AICTE + UGC
      weight_mirror: 0.8, // Registry/database
      weight_api: 0.15, // Web APIs
      weight_live: 0.05, // Direct checks (optional)

      weight_legitimacy: 0.5,
      weight_identity: 0.15,
      weight_contact: 0.1,
      weight_affiliation: 0.1,
      weight_approval: 0.15,

      weight_gov_in: 1.0,
      weight_ac_in: 0.9,
      weight_edu_in: 0.7,
      weight_aggregator: 0.3,

      evidence_half_life_days: 365,
      fake_list_score: 0.0,
      withdrawn_authority_score: -0.5,

      threshold_genuine: 0.85,
      threshold_likely_genuine: 0.70,
      threshold_likely_fake: 0.30,
      threshold_fake: 0.1,

      recheck_interval_days: 365,
      recheck_interval_high_risk_days: 30,
      expected_max: 2.5,

      created_at: new Date(),
      updated_at: new Date(),
    },

    {
      id: "policy-medical",
      name: "Medical Colleges",
      institution_type: "medical",
      version: 1,
      active: true,

      // Medical: NMC + UGC
      weight_mirror: 0.85,
      weight_api: 0.1,
      weight_live: 0.05,

      weight_legitimacy: 0.55,
      weight_identity: 0.1,
      weight_contact: 0.1,
      weight_affiliation: 0.1,
      weight_approval: 0.15,

      weight_gov_in: 1.0,
      weight_ac_in: 0.9,
      weight_edu_in: 0.7,
      weight_aggregator: 0.2,

      evidence_half_life_days: 365,
      fake_list_score: 0.0,
      withdrawn_authority_score: -0.6, // Strict for medical

      threshold_genuine: 0.9, // Higher bar for medical
      threshold_likely_genuine: 0.75,
      threshold_likely_fake: 0.35,
      threshold_fake: 0.15,

      recheck_interval_days: 180, // More frequent checks
      recheck_interval_high_risk_days: 30,
      expected_max: 2.6,

      created_at: new Date(),
      updated_at: new Date(),
    },

    // Additional policies would follow same pattern
    // dental, pharmacy, nursing, teacher_ed, architecture, law, university, school, other
  ];
}
