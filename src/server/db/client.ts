/**
 * Database client factory.
 * Provides two database connections:
 * - `db`: @neondatabase/serverless HTTP driver for one-shot reads in route handlers
 * - `dbPooled`: postgres.js on DATABASE_POOLED_URL for transactions in Inngest steps
 *
 * Both use the same Drizzle schema, so query code is identical.
 * A non-Neon DATABASE_URL falls back to postgres.js for both.
 */

import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

type DbType = NeonHttpDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

let dbInstance: DbType | null = null;
let dbPooledInstance: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Get the HTTP-based database connection (Neon or postgres.js HTTP).
 * Used for one-shot reads in route handlers.
 */
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const env = getServerEnv();
  const databaseUrl = env.DATABASE_URL;

  // Check if it's a Neon URL (contains .neon.tech)
  if (databaseUrl.includes("neon.tech")) {
    // Use Neon HTTP client
    const sql = neon(databaseUrl);
    dbInstance = drizzleNeon(sql, { schema });
  } else {
    // Fall back to postgres.js for self-hosted PostgreSQL
    const client = postgres(databaseUrl);
    dbInstance = drizzlePostgres(client, { schema });
  }

  return dbInstance;
}

/**
 * Get the pooled database connection (postgres.js with connection pool).
 * Used for transactions in Inngest steps and background jobs.
 */
export function getDbPooled() {
  if (dbPooledInstance) {
    return dbPooledInstance;
  }

  const env = getServerEnv();
  const databasePooledUrl = env.DATABASE_POOLED_URL;

  // Always use postgres.js for pooled connections
  const client = postgres(databasePooledUrl);
  dbPooledInstance = drizzlePostgres(client, { schema });

  return dbPooledInstance;
}

// Export convenient aliases for imports
export const db = getDb();
export const dbPooled = getDbPooled();

// Re-export schema for convenience
export type * from "./schema";
export { schema };
