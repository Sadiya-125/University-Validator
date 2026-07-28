/**
 * POST /api/batches
 *
 * Create a batch validation job from CSV data.
 *
 * Request body: {
 *   name: string;
 *   items: Array<{
 *     institution_name: string;
 *     university_name?: string;
 *     state?: string;
 *     district?: string;
 *   }>;
 *   sourceBlobKey?: string; // Vercel Blob path
 * }
 *
 * Response: {
 *   success: true;
 *   batchId: number;
 *   total: number;
 *   message: string;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { batches, batchItems } from "@/server/db/schema";
import { requestBatchProcess } from "@/inngest";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * CSV row schema
 */
const CsvRowSchema = z.object({
  institution_name: z.string().min(1, "Institution name is required").max(512),
  university_name: z.string().max(512).optional(),
  state: z.string().max(128).optional(),
  district: z.string().max(128).optional(),
});

/**
 * Batch creation schema
 */
const CreateBatchSchema = z.object({
  name: z.string().min(1).max(256),
  items: z.array(CsvRowSchema).min(1).max(50000),
  sourceBlobKey: z.string().max(256).optional(),
});

type BatchItem = z.infer<typeof CsvRowSchema>;

/**
 * POST /api/batches
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const validated = CreateBatchSchema.parse(body);
    const { name, items, sourceBlobKey } = validated;

    const db = getDb()!;

    // Create batch record
    const batchResult = await db
      .insert(batches)
      .values({
        name,
        sourceBlobKey,
        total: items.length,
        state: "created",
      })
      .returning();

    if (batchResult.length === 0) {
      throw new Error("Failed to create batch");
    }

    const batchId = batchResult[0]!.id;

    // Bulk insert batch items in chunks
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batchItemsData = chunk.map((item, idx) => ({
        batchId,
        rowNo: i + idx + 1,
        inputName: item.institution_name,
        inputUniversity: item.university_name,
        state: "pending" as const,
      }));

      await db.insert(batchItems).values(batchItemsData);
    }

    // Update batch state to queued
    await db
      .update(batches)
      .set({ state: "queued" })
      .where(eq(batches.id, batchId));

    // Emit batch/created event (single event, Inngest will fan-out)
    try {
      await requestBatchProcess(batchId, {
        name,
        total: items.length,
        priority: "normal",
      });
    } catch (error) {
      console.error("[POST /api/batches] Failed to queue batch process:", error);
      // Don't fail the request - batch was created, just couldn't queue
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        batchId,
        total: items.length,
        message: `Batch created with ${items.length} items. Processing will begin shortly.`,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[POST /api/batches] Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid CSV data",
          code: "VALIDATION_ERROR",
          issues: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/batches
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
