/**
 * Mirror resolver (L2)
 *
 * Resolves institution input using registry database
 * Queries registry tables for known institution entries
 * No web access - runs entirely from database
 */

import type { IdentityResolver, ResolvedCandidate } from "../types";
import { getDb } from "../../db/client";
import { institutions, registryEntries } from "../../db/schema";
import { like } from "drizzle-orm";

/**
 * Mirror resolver
 */
export class MirrorResolver implements IdentityResolver {
  name = "mirror";

  /**
   * Resolve using registry database
   */
  async resolve(
    input: string,
    opts?: { limit?: number }
  ): Promise<ResolvedCandidate[]> {
    try {
      const limit = opts?.limit || 10;
      const searchTerm = `%${input}%`;
      const db = getDb()!;

      // Query institutions table
      const institutionResults = await db
        .select()
        .from(institutions)
        .where(like(institutions.canonicalName, searchTerm))
        .limit(limit);

      // Query registry entries table
      const registryResults = await db
        .select()
        .from(registryEntries)
        .where(like(registryEntries.canonicalName, searchTerm))
        .limit(limit);

      const candidates: ResolvedCandidate[] = [];

      // Convert institutions to candidates
      for (const inst of institutionResults) {
        candidates.push({
          id: inst.id,
          name: inst.canonicalName || "",
          type: "institution",
          confidence: this.calculateConfidence(input, inst.canonicalName),
          source: "registry/institution",
        });
      }

      // Convert registry entries to candidates
      for (const entry of registryResults) {
        candidates.push({
          id: entry.id,
          name: entry.canonicalName || "",
          type: "registry",
          confidence: this.calculateConfidence(input, entry.canonicalName || ""),
          source: `registry/${entry.code}`,
        });
      }

      // Sort by confidence and return top limit
      return candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      // Try a simple query
      const db = getDb()!;
      await db.select().from(institutions).limit(1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate confidence based on string similarity
   */
  private calculateConfidence(input: string, name: string): number {
    const inputLower = input.toLowerCase().trim();
    const nameLower = name.toLowerCase().trim();

    // Exact match
    if (inputLower === nameLower) {
      return 1.0;
    }

    // Contains
    if (nameLower.includes(inputLower) || inputLower.includes(nameLower)) {
      return 0.8;
    }

    // Partial match (Levenshtein-like)
    const similarity = this.stringSimilarity(inputLower, nameLower);
    return Math.max(0, Math.min(1, 0.5 + similarity * 0.5));
  }

  /**
   * Simple string similarity (0.0-1.0)
   */
  private stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;

    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) matches++;
    }

    return matches / maxLen;
  }
}

/**
 * Factory function
 */
export function createMirrorResolver(): MirrorResolver {
  return new MirrorResolver();
}

/**
 * Global instance
 */
let globalResolver: MirrorResolver | null = null;

/**
 * Get global mirror resolver
 */
export function getMirrorResolver(): MirrorResolver {
  if (!globalResolver) {
    globalResolver = new MirrorResolver();
  }
  return globalResolver;
}
