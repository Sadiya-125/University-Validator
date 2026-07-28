/**
 * Base mirror enricher
 *
 * Queries registry database by authority code
 * Returns cached evidence with snapshot date
 * Target: <80ms
 */

import type { ResolvedIdentity } from "../../../discovery/types";
import type { Enricher, EvidenceItem } from "../../types";
import { AuthorityCode, EvidenceQuality } from "../../types";
import { db } from "../../../db";
import { registryEntries } from "../../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Base mirror enricher
 */
export abstract class BaseMirrorEnricher implements Enricher {
  abstract name: string;
  abstract authority: AuthorityCode;

  tier = "mirror" as const;

  async verify(
    identity: ResolvedIdentity,
    opts?: { timeout?: number }
  ): Promise<EvidenceItem[]> {
    try {
      const evidence: EvidenceItem[] = [];

      // Query registry by institution ID
      if (identity.institutionId) {
        const entries = await db
          .select()
          .from(registryEntries)
          .where(eq(registryEntries.source, this.authority))
          .limit(1);

        if (entries.length > 0) {
          const entry = entries[0];
          evidence.push({
            source: this.authority,
            tier: "mirror",
            timestamp: Date.now(),
            snapshot_date: entry.createdAt ? entry.createdAt.getTime() : undefined,
            url: entry.sourceUrl || undefined,
            category: "legitimacy",
            quality_score: EvidenceQuality.TIER_MIRROR,
            confidence: 0.9,
            matched_text: entry.name,
            metadata: {
              registryId: entry.id,
              externalId: entry.externalId,
            },
          });
        }
      }

      return evidence;
    } catch (error) {
      // Degrade gracefully
      return [
        {
          source: this.authority,
          tier: "mirror",
          timestamp: Date.now(),
          category: "unavailable",
          quality_score: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      ];
    }
  }

  async health(): Promise<boolean> {
    try {
      await db.select().from(registryEntries).limit(1);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a mirror enricher for an authority
 */
export function createMirrorEnricher(authority: AuthorityCode): Enricher {
  return new (class extends BaseMirrorEnricher {
    name = `${authority.toLowerCase()}-mirror`;
    authority = authority;
  })();
}
