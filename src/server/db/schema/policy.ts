/**
 * Policy and feature flag schema.
 * Runtime policies and feature flags live in the database,
 * cached in Redis 60s, env only as defaults.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  serial,
  varchar,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { institutionTypeEnum } from "./canonical";

/**
 * Scoring policies (versioned).
 * Each institution type has a versioned policy row.
 */
export const scoringPolicies = pgTable(
  "scoring_policies",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    institution_type: institutionTypeEnum("institution_type").notNull(),
    version: integer("version").notNull().default(1),
    weights: jsonb("weights").notNull(),
    description: text("description"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_25").on(table.institution_type, table.is_active),
    unique("unique_policy_name_version").on(table.name, table.version),
  ]
);

/**
 * Feature flags (runtime configuration).
 * Runtime values cached in Redis 60s, env only as defaults.
 */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    value: integer("value").notNull().default(0),
    description: text("description"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_26").on(table.key),
  ]
);
