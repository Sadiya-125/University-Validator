/**
 * Cron: Metrics Rollup
 *
 * Runs hourly to aggregate validation_runs into metrics_hourly.
 * Allows the overview dashboard to read one row per hour instead of
 * scanning millions of validation_runs rows.
 *
 * Concurrency: singleton
 */

import { inngest } from "../client";
import { getDb } from "@/server/db/client";
import { validationRuns } from "@/server/db/schema";
import { gte, lt, eq, sql } from "drizzle-orm";

const CRON_SCHEDULE = "0 * * * *"; // Every hour

/**
 * Cron function for metrics rollup
 */
export const cronMetricsRollup = inngest.createFunction(
  {
    id: "cron-metrics-rollup",
    name: "Metrics Rollup",

    // Run every hour
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
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const hourBucket = new Date(hourAgo.getTime() - (hourAgo.getTime() % (60 * 60 * 1000)));

      // Step 1: Aggregate metrics for the past hour
      const metrics = await step.run("aggregate-metrics", async () => {
        const db = getDb()!;

        // Get all validation runs in the past hour
        const runs = await db
          .select({
            total: sql<number>`COUNT(*)`,
            averageResponseTime: sql<number>`AVG(EXTRACT(EPOCH FROM (finished_at - created_at)) * 1000)`,
            p50ResponseTime: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - created_at)) * 1000)`,
            p95ResponseTime: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - created_at)) * 1000)`,
            cacheHits: sql<number>`COUNT(*) FILTER (WHERE cache_hit = true)`,
            verdictGeniune: sql<number>`COUNT(*) FILTER (WHERE verdict = 'Genuine')`,
            verdictLikelyGeniune: sql<number>`COUNT(*) FILTER (WHERE verdict = 'Likely Genuine')`,
            verdictUnknown: sql<number>`COUNT(*) FILTER (WHERE verdict = 'Unknown')`,
            verdictFake: sql<number>`COUNT(*) FILTER (WHERE verdict = 'Fake')`,
          })
          .from(validationRuns)
          .where(
            gte(validationRuns.createdAt, hourAgo)
          );

        return runs[0] || {
          total: 0,
          averageResponseTime: 0,
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          cacheHits: 0,
          verdictGeniune: 0,
          verdictLikelyGeniune: 0,
          verdictUnknown: 0,
          verdictFake: 0,
        };
      });

      // Step 2: Insert into metrics_hourly table
      await step.run("upsert-metrics", async () => {
        const db = getDb()!;

        // TODO: Implement upsert into metrics_hourly
        // INSERT INTO metrics_hourly (hour_bucket, total_runs, avg_response_time, p50, p95, cache_hits, ...)
        // VALUES (...)
        // ON CONFLICT (hour_bucket) DO UPDATE SET ...

        console.log(
          `[cron-metrics-rollup] Hour ${hourBucket.toISOString()}: ${metrics.total} runs, avg ${Math.round(metrics.averageResponseTime)}ms`
        );
      });

      return {
        success: true,
        hourBucket,
        totalRuns: metrics.total,
        averageResponseTime: metrics.averageResponseTime,
      };
    } catch (error) {
      console.error("[cron-metrics-rollup] Error:", error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);
