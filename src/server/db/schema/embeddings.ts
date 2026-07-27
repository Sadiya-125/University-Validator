/**
 * Embedding spaces schema.
 * pgvector requires a fixed dimension per column, so multiple models mean multiple tables.
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  varchar,
  serial,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Embedding space registry.
 * Each space gets its own table (vec_<model_name>) created by migration.
 * The application reads this table to route to the active table.
 */
export const embeddingSpaces = pgTable(
  "embedding_spaces",
  {
    id: serial("id").primaryKey(),
    model_name: varchar("model_name", { length: 128 }).notNull().unique(),
    dimensions: integer("dimensions").notNull(),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_34").on(table.is_active),
  ]
);
