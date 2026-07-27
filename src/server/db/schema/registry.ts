/**
 * Registry mirror schema.
 * Statutory registry data ingested into Postgres on a schedule.
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
  index,
} from "drizzle-orm/pg-core";

export const sourceCodeEnum = pgEnum("source_code", [
  "UGC",
  "UGC_FAKE",
  "AICTE",
  "AISHE",
  "NIRF",
  "NAAC",
  "NMC",
  "PCI",
  "NCTE",
  "COA",
  "INC",
  "BCI",
  "INI",
  "CBSE",
  "CISCE",
  "NIOS",
  "WIKIDATA",
  "NAD",
  "WEBSITE",
  "MANUAL",
]);

export const snapshotStateEnum = pgEnum("snapshot_state", [
  "running",
  "validating",
  "published",
  "rejected",
  "failed",
  "unchanged",
]);

/**
 * Authority metadata (17 statutory bodies).
 * Seeded once, updated manually if needed.
 */
export const authorities = pgTable(
  "authorities",
  {
    id: serial("id").primaryKey(),
    authority_code: sourceCodeEnum("authority_code").notNull().unique(),
    display_name: varchar("display_name", { length: 256 }).notNull(),
    description: text("description"),
    website: varchar("website", { length: 512 }),
    data_url: varchar("data_url", { length: 512 }),
    rank: integer("rank"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Registry snapshot.
 * Immutable, dated, published only after validation.
 */
export const registrySnapshots = pgTable(
  "registry_snapshots",
  {
    id: serial("id").primaryKey(),
    code: sourceCodeEnum("authority_code").notNull(), // Authority code (maps to authority_code column)
    state: snapshotStateEnum("state").notNull(),
    rowCount: integer("row_count").default(0), // Total rows in this snapshot
    publishedCount: integer("published_count").default(0), // Rows published
    validationReport: jsonb("validation_report"), // Validation results
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }), // When this snapshot expires
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_13").on(table.code),
  ]
);

/**
 * Registry entries (raw scraped records).
 */
export const registryEntries = pgTable(
  "registry_entries",
  {
    id: serial("id").primaryKey(),
    code: sourceCodeEnum("authority_code").notNull(),
    snapshotId: integer("snapshot_id").notNull().references(() => registrySnapshots.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 256 }).notNull(),
    canonicalName: varchar("canonical_name", { length: 512 }),
    normalizedName: varchar("normalized_name", { length: 512 }),
    type: varchar("type", { length: 64 }),
    status: varchar("status", { length: 50 }),
    attributes: jsonb("attributes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_14").on(table.code, table.snapshotId),
    index("idx_15").on(table.externalId),
  ]
);
