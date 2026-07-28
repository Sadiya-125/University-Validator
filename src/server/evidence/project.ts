/**
 * Evidence projection for LLM consumption
 *
 * Converts collector to compact, normalized JSON:
 * - Strips HTML entirely
 * - Caps at 24k characters
 * - Prioritizes by quality when truncating
 * - Assigns stable short refs (e1, e2, ...)
 * - Runtime guard: throws if payload contains "<html" or "<!DOCTYPE"
 */

import type { EvidenceCollector } from "./collector";
import type { CollectorItem, LLMPayload, LLMPayloadEvidence } from "./types";

const LLM_PAYLOAD_LIMIT = 24 * 1024; // 24k characters
const HTML_DETECTOR_PATTERNS = [/<html/i, /<!DOCTYPE/i];

/**
 * Strip HTML tags from text
 */
function stripHTML(text: string): string {
  if (!text) return text;

  // Remove common HTML tags
  let stripped = text
    .replace(/<[^>]+>/g, "") // Remove all tags
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Clean up whitespace
  stripped = stripped.replace(/\s+/g, " ").trim();

  return stripped;
}

/**
 * Truncate text to character limit
 */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;

  // Try to truncate at a word boundary
  let truncated = text.substring(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > limit * 0.8) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + "…";
}

/**
 * Convert evidence to LLM payload evidence
 */
function toPayloadEvidence(
  item: CollectorItem,
  ref: string
): LLMPayloadEvidence {
  // Strip HTML from matched_text if present
  const text = item.matched_text
    ? stripHTML(item.matched_text)
    : undefined;

  const payload: LLMPayloadEvidence = {
    ref,
    kind: item.category,
    source: String(item.source),
    tier: item.tier,
    quality: item.quality_score || 0,
    ...(text && { text }),
    ...(item.url && { url: item.url }),
  };

  // Add claim for affiliation/approval
  if (item.claim_type && item.metadata?.claim) {
    payload.claim = String(item.metadata.claim);
  }

  return payload;
}

/**
 * Project collector to LLM payload
 */
export function toLLMPayload(collector: EvidenceCollector): LLMPayload {
  const items = collector.getItems();

  // Sort by quality (descending) to prioritize high-quality evidence
  const sorted = items.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

  const evidence: LLMPayloadEvidence[] = [];
  let currentSize = 0;

  // Calculate base payload size (metadata)
  const basePayload: Partial<LLMPayload> = {
    run_id: collector.getRunId(),
    institution_name: collector.getInstitutionName(),
    evidence: [],
    sources_summary: {
      total: 0,
      by_tier: {},
      by_kind: {},
    },
    generated_at: Date.now(),
  };

  const baseSize = JSON.stringify(basePayload).length;
  currentSize = baseSize;

  // Add evidence items, respecting size limit
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (!item) continue;
    const ref = `e${i + 1}`;

    const payloadItem = toPayloadEvidence(item, ref);
    const itemSize = JSON.stringify(payloadItem).length + 2; // +2 for comma/bracket

    if (currentSize + itemSize > LLM_PAYLOAD_LIMIT && evidence.length > 0) {
      // Size limit reached, stop adding
      break;
    }

    evidence.push(payloadItem);
    currentSize += itemSize;
  }

  // Build summary statistics
  const sources_summary = {
    total: evidence.length,
    by_tier: {} as Record<string, number>,
    by_kind: {} as Record<string, number>,
  };

  for (const item of evidence) {
    sources_summary.by_tier[item.tier] =
      (sources_summary.by_tier[item.tier] || 0) + 1;
    sources_summary.by_kind[item.kind] =
      (sources_summary.by_kind[item.kind] || 0) + 1;
  }

  const payload: LLMPayload = {
    run_id: collector.getRunId(),
    institution_name: collector.getInstitutionName(),
    evidence,
    sources_summary,
    generated_at: Date.now(),
  };

  // Runtime guard: ensure no HTML in payload
  const payloadStr = JSON.stringify(payload);
  for (const pattern of HTML_DETECTOR_PATTERNS) {
    if (pattern.test(payloadStr)) {
      throw new Error(
        `Security violation: LLM payload contains HTML tags. Payload must be stripped before LLM consumption.`
      );
    }
  }

  return payload;
}

/**
 * Compact payload for transmission (removes metadata)
 */
export function toCompactPayload(payload: LLMPayload): {
  evidence: LLMPayloadEvidence[];
  summary: Record<string, number>;
} {
  return {
    evidence: payload.evidence,
    summary: {
      total: payload.sources_summary.total,
    },
  };
}

/**
 * Payload statistics
 */
export function getPayloadStats(payload: LLMPayload): {
  character_count: number;
  evidence_count: number;
  avg_quality: number;
  truncated: boolean;
  estimated_token_count: number;
} {
  const payloadStr = JSON.stringify(payload);
  const character_count = payloadStr.length;
  const evidence_count = payload.evidence.length;

  const avg_quality =
    evidence_count > 0
      ? payload.evidence.reduce((sum, e) => sum + e.quality, 0) / evidence_count
      : 0;

  const truncated = character_count >= LLM_PAYLOAD_LIMIT;

  // Rough estimate: ~1.3 tokens per character
  const estimated_token_count = Math.ceil(character_count / 3.5);

  return {
    character_count,
    evidence_count,
    avg_quality,
    truncated,
    estimated_token_count,
  };
}

/**
 * Validate payload (safety checks)
 */
export function validatePayload(payload: LLMPayload): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for HTML
  const payloadStr = JSON.stringify(payload);
  for (const pattern of HTML_DETECTOR_PATTERNS) {
    if (pattern.test(payloadStr)) {
      errors.push("Payload contains HTML tags");
    }
  }

  // Check size
  if (payloadStr.length > LLM_PAYLOAD_LIMIT) {
    errors.push(
      `Payload exceeds size limit (${payloadStr.length} > ${LLM_PAYLOAD_LIMIT})`
    );
  }

  // Check evidence quality scores
  for (const item of payload.evidence) {
    if (item.quality < 0 || item.quality > 1) {
      errors.push(
        `Invalid quality score for ${item.ref}: ${item.quality} (must be 0-1)`
      );
    }
  }

  // Check ref stability (e1, e2, e3, ...)
  for (let i = 0; i < payload.evidence.length; i++) {
    const expectedRef = `e${i + 1}`;
    const evidence = payload.evidence[i];
    if (evidence && evidence.ref !== expectedRef) {
      errors.push(`Unstable ref at index ${i}: expected ${expectedRef}, got ${evidence.ref}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
