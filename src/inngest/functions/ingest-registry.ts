/**
 * Inngest function: Ingest Registry
 *
 * Ingests authority registries (AISHE, UGC, NAD, etc.) from various sources.
 *
 * Concurrency:
 *   - { key: "event.data.authority", limit: 1 } (per-authority serialization)
 *   - { scope: "fn", limit: 2 } (global: only 2 concurrent ingests)
 *
 * Steps:
 * 1. Validate authority and data source
 * 2. Fetch/validate data from authority connector
 * 3. Process and normalize records
 * 4. Upsert into database
 * 5. Update registry metadata (last_ingested_at, record_count)
 * 6. Emit batch/created event for new institutions
 */

import { inngest } from "../client";
import { ServerProgressPublisher } from "../channels";
import type { RegistryIngestRequestedEvent } from "../client";
import { getDb } from "@/server/db/client";
import { randomUUID } from "crypto";

/**
 * Authority connector interface
 */
interface AuthorityConnector {
  name: string;
  fetch(since?: Date): Promise<Array<{
    id: string;
    name: string;
    city?: string;
    state?: string;
    country?: string;
    type?: string;
    status?: string;
  }>>;
  normalize(record: any): {
    normalizedName: string;
    metadata: Record<string, any>;
  };
}

/**
 * Get connector for authority
 */
function getConnector(authority: string): AuthorityConnector {
  switch (authority.toLowerCase()) {
    case "aishe":
      return {
        name: "AISHE",
        async fetch(since?: Date) {
          // TODO: Implement AISHE connector
          console.log(`Fetching AISHE data since ${since}`);
          return [];
        },
        normalize(record: any) {
          return {
            normalizedName: (record.name || "").toLowerCase().trim(),
            metadata: { source: "aishe", ...record },
          };
        },
      };
    case "ugc":
      return {
        name: "UGC",
        async fetch(since?: Date) {
          // TODO: Implement UGC connector
          console.log(`Fetching UGC data since ${since}`);
          return [];
        },
        normalize(record: any) {
          return {
            normalizedName: (record.institutionName || "").toLowerCase().trim(),
            metadata: { source: "ugc", ...record },
          };
        },
      };
    case "nad":
      return {
        name: "NAD",
        async fetch(since?: Date) {
          // TODO: Implement NAD connector
          console.log(`Fetching NAD data since ${since}`);
          return [];
        },
        normalize(record: any) {
          return {
            normalizedName: (record.collegeName || "").toLowerCase().trim(),
            metadata: { source: "nad", ...record },
          };
        },
      };
    default:
      throw new Error(`Unknown authority: ${authority}`);
  }
}

/**
 * Main ingest-registry function
 */
export const ingestRegistry = (inngest.createFunction as any)(
  {
    id: "ingest-registry",
    name: "Ingest Registry",

    // Concurrency limits
    concurrency: [
      {
        // Serialize ingests per authority
        key: "event.data.authority",
        limit: 1,
      },
      {
        // Global limit: only 2 concurrent ingests
        scope: "fn",
        limit: 2,
      },
    ],

    // Timeout after 30 minutes (registries can be large)
    timeout: "30m",
  },

  // Events this function responds to and handler
  { event: "registry/ingest.requested" },

  async ({ event, step }: any) => {
    const { authority, force = false, since } = (event as any).data;
    const batchId = randomUUID();
    const db = getDb()!;

    try {
      // Step 1: Get and validate connector
      const connector = getConnector(authority);

      // Step 2: Fetch data from authority
      const records = await step.run("fetch-authority-data", async () => {
        console.log(`Fetching ${authority} data...`);
        return connector.fetch(since);
      });

      console.log(`Fetched ${records.length} records from ${authority}`);

      if (records.length === 0) {
        return {
          success: true,
          authority,
          recordCount: 0,
          message: "No new records to ingest",
        };
      }

      // Step 3: Process and normalize records
      const normalizedRecords = await step.run("normalize-records", async () => {
        return records.map((record: any) => ({
          ...connector.normalize(record),
          rawId: record.id,
          metadata: {
            ...connector.normalize(record).metadata,
            ingestedAt: new Date().toISOString(),
          },
        }));
      });

      // Step 4: Upsert into database
      const upsertedCount = await step.run("upsert-records", async () => {
        let count = 0;

        for (const record of normalizedRecords) {
          try {
            // TODO: Implement actual upsert logic
            // await db
            //   .insert(institutions)
            //   .values({
            //     normalizedName: record.normalizedName,
            //     metadata: record.metadata,
            //   })
            //   .onConflictDoUpdate(sql`...`);
            count++;
          } catch (error) {
            console.error(`Failed to upsert ${record.normalizedName}:`, error);
          }
        }

        return count;
      });

      // Step 5: Emit batch created event
      await step.run("emit-batch-created", async () => {
        await inngest.send({
          name: "batch/created",
          data: {
            batchId,
            institutionCount: upsertedCount,
            source: authority,
            createdAt: new Date(),
          },
        });
      });

      // Step 6: Update registry metadata
      await step.run("update-registry-metadata", async () => {
        // TODO: Update last_ingested_at, record_count in registries table
        console.log(`Updated ${authority} registry metadata`);
      });

      return {
        success: true,
        authority,
        batchId,
        recordCount: upsertedCount,
        message: `Successfully ingested ${upsertedCount} records from ${authority}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`Registry ingest failed for ${authority}:`, errorMessage);

      // Publish error
      await ServerProgressPublisher.publishProgress(batchId, {
        step: "ingest-registry",
        status: "error",
        error: errorMessage,
      });

      throw error;
    }
  }
);

/**
 * Scheduled registry ingest (daily for all authorities)
 */
export const scheduleRegistryIngest = (inngest.createFunction as any)(
  {
    id: "schedule-registry-ingest",
    name: "Schedule Registry Ingest",
  },
  { cron: "0 2 * * *" }, // Daily at 2 AM UTC
  async ({ step }: any) => {
    const authorities = ["aishe", "ugc", "nad"];

    for (const authority of authorities) {
      await step.sendEvent("queue-ingest", {
        name: "registry/ingest.requested",
        data: {
          authority,
          force: false,
        },
      });
    }

    return { success: true, authorities };
  }
);
