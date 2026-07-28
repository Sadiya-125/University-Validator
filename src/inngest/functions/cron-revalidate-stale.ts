/**
 * Cron: Revalidate Stale Records
 *
 * Runs every 6 hours to revalidate institutions with expired verdicts.
 *
 * Concurrency: singleton (only one execution at a time)
 *
 * Steps:
 * 1. Select institutions where valid_until < now()
 * 2. Order by verdict riskiness, then by age
 * 3. Cap at 500 per run
 * 4. Queue with low priority
 * 5. Log summary to audit log
 */

import { inngest, requestValidation } from "../client";
import { getDb } from "@/server/db/client";
import { institutions } from "@/server/db/schema";
import { lt, sql } from "drizzle-orm";

const CRON_SCHEDULE = "0 */6 * * *"; // Every 6 hours
const MAX_PER_RUN = 500;

/**
 * Cron function for revalidating stale records
 */
export const cronRevalidateStale = inngest.createFunction(
  {
    id: "cron-revalidate-stale",
    name: "Revalidate Stale Records",

    // Run every 6 hours
    trigger: {
      cron: CRON_SCHEDULE,
    },

    // Only one execution at a time
    concurrency: {
      key: "fn",
      limit: 1,
    },
  },
  // Handler
  async ({ step }) => {
    try {
      // Step 1: Select stale institutions
      const staleRecords = await step.run("select-stale", async () => {
        const db = getDb()!;

        // Order by verdict riskiness: Unknown > New > Likely > Genuine
        const verdictOrder = sql`CASE
          WHEN verdict = 'Unknown' THEN 1
          WHEN verdict = 'New' THEN 2
          WHEN verdict = 'Likely Genuine' THEN 3
          WHEN verdict = 'Genuine' THEN 4
          ELSE 5
        END`;

        const records = await db
          .select({
            id: institutions.id,
            canonicalName: institutions.canonicalName,
            normalizedName: institutions.normalizedName,
            verdict: institutions.verdict,
            lastValidatedAt: institutions.lastValidatedAt,
          })
          .from(institutions)
          .where(
            lt(
              institutions.validUntil,
              new Date()
            )
          )
          .orderBy(verdictOrder, institutions.lastValidatedAt)
          .limit(MAX_PER_RUN);

        return records;
      });

      console.log(
        `[cron-revalidate-stale] Found ${staleRecords.length} stale records`
      );

      // Step 2: Queue validations
      const queuedCount = await step.run("queue-validations", async () => {
        let count = 0;
        for (const record of staleRecords) {
          try {
            await requestValidation(record.normalizedName, {
              maxTier: "finalize",
              priority: "low",
              tags: {
                cronJob: "revalidate-stale",
                previousVerdict: record.verdict || "unknown",
              },
            });
            count++;
          } catch (error) {
            console.warn(`[cron-revalidate-stale] Failed to queue ${record.normalizedName}:`, error);
          }
        }
        return count;
      });

      // Step 3: Log summary to audit
      await step.run("log-summary", async () => {
        console.log(
          `[cron-revalidate-stale] Completed: ${queuedCount}/${staleRecords.length} queued for revalidation`
        );
        // TODO: Write to audit_log table
      });

      return {
        success: true,
        scheduled: queuedCount,
        total: staleRecords.length,
      };
    } catch (error) {
      console.error("[cron-revalidate-stale] Error:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
