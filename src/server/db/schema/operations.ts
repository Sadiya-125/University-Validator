/**
 * Operations schema: batch processing, dead letters, provider health, metrics, and audit logs.
 */

import {
  pgTable,
  pgEnum,
  text,
  integer,
  serial,
  varchar,
  timestamp,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";
import { validationRuns } from "./evidence";

export const batchStateEnum = pgEnum("batch_state", [
  "created",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const providerStateEnum = pgEnum("provider_state", [
  "closed",
  "open",
  "half_open",
]);

/**
 * Batch processing (bulk validation).
 * One row per batch job (e.g., "Import 10k institutions from AICTE export").
 */
export const batches = pgTable(
  "batches",
  {
    id: serial('id').primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    sourceBlobKey: varchar("source_blob_key", { length: 256 }), // Vercel Blob path to input CSV
    total: integer("total").notNull(), // Total items in batch
    queued: integer("queued").default(0),
    succeeded: integer("succeeded").default(0),
    failed: integer("failed").default(0),
    state: batchStateEnum('state').notNull().default("created"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index('idx_28').on(table.state),
    index('idx_29').on(table.createdAt),
  ]
);

/**
 * Batch items (one per input row).
 * Track individual validation results within a batch.
 */
export const batchItems = pgTable(
  "batch_items",
  {
    id: serial('id').primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(), // Position in input
    inputName: varchar("input_name", { length: 512 }).notNull(),
    inputUniversity: varchar("input_university", { length: 512 }),
    state: varchar("state", { length: 64 }).notNull().default("pending"), // "pending", "succeeded", "failed"
    runId: integer("run_id").references(() => validationRuns.id),
    error: text("error"),
    attempts: integer("attempts").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_30').on(table.batchId),
    index('idx_31').on(table.state),
  ]
);

/**
 * Dead letter queue.
 * Events that failed multiple times and need manual intervention.
 */
export const deadLetters = pgTable(
  "dead_letters",
  {
    id: serial('id').primaryKey(),
    kind: varchar("kind", { length: 64 }).notNull(), // "validation_run", "registry_ingestion", etc.
    payload: jsonb("payload").notNull(),
    error: text("error"),
    attempts: integer("attempts").default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_32').on(table.kind),
    index('idx_33').on(table.resolvedAt),
  ]
);

/**
 * Provider health tracking (for circuit breaker).
 * Records recent failure rate, response times, and upstream health.
 */
export const providerHealth = pgTable(
  "provider_health",
  {
    provider: varchar("provider", { length: 64 }).primaryKey(), // "searxng", "aicte_api", etc.
    state: providerStateEnum('state').notNull().default("closed"),
    failures: integer("failures").default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    p50Ms: real("p50_ms"),
    p95Ms: real("p95_ms"),
    engineFailures: jsonb("engine_failures"), // For SearXNG: { "google": 5, "bing": 3 }
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Hourly metrics for dashboard and reporting.
 * Aggregate of validations, hits/misses, costs.
 */
export const metricsHourly = pgTable(
  "metrics_hourly",
  {
    id: serial('id').primaryKey(),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    tier: varchar("tier", { length: 32 }).notNull(), // "L0", "L1", "L2", "L3", "L4"
    verdict: varchar("verdict", { length: 32 }), // "Genuine", "Likely Genuine", "Unknown", etc.
    count: integer("count").notNull(),
    p50Ms: real("p50_ms"),
    p95Ms: real("p95_ms"),
    cacheHits: integer("cache_hits"),
    costUsd: real("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_34').on(table.hour),
    index('idx_35').on(table.tier),
  ]
);

/**
 * Audit log.
 * Every data modification (institution merge, evidence override, policy change, etc.)
 * recorded for compliance, debugging, and reversal.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial('id').primaryKey(),
    actor: varchar("actor", { length: 256 }), // User ID or "system"
    action: varchar("action", { length: 64 }).notNull(), // "merge", "override", "delete", "update_policy", etc.
    entity: varchar("entity", { length: 128 }).notNull(), // "institution", "evidence", "policy"
    entityId: integer("entity_id"),
    before: jsonb("before"), // State before the change
    after: jsonb("after"), // State after the change
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_36').on(table.actor),
    index('idx_37').on(table.action),
    index('idx_38').on(table.entity),
    index('idx_39').on(table.createdAt),
  ]
);
