/**
 * Validation orchestrator service
 *
 * Pure async functions with injected dependencies. No Inngest, no Next.js imports.
 *
 * 7 stages, each independently callable and returningResult<T>:
 * 1. resolveFastPath — L0/L1 cache + Redis lookup, <120ms
 * 2. resolveFromMirror — L2 registry lookup + scoring, <600ms, NO web/LLM
 * 3. discover — delegates to discovery/service
 * 4. verify — delegates to verification/service
 * 5. extractFacts & judgeEvidence — LLM stages
 * 6. finalize — persistence layer, idempotent by (name, runId)
 * 7. validate — orchestrates the ladder with short-circuiting
 *
 * Every stage appends run_steps with duration, cache_hit, provider.
 * State transitions follow §12 rules; illegal transitions throw.
 */

// Normalizable is just a string type for institution names
import { createHash } from "crypto";
import type { ResolvedIdentity } from "../discovery/types";
import type { VerificationResult } from "../verification/types";
import type { EvidenceCollector } from "../evidence/collector";
import type { ScoringPolicy, ScoringDecision } from "../scoring/types";
import { CacheKeys, CacheTTL } from "@/server/cache/keys";

// Placeholder types for LLM processing
export interface ExtractedFacts {
  [key: string]: any;
}

export interface ValidationJudgment {
  [key: string]: any;
}

/**
 * Result type for all validation stages
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Authority match data
 */
export interface AuthorityMatch {
  name: string;
  code?: string;
  found: boolean;
  snapshotDate: string;
  rowCount: number;
}

/**
 * Fast path result (L0/L1)
 */
export interface FastPathResult {
  hit: boolean; // true if verdict from cache/Redis
  verdict?: string; // "genuine", "likely_genuine", "likely_fake", "fake"
  source?: string; // "redis", "institutions_db", null
  stale: boolean; // true if >freshness_days old
  cachedAt?: Date;
  authorities?: AuthorityMatch[]; // Authorities where this institution was found
}

/**
 * Mirror path result (L2)
 */
export interface MirrorPathResult {
  resolved: boolean; // true if score reached threshold or terminal rule
  decision?: ScoringDecision;
  verdict?: string;
  evidence?: EvidenceCollector;
  terminalRule?: string; // "UGC_FAKE", "WITHDRAWN", etc.
}

/**
 * Validation progress callback
 */
export type OnProgress = (step: string, status: "start" | "complete" | "error", meta?: Record<string, unknown>) => void;

/**
 * Validation options
 */
export interface ValidationOptions {
  runId: string;
  maxTier?: "fast" | "mirror" | "discovery" | "verify" | "extract" | "judge" | "finalize"; // Default: "finalize"
  onProgress?: OnProgress;
  cache?: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, ttlSec: number) => Promise<void> };
  redis?: { get: (key: string) => Promise<string | null>; setex: (key: string, ttlSec: number, value: string) => Promise<void> };
  db?: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> };
  policy?: ScoringPolicy;
}

/**
 * Helper: Hash institution name for cache keys
 */
function hashInstitutionName(name: string): string {
  return createHash("sha256").update(name.toLowerCase().trim()).digest("hex").substring(0, 8);
}

/**
 * Helper: Cache verdict in Redis after validation completes
 */
async function cacheVerdict(
  normalizedName: string,
  verdict: string,
  opts: ValidationOptions
): Promise<void> {
  if (!opts.redis) return;

  try {
    const nameHash = hashInstitutionName(normalizedName);
    const cacheKey = CacheKeys.verdict(nameHash);
    const cacheData = JSON.stringify({
      verdict,
      cachedAt: new Date().toISOString(),
    });

    await opts.redis.setex(cacheKey, CacheTTL.VERDICT, cacheData);
  } catch (error) {
    // Cache failure is non-fatal
    console.warn("[cacheVerdict] Failed to cache verdict:", error);
  }
}

/**
 * Stage 1: Resolve from cache (L0/L1) — <120ms
 * Checks: Redis verdict → institutions_db → freshness
 */
