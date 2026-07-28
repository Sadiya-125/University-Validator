/**
 * Institution resolver (L1)
 *
 * Resolves institution input using matching/resolver module
 * Performs fuzzy matching against institution database
 * Uses trigram similarity + vector embeddings
 */

import type { IdentityResolver, ResolvedCandidate } from "../types";
import { resolveInstitution } from "../../matching/resolver";
import type { EmbeddingProvider } from "../../matching/embeddings";

/**
 * Institution resolver
 */
export class InstitutionResolver implements IdentityResolver {
  name = "institutions";

  constructor(private embeddingProvider?: EmbeddingProvider) {}

  /**
   * Resolve using matching/resolver module
   */
  async resolve(
    input: string,
    opts?: { limit?: number; timeout?: number; embeddingProvider?: EmbeddingProvider }
  ): Promise<ResolvedCandidate[]> {
    try {
      const provider = opts?.embeddingProvider || this.embeddingProvider;
      const limit = opts?.limit || 10;

      // Use resolver with timeout
      const resolved = await Promise.race([
        resolveInstitution(input, {
          limit,
          embeddingProvider: provider,
        }),
        opts?.timeout
          ? new Promise<any[]>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), opts.timeout)
            )
          : Promise.resolve([]),
      ]);

      // Convert to candidates
      return resolved.map((r) => ({
        id: r.id,
        name: r.canonicalName,
        type: r.type,
        confidence: r.confidence,
        source: `matching/${r.method}`,
        score: r.confidence,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      // Try resolving a test query
      const result = await resolveInstitution("test", { limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function
 */
export function createInstitutionResolver(
  embeddingProvider?: EmbeddingProvider
): InstitutionResolver {
  return new InstitutionResolver(embeddingProvider);
}

/**
 * Global instance
 */
let globalResolver: InstitutionResolver | null = null;

/**
 * Get global institution resolver
 */
export function getInstitutionResolver(
  embeddingProvider?: EmbeddingProvider
): InstitutionResolver {
  if (!globalResolver) {
    globalResolver = new InstitutionResolver(embeddingProvider);
  }
  return globalResolver;
}
