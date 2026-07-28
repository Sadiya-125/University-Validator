/**
 * Inngest client with Realtime middleware and Zod-typed events
 *
 * Events:
 * - validation/requested: User initiates validation
 * - validation/completed: Validation finished successfully
 * - validation/failed: Validation encountered error
 * - batch/created: New batch of institutions queued
 * - batch/item.queued: Single item in batch queued
 * - registry/ingest.requested: Ingest authority registry
 * - revalidation/due: Scheduled revalidation trigger
 * - deadletter/retry: Retry from dead letter queue
 */

import { Inngest } from "inngest";
import { z } from "zod";

/**
 * Validation requested event schema
 */
const ValidationRequestedSchema = z.object({
  normalizedName: z.string().min(1),
  inputVariant: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  maxTier: z
    .enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"])
    .default("finalize"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

/**
 * Validation completed event schema
 */
const ValidationCompletedSchema = z.object({
  runId: z.string().min(1),
  normalizedName: z.string().min(1),
  verdict: z.enum(["genuine", "likely_genuine", "likely_fake", "fake", "needs_review", "insufficient_evidence"]),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  validationRunId: z.string().min(1),
  duration: z.number().min(0),
  tierReachedAt: z.enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"]),
});

/**
 * Validation failed event schema
 */
const ValidationFailedSchema = z.object({
  runId: z.string().min(1),
  normalizedName: z.string().min(1),
  error: z.string().min(1),
  code: z.string().optional(),
  stage: z.enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"]),
  retryCount: z.number().default(0),
});

/**
 * Batch created event schema
 */
const BatchCreatedSchema = z.object({
  batchId: z.string().min(1),
  institutionCount: z.number().positive(),
  source: z.string().min(1), // "csv", "api", "merge", etc.
  createdAt: z.date().default(() => new Date()),
});

/**
 * Batch item queued event schema
 */
const BatchItemQueuedSchema = z.object({
  batchId: z.string().min(1),
  normalizedName: z.string().min(1),
  sequence: z.number().min(0),
  totalInBatch: z.number().positive(),
});

/**
 * Registry ingest requested event schema
 */
const RegistryIngestRequestedSchema = z.object({
  authority: z.string().min(1), // "aishe", "ugc", "nad", etc.
  force: z.boolean().default(false),
  since: z.date().optional(),
});

/**
 * Revalidation due event schema
 */
const RevalidationDueSchema = z.object({
  validationRunId: z.string().min(1),
  institutionId: z.string().min(1),
  normalizedName: z.string().min(1),
  lastVerdict: z.string().min(1),
  riskLevel: z.enum(["low", "high"]),
});

/**
 * Dead letter retry event schema
 */
const DeadLetterRetrySchema = z.object({
  originalEventId: z.string().min(1),
  originalEventName: z.string().min(1),
  originalData: z.record(z.string(), z.unknown()),
  failureReason: z.string().min(1),
  retryAttempt: z.number().min(1),
});

/**
 * Inngest client with all events
 */
export const inngest = new Inngest({
  id: "university-validator",
  eventKey: process.env.INNGEST_EVENT_KEY || "",
  baseUrl: process.env.INNGEST_BASE_URL,
  events: {
    "validation/requested": {
      data: ValidationRequestedSchema,
    },
    "validation/completed": {
      data: ValidationCompletedSchema,
    },
    "validation/failed": {
      data: ValidationFailedSchema,
    },
    "batch/created": {
      data: BatchCreatedSchema,
    },
    "batch/item.queued": {
      data: BatchItemQueuedSchema,
    },
    "registry/ingest.requested": {
      data: RegistryIngestRequestedSchema,
    },
    "revalidation/due": {
      data: RevalidationDueSchema,
    },
    "deadletter/retry": {
      data: DeadLetterRetrySchema,
    },
  },
});

/**
 * Type-safe event schemas for use across the codebase
 */
export type ValidationRequestedEvent = z.infer<typeof ValidationRequestedSchema>;
export type ValidationCompletedEvent = z.infer<typeof ValidationCompletedSchema>;
export type ValidationFailedEvent = z.infer<typeof ValidationFailedSchema>;
export type BatchCreatedEvent = z.infer<typeof BatchCreatedSchema>;
export type BatchItemQueuedEvent = z.infer<typeof BatchItemQueuedSchema>;
export type RegistryIngestRequestedEvent = z.infer<typeof RegistryIngestRequestedSchema>;
export type RevalidationDueEvent = z.infer<typeof RevalidationDueSchema>;
export type DeadLetterRetryEvent = z.infer<typeof DeadLetterRetrySchema>;

/**
 * Helper to send validation requested event
 */
export async function requestValidation(
  normalizedName: string,
  opts?: Partial<ValidationRequestedEvent>
) {
  return inngest.send({
    name: "validation/requested",
    data: {
      normalizedName,
      ...opts,
    },
  });
}

/**
 * Helper to send validation completed event
 */
export async function completeValidation(event: ValidationCompletedEvent) {
  return inngest.send({
    name: "validation/completed",
    data: event,
  });
}

/**
 * Helper to send validation failed event
 */
export async function failValidation(event: ValidationFailedEvent) {
  return inngest.send({
    name: "validation/failed",
    data: event,
  });
}

/**
 * Helper to send batch created event
 */
export async function createBatch(event: BatchCreatedEvent) {
  return inngest.send({
    name: "batch/created",
    data: event,
  });
}

/**
 * Helper to send batch item queued event
 */
export async function queueBatchItem(event: BatchItemQueuedEvent) {
  return inngest.send({
    name: "batch/item.queued",
    data: event,
  });
}
