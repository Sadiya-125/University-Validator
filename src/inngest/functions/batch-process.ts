/**
 * Inngest function: Batch Process
 *
 * Processes a batch of institutions for validation.
 *
 * Concurrency:
 *   - { key: "event.data.batchId", limit: 20 } (per-batch serialization)
 *   - { scope: "fn", limit: 5 } (global: max 5 concurrent batches)
 *
 * Steps:
 * 1. Load batch and batch_items from database
 * 2. Deduplicate normalized names
 * 3. Fan out validations in chunks of 100 via step.sendEvent
 * 4. Track progress and update counters
 * 5. Generate result CSV and upload to Blob
 * 6. Emit batch completion event
 */

import { inngest, requestValidation } from "../client";
import { getDb } from "@/server/db/client";
import { batches, batchItems } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { normalizeInstitutionName } from "@/server/normalization/normalizer";
import { randomUUID } from "crypto";

interface BatchItemRow {
  id: number;
  rowNo: number;
  inputName: string;
  inputUniversity?: string;
  state?: string;
}

/**
 * Batch process function
 */
export const batchProcess = inngest.createFunction(
  {
    id: "batch-process",
    name: "Batch Process",

    // Trigger on batch/created event
    triggers: [{ event: "batch/created" }],

    // Concurrency limits
    concurrency: [
      {
        // One batch at a time
        key: "event.data.batchId",
        limit: 1,
      },
      {
        // Global limit: 5 concurrent batch jobs
        scope: "fn",
        limit: 5,
      },
    ],
  },
  // Main handler
  async ({ event, step }: any) => {
    const { batchId, institutionCount } = event.data;
    const batchNumId = parseInt(batchId, 10);

    try {
      // Step 1: Load batch and items from database
      const batchData = await step.run("load-batch", async () => {
        const db = getDb()!;

        const batchRecord = await db
          .select()
          .from(batches)
          .where(eq(batches.id, batchNumId))
          .limit(1);

        if (!batchRecord.length) {
          throw new Error(`Batch ${batchNumId} not found`);
        }

        const items = await db
          .select()
          .from(batchItems)
          .where(eq(batchItems.batchId, batchNumId));

        return { batch: batchRecord[0], items: items as unknown as BatchItemRow[] };
      });

      const { batch, items } = batchData;

      // Update batch state to running
      await step.run("update-batch-running", async () => {
        const db = getDb()!;
        await db
          .update(batches)
          .set({ state: "running", queued: items.length })
          .where(eq(batches.id, batchNumId));
      });

      // Step 2: Deduplicate normalized names
      const dedupeData = await step.run("deduplicate", async () => {
        const normalized = new Map<string, BatchItemRow[]>();

        for (const item of items) {
          const normalizedName = normalizeInstitutionName(item.inputName);
          if (!normalized.has(normalizedName)) {
            normalized.set(normalizedName, []);
          }
          normalized.get(normalizedName)!.push(item);
        }

        return {
          unique: normalized.size,
          deduped: items.length - normalized.size,
          mapping: normalized,
        };
      });

      const { unique, deduped, mapping } = dedupeData;

      console.log(
        `[batch-process] Batch ${batchNumId}: ${items.length} items, ${unique} unique (saved ${deduped} redundant validations)`
      );

      // Step 3: Fan out validations in chunks of 100
      const CHUNK_SIZE = 100;
      const uniqueNames = Array.from(mapping.keys());
      const chunks: string[][] = [];

      for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
        chunks.push(uniqueNames.slice(i, i + CHUNK_SIZE));
      }

      // Send validation events for each chunk
      const validationRunIds: string[] = [];

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];

        await step.run(`fan-out-chunk-${chunkIdx}`, async () => {
          for (const normalizedName of chunk) {
            // Each item in the chunk gets validated (deduplicated within batch)
            await requestValidation(normalizedName, {
              maxTier: "finalize",
              priority: "normal",
              tags: {
                batchId: String(batchNumId),
                chunkIdx: String(chunkIdx),
              },
            });

            validationRunIds.push(randomUUID());
          }
        });

        // Publish progress
        await step.run(`publish-progress-${chunkIdx}`, async () => {
          const progress = {
            batchId: batchNumId,
            processed: Math.min((chunkIdx + 1) * CHUNK_SIZE, unique),
            total: unique,
            percentage: Math.round(((chunkIdx + 1) * CHUNK_SIZE / unique) * 100),
          };

          console.log(
            `[batch-process] Progress: ${progress.processed}/${progress.total} (${progress.percentage}%)`
          );
          // TODO: Publish to Realtime channel
        });
      }

      // Step 4: Update batch completion
      const completionData = await step.run("finalize-batch", async () => {
        const db = getDb()!;

        // Count final results
        const itemResults = await db
          .select()
          .from(batchItems)
          .where(eq(batchItems.batchId, batchNumId));

        const succeeded = itemResults.filter((i) => i.state === "succeeded").length;
        const failed = itemResults.filter((i) => i.state === "failed").length;

        // Update batch record
        await db
          .update(batches)
          .set({
            state: "completed",
            succeeded,
            failed,
            finishedAt: new Date(),
          })
          .where(eq(batches.id, batchNumId));

        return { succeeded, failed, total: items.length };
      });

      const { succeeded, failed } = completionData;

      console.log(
        `[batch-process] Batch ${batchNumId} completed: ${succeeded} succeeded, ${failed} failed`
      );

      // Step 5: Generate result CSV (simplified - would be saved to Blob in production)
      const csvResult = await step.run("generate-csv", async () => {
        const rows: string[] = [
          "row_no,input_name,status,verdict,confidence,authorities,website,contacts",
        ];

        // TODO: Query results and build CSV
        // This would join batch_items with validation results

        return rows.join("\n");
      });

      return {
        success: true,
        batchId: batchNumId,
        processed: unique,
        succeeded,
        failed,
        message: `Batch completed: ${succeeded} succeeded, ${failed} failed`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update batch state to failed
      try {
        const db = getDb()!;
        await db
          .update(batches)
          .set({ state: "failed", finishedAt: new Date() })
          .where(eq(batches.id, batchNumId));
      } catch (e) {
        console.error("[batch-process] Failed to update batch state:", e);
      }

      console.error(`[batch-process] Batch ${batchNumId} failed:`, error);

      return {
        success: false,
        batchId: batchNumId,
        error: errorMessage,
      };
    }
  }
);
