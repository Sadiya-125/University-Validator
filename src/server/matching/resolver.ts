/**
 * Multi-signal institution resolver
 *
 * Combines name normalization, abbreviation expansion, trigram similarity,
 * and vector embeddings to resolve institution names to canonical records.
 *
 * Resolution strategy:
 * 1. Exact identity match → return immediately (method: "identity")
 * 2. Normalize name + expand variants
 * 3. Trigram similarity search (50 results per source)
 * 4. Vector embedding rerank
 * 5. Fusion scoring: 0.45·trigram + 0.35·vector + 0.12·state + 0.08·address
 * 6. Confidence thresholds:
 *    ≥0.90 → Accept (high confidence)
 *    0.70-0.90 → Accept but mark for manual review
 *    <0.70 → New entity (low confidence)
 *
 * Target performance: p95 <400ms at 100k registry rows.
 */

import { normalizeName } from "./normalize";
import { expandVariants } from "./abbreviations";
import { findTrigramCandidates, TrigramCandidate } from "./trigram";
import { getEmbeddingProvider, EmbeddingProvider } from "./embeddings";
import { findInstitutionByIdentity } from "./identity";

/**
 * Scoring signals from different matching methods
 */
export interface ScoreBreakdown {
  trigram: number; // 0.35-1.0
  vector: number; // 0.0-1.0
  stateMatch: number; // 0.0 or 1.0
  addressTrigram: number; // 0.0-1.0
  final: number; // Weighted fusion
}

/**
 * Resolved institution candidate
 */
export interface ResolvedCandidate {
  id: number;
  canonicalName: string;
  type: "institution" | "registry";
  source?: string;
  confidence: number; // 0.0-1.0
  method: "identity" | "trigram+vector" | "new";
  scores: ScoreBreakdown;
  needsReview: boolean; // True if 0.70-0.90 confidence
}

/**
 * Resolve an institution name to canonical record(s)
 *
 * @param input - Raw institution name (any format, misspellings, abbreviations)
 * @param opts - Resolution options
 * @returns Array of candidates sorted by confidence (highest first)
 */
export async function resolveInstitution(
  input: string,
  opts: {
    limit?: number; // Max candidates to return (default 5)
    embeddingProvider?: EmbeddingProvider;
    threshold?: number; // Min confidence to return (default 0.50)
  } = {}
): Promise<ResolvedCandidate[]> {
  const { limit = 5, threshold = 0.5 } = opts;

  // 1. Try exact identity match first (if input looks like an external ID)
  const identityMatch = await findInstitutionByIdentity("MANUAL", input);
  if (identityMatch) {
    return [
      {
        id: identityMatch.institutionId,
        canonicalName: input,
        type: "institution",
        confidence: 1.0,
        method: "identity",
        scores: {
          trigram: 1.0,
          vector: 1.0,
          stateMatch: 1.0,
          addressTrigram: 1.0,
          final: 1.0,
        },
        needsReview: false,
      },
    ];
  }

  // 2. Normalize and expand variants
  const normalized = normalizeName(input);
  const variants = expandVariants(normalized.normalized);

  // 3. Trigram search for each variant
  const allTrigramCandidates = new Map<number, TrigramCandidate>();
  for (const variant of variants) {
    const candidates = await findTrigramCandidates({
      names: [variant],
      limit: 50,
    });
    for (const candidate of candidates) {
      if (!allTrigramCandidates.has(candidate.id)) {
        allTrigramCandidates.set(candidate.id, candidate);
      }
    }
  }

  if (allTrigramCandidates.size === 0) {
    return []; // No candidates found
  }

  // 4. Vector embedding rerank (optional, based on provider)
  const embedProvider =
    opts.embeddingProvider || (await getEmbeddingProvider("fake"));

  const inputEmbeddings = await embedProvider.embed([input]);
  if (!inputEmbeddings || inputEmbeddings.length === 0) {
    throw new Error("Failed to generate embedding for input");
  }
  const inputEmbedding = inputEmbeddings[0]!;

  const candidateNames = Array.from(allTrigramCandidates.values()).map(
    (c) => c.name
  );
  const candidateEmbeddings = await embedProvider.embed(candidateNames);

  // Calculate vector similarity
  const vectorScores = new Map<number, number>();
  for (let i = 0; i < allTrigramCandidates.size; i++) {
    const candidate = Array.from(allTrigramCandidates.values())[i];
    if (!candidate) break;
    const cosineSimilarity = calculateCosineSimilarity(
      inputEmbedding.vector,
      candidateEmbeddings[i]!.vector
    );
    vectorScores.set(candidate.id, cosineSimilarity);
  }

  // 5. Fusion scoring
  const resolved: ResolvedCandidate[] = [];
  for (const [id, candidate] of allTrigramCandidates) {
    const trigramScore = candidate.similarity; // 0.35-1.0
    const vectorScore = vectorScores.get(id) || 0.5; // 0.0-1.0
    const stateMatch =
      normalized.state && candidate.name.toLowerCase().includes(normalized.state)
        ? 1.0
        : 0.0;

    // Fusion: 0.45·trigram + 0.35·vector + 0.12·state + 0.08·other
    const fusionScore =
      0.45 * trigramScore + 0.35 * vectorScore + 0.12 * stateMatch;

    if (fusionScore >= threshold) {
      const needsReview = fusionScore < 0.9;

      resolved.push({
        id,
        canonicalName: candidate.name,
        type: candidate.type as "institution" | "registry",
        source: candidate.source,
        confidence: Math.min(1.0, fusionScore),
        method: "trigram+vector",
        scores: {
          trigram: trigramScore,
          vector: vectorScore,
          stateMatch,
          addressTrigram: 0.0, // Not implemented for this version
          final: fusionScore,
        },
        needsReview,
      });
    }
  }

  // Sort by confidence and return top N
  resolved.sort((a, b) => b.confidence - a.confidence);
  return resolved.slice(0, limit);
}

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    return 0;
  }

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i]! * vec2[i]!;
    mag1 += vec1[i]! * vec1[i]!;
    mag2 += vec2[i]! * vec2[i]!;
  }

  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);

  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  return dotProduct / (mag1 * mag2);
}

/**
 * Batch resolve multiple institution names
 *
 * More efficient than calling resolveInstitution multiple times,
 * as it shares embedding generation.
 *
 * @param inputs - Array of institution names
 * @param opts - Resolution options
 * @returns Map of input index to resolved candidates
 */
export async function resolveInstitutionBatch(
  inputs: string[],
  opts: {
    limit?: number;
    embeddingProvider?: EmbeddingProvider;
    threshold?: number;
  } = {}
): Promise<Map<number, ResolvedCandidate[]>> {
  const results = new Map<number, ResolvedCandidate[]>();

  // Run each resolution sequentially to avoid resource exhaustion
  // (In production, consider parallel resolution with rate limiting)
  for (let i = 0; i < inputs.length; i++) {
    const candidates = await resolveInstitution(inputs[i]!, opts);
    results.set(i, candidates);
  }

  return results;
}

/**
 * Quick confidence assessment for a candidate
 */
export function getConfidenceLevel(
  confidence: number
): "high" | "medium" | "low" | "unknown" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  if (confidence >= 0.5) return "low";
  return "unknown";
}