export async function resolveFastPath(
  input: string,
  opts: ValidationOptions
): Promise<Result<FastPathResult>> {
  const step = "fastPath";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // Normalize input
    const normalized = String(input).toLowerCase().trim();

    // Check Redis (L0)
    if (opts.redis) {
      const nameHash = hashInstitutionName(normalized);
      const redisKey = CacheKeys.verdict(nameHash);
      const cached = await opts.redis.get(redisKey);
      if (cached) {
        const { verdict, cachedAt } = JSON.parse(cached);
        const stale = Date.now() - new Date(cachedAt).getTime() > 7 * 24 * 60 * 60 * 1000; // 7 days
        const duration = Date.now() - start;

        opts.onProgress?.(step, "complete", { duration, cacheHit: true, source: "redis", stale });

        return {
          success: true,
          data: { hit: true, verdict, source: "redis", stale, cachedAt: new Date(cachedAt) },
        };
      }
    }

    // Check institutions_db (L1)
    if (opts.db) {
      const rows = await opts.db.query(
        "SELECT id, verdict, cached_at FROM institutions WHERE normalized_name = ? LIMIT 1",
        [normalized]
      ) as Array<{ id: number; verdict: string; cached_at: Date }>;

      if (rows.length > 0) {
        const { id: institutionId, verdict, cached_at } = rows[0]!;
        const stale = Date.now() - cached_at.getTime() > 7 * 24 * 60 * 60 * 1000;
        const duration = Date.now() - start;

        // Query for authorities linked to this institution
        const authRows = await opts.db.query(
          `SELECT DISTINCT ii.source as code, a.display_name as name, rs.valid_to, rs.row_count
           FROM institution_identities ii
           LEFT JOIN authorities a ON ii.source = a.authority_code
           LEFT JOIN registry_snapshots rs ON rs.code = ii.source
           WHERE ii.institution_id = ?
           ORDER BY ii.created_at DESC`,
          [institutionId]
        ) as Array<{ code: string; name: string; valid_to?: Date; row_count?: number }>;

        const authorities: AuthorityMatch[] = authRows.map(row => ({
          name: (row.name || row.code) as string,
          code: row.code,
          found: true,
          snapshotDate: (row.valid_to ? new Date(row.valid_to).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]) as string,
          rowCount: row.row_count ?? 0,
        }));

        opts.onProgress?.(step, "complete", { duration, cacheHit: true, source: "institutions_db", stale, authoritiesCount: authorities.length });

        return {
          success: true,
          data: { hit: true, verdict, source: "institutions_db", stale, cachedAt: cached_at, authorities },
        };
      }
    }

    // Check registry_entries (fallback L1.5 - raw registry data)
    if (opts.db) {
      const regRows = await opts.db.query(
        `SELECT DISTINCT code FROM registry_entries WHERE LOWER(normalized_name) = ? LIMIT 10`,
        [normalized]
      ) as Array<{ code: string }>;

      if (regRows.length > 0) {
        const duration = Date.now() - start;

        // Map codes to authority data
        const authRows = await opts.db.query(
          `SELECT DISTINCT re.code as code, a.display_name as name, rs.valid_to, rs.row_count
           FROM registry_entries re
           LEFT JOIN authorities a ON re.code = a.authority_code
           LEFT JOIN registry_snapshots rs ON rs.code = re.code
           WHERE LOWER(re.normalized_name) = ?`,
          [normalized]
        ) as Array<{ code: string; name: string; valid_to?: Date; row_count?: number }>;

        const authorities: AuthorityMatch[] = authRows.map(row => ({
          name: (row.name || row.code) as string,
          code: row.code,
          found: true,
          snapshotDate: (row.valid_to ? new Date(row.valid_to).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]) as string,
          rowCount: row.row_count ?? 0,
        }));

        opts.onProgress?.(step, "complete", { duration, cacheHit: true, source: "registry_entries", stale: false, authoritiesCount: authorities.length });

        return {
          success: true,
          data: { hit: false, source: "registry_entries", stale: false, authorities },
        };
      }
    }

    // No hit
    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration, cacheHit: false });

    return {
      success: true,
      data: { hit: false, source: undefined, stale: false, authorities: [] },
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Fast path failed: ${String(error)}`,
      code: "FAST_PATH_ERROR",
    };
  }
}

/**
 * Stage 2: Resolve from mirror (L2) — <600ms
 * NO web access, NO LLM. Only registry lookups + scoring.
 * If score ≥ threshold OR terminal rule fires, return final verdict.
 */
export async function resolveFromMirror(
  input: string,
  opts: ValidationOptions
): Promise<Result<MirrorPathResult>> {
  const step = "mirror";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Implement full mirror resolution
    // 1. Matching/resolver (lookup institutions by name)
    // 2. Registry queries (UGC, AISHE, NAD, etc.)
    // 3. Collector (accumulate evidence)
    // 4. Scoring (apply policy)
    // 5. Terminal rule check
    // 6. Threshold check

    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration, resolved: false });

    return {
      success: true,
      data: { resolved: false },
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Mirror resolution failed: ${String(error)}`,
      code: "MIRROR_ERROR",
    };
  }
}

