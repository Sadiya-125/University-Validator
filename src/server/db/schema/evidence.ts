/**
 * Evidence and validation run tracking schema.
 * Immutable audit trail of every validation execution.
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
import { institutions } from "./canonical";

export const verdictEnum = pgEnum("verdict", [
  "Genuine",
  "Likely Genuine",
  "Unknown",
  "Unverified",
  "Fake",
  "New",
]);

export const validationRunStateEnum = pgEnum("validation_run_state", [
  "queued",
  "discovering",
  "verifying",
  "reasoning",
  "scoring",
  "completed",
  "failed",
  "cancelled",
  "archived",
]);

export const stepStatusEnum = pgEnum("step_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "timeout",
]);

export const evidenceKindEnum = pgEnum("evidence_kind", [
  "institution_record",
  "contact_info",
  "affiliation_claim",
  "approval_claim",
  "website",
  "identity_corroboration",
  "check_unavailable",
  "conflicting_evidence",
]);

export const evidenceTierEnum = pgEnum("evidence_tier", [
  "mirror",
  "api",
  "live",
]);

export const sourceCodeEnum = pgEnum("evidence_source_code", [
  "UGC",
  "UGC_FAKE",
  "AICTE",
  "NMC",
  "PCI",
  "NCTE",
  "COA",
  "INC",
  "BCI",
  "INI",
  "AISHE",
  "NAAC",
  "NIRF",
  "CBSE",
  "CISCE",
  "NIOS",
  "NAD",
  "WIKIDATA",
  "WIKIPEDIA",
  "WEBSITE",
  "MANUAL",
]);

/**
 * Validation run.
 * One row per validation execution, with full provenance and reproducibility.
 * Pins policy_id, prompt_version, snapshot_ids, embedding_space, code_version
 * so a verdict from three months ago can be explained precisely.
 */
export const validationRuns = pgTable(
  "validation_runs",
  {
    id: serial('id').primaryKey(),
    institutionId: integer("institution_id").references(() => institutions.id),
    inputName: varchar("input_name", { length: 512 }).notNull(),
    inputUniversity: varchar("input_university", { length: 512 }),
    trigger: varchar("trigger", { length: 64 }).default("interactive"), // "interactive", "batch", "scheduled"
    state: validationRunStateEnum('state').notNull().default("queued"),
    verdict: verdictEnum('verdict'),
    confidence: real("confidence"),
    scoreBreakdown: jsonb("score_breakdown"), // { verdictBands: {...}, contributions: [...] }
    policyId: integer("policy_id"),
    promptVersion: varchar("prompt_version", { length: 32 }),
    snapshotIds: jsonb("snapshot_ids"), // Array of snapshot IDs used for evidence
    embeddingSpace: varchar("embedding_space", { length: 64 }), // "e5small_384"
    codeVersion: varchar("code_version", { length: 32 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    costUsd: real("cost_usd"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_14').on(table.institutionId),
    index('idx_15').on(table.state),
    index('idx_16').on(table.verdict),
    index('idx_17').on(table.institutionId, table.createdAt),
    index("idx_run_recent").on(table.institutionId, table.createdAt),
  ]
);

/**
 * Run step (append-only).
 * Detailed event log of each validation stage.
 * NEVER updated in place — insert only, marking results as succeeded/failed/skipped.
 * Combined with Inngest's durable step history, gives full replay without a separate event store.
 */
export const runSteps = pgTable(
  "run_steps",
  {
    id: serial('id').primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(), // Sequence number within the run
    name: varchar("name", { length: 128 }).notNull(), // "discovery", "verify_aicte", "score", etc
    status: stepStatusEnum('status').notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms"),
    cacheHit: integer("cache_hit").default(0), // 1 = true, 0 = false
    provider: varchar("provider", { length: 64 }), // "searxng", "aicte_api", "wikidata", etc
    attempt: integer("attempt").default(1),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_18').on(table.runId),
    index('idx_19').on(table.startedAt),
    index('idx_20').on(table.provider),
  ]
);

/**
 * Evidence from any source, tied to a validation run and institution.
 * Stores the raw findings (text, URLs, structured data) that inform the verdict.
 * Multiple evidence items per run, building the case for or against the verdict.
 */
export const evidence = pgTable(
  "evidence",
  {
    id: serial('id').primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    institutionId: integer("institution_id").references(() => institutions.id),
    kind: evidenceKindEnum('kind').notNull(),
    source: sourceCodeEnum('source').notNull(),
    tier: evidenceTierEnum('tier').notNull(),
    url: varchar("url", { length: 512 }),
    title: varchar("title", { length: 512 }),
    snippet: text("snippet"),
    extracted: jsonb("extracted"), // Parsed structured data (emails, phone, affiliation claim, etc)
    contentHash: varchar("content_hash", { length: 64 }),
    blobKey: varchar("blob_key", { length: 256 }), // Vercel Blob path for full content
    quality: real("quality"), // 0.0-1.0, how trustworthy this observation is
    weightApplied: real("weight_applied"), // Score contribution: quality × weight × freshness
    observedAt: timestamp("observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_21').on(table.runId),
    index('idx_22').on(table.institutionId),
    index('idx_23').on(table.kind),
    index('idx_24').on(table.source),
    index('idx_25').on(table.tier),
  ]
);

/**
 * LLM call tracking for cost attribution and quality monitoring.
 */
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: serial('id').primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 64 }).notNull(), // "discovery", "verification", "reasoning", "scoring"
    model: varchar("model", { length: 128 }).notNull(),
    promptHash: varchar("prompt_hash", { length: 64 }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    latencyMs: integer("latency_ms"),
    costUsd: real("cost_usd"),
    cacheHit: integer("cache_hit").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_26').on(table.runId),
    index('idx_27').on(table.stage),
  ]
);
