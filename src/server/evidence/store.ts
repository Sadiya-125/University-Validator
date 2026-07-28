/**
 * Evidence store
 *
 * Handles persistence of verification evidence:
 * - Normalizes evidence items
 * - Computes SHA-256 content_hash
 * - Dedupes within a run by (kind, url, hash)
 * - Uploads large payloads to Blob storage
 * - Stores only blob_key in Postgres (NEVER raw HTML)
 */

import { createHash } from "crypto";
import type { EvidenceItem } from "../verification/types";
import type { StoredEvidence, GroupedEvidence } from "./types";
import { calculateQualityWithConfidence } from "./quality";

const BLOB_SIZE_THRESHOLD = 100 * 1024; // 100KB threshold for blob offload
const BLOB_STORAGE_PREFIX = "evidence";

/**
 * Compute SHA-256 content hash
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Format blob key: evidence/{yyyy}/{mm}/{hash}
 */
function formatBlobKey(hash: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  return `${BLOB_STORAGE_PREFIX}/${yyyy}/${mm}/${hash}`;
}

/**
 * Normalize evidence item for storage
 */
function normalizeEvidence(
  item: EvidenceItem,
  runId: string,
  index: number
): StoredEvidence {
  // Compute content hash
  const hashContent = item.matched_text || item.content || "";
  const content_hash = computeHash(hashContent);

  // Determine if we need to offload to blob storage
  let blob_key: string | undefined;
  let matched_text = item.matched_text;

  if (item.content && item.content.length > BLOB_SIZE_THRESHOLD) {
    // Content is large, offload to blob storage
    blob_key = formatBlobKey(computeHash(item.content));
    // Don't store raw content in DB
    matched_text = undefined;
  }

  return {
    id: `${runId}-${index}`,
    run_id: runId,
    kind: item.category,
    source: String(item.source),
    tier: item.tier,
    url: item.url,
    matched_text,
    blob_key,
    content_hash,
    quality_score: item.quality_score || 0,
    confidence: item.confidence,
    observed_at: item.timestamp,
    snapshot_date: item.snapshot_date,
    claim_type: item.claim_type,
    metadata: item.metadata,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Dedup evidence within a run by (kind, url, hash)
 */
function dedupEvidence(evidence: StoredEvidence[]): StoredEvidence[] {
  const seen = new Set<string>();
  const deduped: StoredEvidence[] = [];

  for (const item of evidence) {
    // Create dedup key
    const key = `${item.kind}|${item.url || ""}|${item.content_hash}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

/**
 * Record evidence to database
 *
 * In production, this would:
 * 1. Upload large payloads (HTML, screenshots) to blob storage
 * 2. Store evidence rows in database with only blob_key references
 * 3. Return stored evidence IDs
 *
 * For now, simulates the flow with in-memory storage
 */
export async function recordEvidence(
  runId: string,
  items: EvidenceItem[]
): Promise<StoredEvidence[]> {
  // Normalize
  const normalized = items.map((item, index) =>
    normalizeEvidence(item, runId, index)
  );

  // Dedup by (kind, url, hash)
  const deduped = dedupEvidence(normalized);

  // In production:
  // 1. For items with blob_key, upload to blob storage
  // 2. Store evidence rows in database
  // 3. Return stored rows

  // Simulate blob uploads (in production, use actual storage service)
  for (const item of deduped) {
    if (item.blob_key && item.matched_text) {
      // In production: await blobStorage.upload(item.blob_key, item.matched_text)
      // For now, just log that it would be uploaded
    }
  }

  // Simulate database storage (in production, use actual database)
  // In production:
  // await db.insert(evidence).values(deduped)

  return deduped;
}

/**
 * Get evidence for a run, grouped by kind
 */
export async function getRunEvidence(runId: string): Promise<GroupedEvidence> {
  // In production: fetch from database
  // const items = await db.select().from(evidence).where(eq(evidence.run_id, runId))

  // For now, return empty result (simulated)
  const items: StoredEvidence[] = [];

  // Group by kind
  const by_kind: Record<string, StoredEvidence[]> = {};
  const by_source: Record<string, StoredEvidence[]> = {};
  const by_tier: Record<string, StoredEvidence[]> = {};

  for (const item of items) {
    if (!by_kind[item.kind]) by_kind[item.kind] = [];
    by_kind[item.kind]!.push(item);

    if (!by_source[item.source]) by_source[item.source] = [];
    by_source[item.source]!.push(item);

    if (!by_tier[item.tier]) by_tier[item.tier] = [];
    by_tier[item.tier]!.push(item);
  }

  // Calculate summary statistics
  const quality_counts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  let unavailable = 0;

  for (const item of items) {
    if (item.kind === "unavailable") {
      unavailable++;
    } else {
      const score = item.quality_score || 0;
      if (score >= 0.8) quality_counts.high++;
      else if (score >= 0.5) quality_counts.medium++;
      else quality_counts.low++;
    }
  }

  return {
    by_kind,
    by_source,
    by_tier,
    summary: {
      total: items.length,
      unavailable,
      quality_distribution: {
        high: quality_counts.high,
        medium: quality_counts.medium,
        low: quality_counts.low,
      },
    },
  };
}

/**
 * Get signed blob URL for blob_key (for UI download)
 *
 * In production: generate signed URL from blob storage service
 */
export async function getSignedBlobUrl(blobKey: string): Promise<string> {
  // In production: generate signed URL with expiration
  // const signedUrl = await blobStorage.getSignedUrl(blobKey, expiresIn: 3600)
  // return signedUrl

  // For now, return mock URL
  return `https://blob-storage.example.com/${blobKey}?signed=true`;
}

/**
 * Cleanup old evidence (>90 days)
 */
export async function cleanupOldEvidence(maxAgeDays: number = 90): Promise<number> {
  // In production:
  // const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
  // const result = await db.delete(evidence).where(lt(evidence.created_at, new Date(cutoff)))
  // return result.affectedRows

  return 0; // Simulated
}

/**
 * Evidence statistics across all runs
 */
export async function getEvidenceStats(): Promise<{
  total_runs: number;
  total_evidence: number;
  avg_quality: number;
  blob_storage_usage: number;
}> {
  // In production: query database for statistics
  return {
    total_runs: 0,
    total_evidence: 0,
    avg_quality: 0,
    blob_storage_usage: 0,
  };
}

/**
 * In-memory evidence store for testing/demo
 */
export class InMemoryEvidenceStore {
  private store: Map<string, StoredEvidence[]> = new Map();

  async record(runId: string, items: EvidenceItem[]): Promise<StoredEvidence[]> {
    const stored = await recordEvidence(runId, items);
    this.store.set(runId, stored);
    return stored;
  }

  async getRunEvidence(runId: string): Promise<GroupedEvidence> {
    const items = this.store.get(runId) || [];

    // Group
    const by_kind: Record<string, StoredEvidence[]> = {};
    const by_source: Record<string, StoredEvidence[]> = {};
    const by_tier: Record<string, StoredEvidence[]> = {};

    for (const item of items) {
      if (!by_kind[item.kind]) by_kind[item.kind] = [];
      by_kind[item.kind]!.push(item);

      if (!by_source[item.source]) by_source[item.source] = [];
      by_source[item.source]!.push(item);

      if (!by_tier[item.tier]) by_tier[item.tier] = [];
      by_tier[item.tier]!.push(item);
    }

    // Stats
    const quality_counts = { high: 0, medium: 0, low: 0 };
    let unavailable = 0;

    for (const item of items) {
      if (item.kind === "unavailable") {
        unavailable++;
      } else {
        const score = item.quality_score || 0;
        if (score >= 0.8) quality_counts.high++;
        else if (score >= 0.5) quality_counts.medium++;
        else quality_counts.low++;
      }
    }

    return {
      by_kind,
      by_source,
      by_tier,
      summary: {
        total: items.length,
        unavailable,
        quality_distribution: quality_counts,
      },
    };
  }

  async clear(runId: string): Promise<void> {
    this.store.delete(runId);
  }

  async clearAll(): Promise<void> {
    this.store.clear();
  }
}