/**
 * Stage 3: Discover identity
 * Delegates to discovery/service.discover()
 */
export async function discoverIdentity(
  input: string,
  opts: ValidationOptions
): Promise<Result<ResolvedIdentity>> {
  const step = "discover";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Import discovery/service and call discover(input)
    // For now, return placeholder to allow pipeline to proceed
    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration });

    return {
      success: true,
      data: {
        canonicalName: String(input),
        type: "institution",
        confidence: 0,
        needsReview: false,
        needsHumanReview: true,
        resolverChain: [],
        resolvedAt: Date.now(),
        candidates: [],
      },
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Discovery failed: ${String(error)}`,
      code: "DISCOVERY_ERROR",
    };
  }
}

/**
 * Stage 4: Verify identity
 * Delegates to verification/service.verify()
 */
export async function verifyIdentity(
  identity: ResolvedIdentity,
  opts: ValidationOptions
): Promise<Result<VerificationResult>> {
  const step = "verify";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Import verification/service and call verify(identity)
    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration });

    return {
      success: false,
      error: "Verification not yet implemented",
      code: "VERIFY_NOT_IMPL",
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Verification failed: ${String(error)}`,
      code: "VERIFY_ERROR",
    };
  }
}

/**
 * Stage 5a: Extract facts from evidence via LLM
 */
export async function extractFacts(
  collector: EvidenceCollector,
  opts: ValidationOptions
): Promise<Result<ExtractedFacts>> {
  const step = "extract";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Import LLM gateway and call extractFacts(collector)
    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration });

    return {
      success: false,
      error: "Extract facts not yet implemented",
      code: "EXTRACT_NOT_IMPL",
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Extract facts failed: ${String(error)}`,
      code: "EXTRACT_ERROR",
    };
  }
}

/**
 * Stage 5b: Judge evidence via LLM
 */
export async function judgeEvidence(
  facts: ExtractedFacts,
  collector: EvidenceCollector,
  opts: ValidationOptions
): Promise<Result<ValidationJudgment>> {
  const step = "judge";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Import LLM gateway and call judgeEvidence(facts, collector)
    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration });

    return {
      success: false,
      error: "Judge evidence not yet implemented",
      code: "JUDGE_NOT_IMPL",
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Judge evidence failed: ${String(error)}`,
      code: "JUDGE_ERROR",
    };
  }
}

/**
 * Stage 6: Finalize validation
 * Persist everything: institution + identities + contacts + evidence + validation_run + run_steps
 * Idempotent by (normalizedName, runId)
 */
export async function finalizeValidation(
  input: string,
  identity: ResolvedIdentity,
  collector: EvidenceCollector,
  facts: ExtractedFacts,
  judgment: ValidationJudgment,
  decision: ScoringDecision,
  opts: ValidationOptions
): Promise<Result<{ validationRunId: string; institutionId: string }>> {
  const step = "finalize";
  const start = Date.now();

  try {
    opts.onProgress?.(step, "start");

    // TODO: Implement full finalization:
    // 1. scoring → policy → ScoringDecision
    // 2. Upsert institution
    // 3. Upsert identities + contacts
    // 4. Store evidence (recordEvidence)
    // 5. Create validation_run row
    // 6. Create run_steps rows for each stage
    // 7. Set Redis cache
    // 8. Enqueue embedding backfill
    // 9. Pin: policy_id, prompt_version, snapshot_ids, embedding_space, code_version

    const duration = Date.now() - start;
    opts.onProgress?.(step, "complete", { duration });

    return {
      success: false,
      error: "Finalization not yet implemented",
      code: "FINALIZE_NOT_IMPL",
    };
  } catch (error) {
    const duration = Date.now() - start;
    opts.onProgress?.(step, "error", { duration, error: String(error) });
    return {
      success: false,
      error: `Finalization failed: ${String(error)}`,
      code: "FINALIZE_ERROR",
    };
  }
}

