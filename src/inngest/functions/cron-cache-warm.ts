/**
 * Cron: Cache Warm
 *
 * Runs daily to pre-warm the cache with the top 1000 requested
 * institution names from the last 30 days.
 *
 * Concurrency: singleton
 */

import { inngest, requestValidation } from "../client";
import { getDb } from "@/server/db/client";
import { validationRuns } from "@/server/db/schema";
import { gte, sql } from "drizzle-orm";

const CRON_SCHEDULE = "0 2 * * *"; // 2 AM daily
const TOP_N = 1000;

/**
 * Cron function for warming cache
 */
export const cronCacheWarm = inngest.createFunction(
  {
    id: "cron-cache-warm",
    name: "Cache Warm",

    // Run daily at 2 AM
    triggers: [
      {
        cron: CRON_SCHEDULE,
      },
    ],

    // Only one execution at a time
    concurrency: {
      key: "fn",
      limit: 1,
    },
  },
  // Handler
  async ({ step }) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Step 1: Get top requested names
      const topNames = await step.run("get-top-names", async () => {
        const db = getDb()!;

        const names = await db
          .select({
            normalizedName: validationRuns.normalizedName,
            requestCount: sql<number>`COUNT(*)`,
          })
          .from(validationRuns)
          .where(gte(validationRuns.createdAt, thirtyDaysAgo))
          .groupBy(validationRuns.normalizedName)
          .orderBy(sql`COUNT(*) DESC`)
          .limit(TOP_N);

        return names;
      });

      console.log(`[cron-cache-warm] Found ${topNames.length} top requested names`);

      // Step 2: Queue validations
      const queuedCount = await step.run("queue-warm-validations", async () => {
        let count = 0;

        for (const { normalizedName } of topNames) {
          try {
            await requestValidation(normalizedName, {
              maxTier: "fast", // Only run through fast path for cache warming
              priority: "low",
              tags: {
                cronJob: "cache-warm",
              },
            });
            count++;
          } catch (error) {
            console.warn(`[cron-cache-warm] Failed to queue ${normalizedName}:`, error);
          }
        }

        return count;
      });

      // Step 3: Log summary
      await step.run("log-summary", async () => {
        console.log(
          `[cron-cache-warm] Queued ${queuedCount}/${topNames.length} names for cache warming`
        );
      });

      return {
        success: true,
        queued: queuedCount,
        total: topNames.length,
      };
    } catch (error) {
      console.error("[cron-cache-warm] Error:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
