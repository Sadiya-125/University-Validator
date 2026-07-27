#!/usr/bin/env node

/**
 * Database cleanup script.
 * Removes all tables and types from the database.
 * WARNING: This will delete all data. Use with caution.
 */

import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";
import path from "path";
import fs from "fs";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(`❌ Error: .env.local file not found at ${envPath}`);
  process.exit(1);
}

dotenvConfig({ path: envPath });

async function cleanup() {
  const DATABASE_POOLED_URL =
    process.env.DATABASE_POOLED_URL || process.env.DATABASE_URL;

  if (!DATABASE_POOLED_URL) {
    console.error("DATABASE_POOLED_URL or DATABASE_URL not set");
    process.exit(1);
  }

  const sql = postgres(DATABASE_POOLED_URL);

  try {
    console.log("Cleaning up old schema...");

    // Drop all tables and types
    await sql.unsafe(`
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS metrics_hourly CASCADE;
      DROP TABLE IF EXISTS provider_health CASCADE;
      DROP TABLE IF EXISTS dead_letters CASCADE;
      DROP TABLE IF EXISTS batch_items CASCADE;
      DROP TABLE IF EXISTS batches CASCADE;
      DROP TABLE IF EXISTS feature_flags CASCADE;
      DROP TABLE IF EXISTS scoring_policies CASCADE;
      DROP TABLE IF EXISTS embedding_spaces CASCADE;
      DROP TABLE IF EXISTS llm_calls CASCADE;
      DROP TABLE IF EXISTS evidence CASCADE;
      DROP TABLE IF EXISTS run_steps CASCADE;
      DROP TABLE IF EXISTS validation_runs CASCADE;
      DROP TABLE IF EXISTS registry_entries CASCADE;
      DROP TABLE IF EXISTS registry_snapshots CASCADE;
      DROP TABLE IF EXISTS authorities CASCADE;
      DROP TABLE IF EXISTS institution_links CASCADE;
      DROP TABLE IF EXISTS institution_contacts CASCADE;
      DROP TABLE IF EXISTS institution_identities CASCADE;
      DROP TABLE IF EXISTS institutions CASCADE;

      DROP TYPE IF EXISTS provider_state CASCADE;
      DROP TYPE IF EXISTS batch_state CASCADE;
      DROP TYPE IF EXISTS snapshot_state CASCADE;
      DROP TYPE IF EXISTS source_code CASCADE;
      DROP TYPE IF EXISTS evidence_tier CASCADE;
      DROP TYPE IF EXISTS evidence_kind CASCADE;
      DROP TYPE IF EXISTS step_status CASCADE;
      DROP TYPE IF EXISTS validation_run_state CASCADE;
      DROP TYPE IF EXISTS link_platform CASCADE;
      DROP TYPE IF EXISTS contact_kind CASCADE;
      DROP TYPE IF EXISTS identity_source CASCADE;
      DROP TYPE IF EXISTS verdict CASCADE;
      DROP TYPE IF EXISTS institution_type CASCADE;
    `);

    console.log("Old schema cleaned up");
    await sql.end();
  } catch (error) {
    console.error(
      "Cleanup failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

cleanup();