/**
 * Stage 7: Main orchestration
 * Walks the ladder, short-circuiting at first confident answer.
 * Respects maxTier and calls onProgress for each step.
 */
export async function validate(
  input: string,
  opts: ValidationOptions
): Promise<Result<{ verdict: string; decision?: ScoringDecision; authorities?: AuthorityMatch[] }>> {
  const { runId, maxTier = "finalize", onProgress } = opts;

  // Check state transitions (§12 rules)
  const validTiers = ["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"];
  if (maxTier && !validTiers.includes(maxTier)) {
    return {
      success: false,
      error: `Invalid maxTier: ${maxTier}`,
      code: "INVALID_TIER",
    };
  }

  try {
    // Normalize input once
    const normalized = String(input).toLowerCase().trim();

    // Stage 1: Fast path (L0/L1)
    const fastRes = await resolveFastPath(input, opts);
    if (!fastRes.success) return fastRes;

    if (fastRes.data.hit) {
      onProgress?.("validate", "complete", { tier: "fast", verdict: fastRes.data.verdict, stale: fastRes.data.stale });
      // Cache hit from L1 (institutions_db) should also be cached in L0 (Redis)
      if (fastRes.data.source === "institutions_db") {
        await cacheVerdict(normalized, fastRes.data.verdict!, opts);
      }
      return {
        success: true,
        data: { verdict: fastRes.data.verdict!, authorities: fastRes.data.authorities },
      };
    }

    if (maxTier === "fast") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 2: Mirror path (L2)
    const mirrorRes = await resolveFromMirror(input, opts);
    if (!mirrorRes.success) return mirrorRes;

    if (mirrorRes.data.resolved) {
      onProgress?.("validate", "complete", { tier: "mirror", verdict: mirrorRes.data.verdict });
      // Cache verdict from mirror path in Redis
      await cacheVerdict(normalized, mirrorRes.data.verdict!, opts);
      return {
        success: true,
        data: { verdict: mirrorRes.data.verdict!, decision: mirrorRes.data.decision },
      };
    }

    if (maxTier === "mirror") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 3: Discover
    const discoverRes = await discoverIdentity(input, opts);
    if (!discoverRes.success) return discoverRes;

    if (maxTier === "discovery") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 4: Verify
    const verifyRes = await verifyIdentity(discoverRes.data, opts);
    if (!verifyRes.success) return verifyRes;

    if (maxTier === "verify") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 5a: Extract facts
    // TODO: Create collector from verification result
    const extractRes = await extractFacts({} as EvidenceCollector, opts);
    if (!extractRes.success) return extractRes;

    if (maxTier === "extract") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 5b: Judge evidence
    const judgeRes = await judgeEvidence(extractRes.data, {} as EvidenceCollector, opts);
    if (!judgeRes.success) return judgeRes;

    if (maxTier === "judge") {
      return { success: true, data: { verdict: "NEEDS_REVIEW" } };
    }

    // Stage 6: Finalize
    // TODO: Get scoring result and run finalize
    const finalizeRes = await finalizeValidation(
      input,
      discoverRes.data,
      {} as EvidenceCollector,
      extractRes.data,
      judgeRes.data,
      {} as ScoringDecision,
      opts
    );
    if (!finalizeRes.success) return finalizeRes;

    onProgress?.("validate", "complete", { tier: "finalize", validationRunId: finalizeRes.data.validationRunId });

    // Cache finalized verdict in Redis
    await cacheVerdict(normalized, "FINALIZED", opts);

    return {
      success: true,
      data: { verdict: "FINALIZED" },
    };
  } catch (error) {
    return {
      success: false,
      error: `Validation orchestration failed: ${String(error)}`,
      code: "ORCHESTRATION_ERROR",
    };
  }
}
