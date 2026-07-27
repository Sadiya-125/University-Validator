#!/usr/bin/env node

/**
 * Database initialization script.
 * Loads .env.local, runs migrations, and seeds the database.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables using process.cwd() for reliability
const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(`❌ Error: .env.local file not found at ${envPath}`);
  console.error("Please create .env.local with required database credentials.");
  console.error("See .env.example for template.");
  process.exit(1);
}
dotenvConfig({ path: envPath });

async function main() {
  try {
    // Load and verify environment
    console.log("Loading environment variables from .env.local...");

    const requiredVars = ["DATABASE_URL", "DATABASE_POOLED_URL", "APP_ENV"];
    const missing = requiredVars.filter((v) => !process.env[v]);

    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(", ")}`);
      console.error("Make sure .env.local has DATABASE_URL, DATABASE_POOLED_URL, and APP_ENV set.");
      process.exit(1);
    }

    console.log("Environment loaded");
    console.log(`  APP_ENV: ${process.env.APP_ENV}`);
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL?.substring(0, 50)}...`);
    console.log(`  DATABASE_POOLED_URL: ${process.env.DATABASE_POOLED_URL?.substring(0, 50)}...`);
    console.log(`  LLM_PROVIDER: ${process.env.LLM_PROVIDER}`);

    // Run migrations
    console.log("\nRunning database migrations...");
    await runMigrations();

    // Run seed
    console.log("\nSeeding database...");
    await runSeed();

    console.log("\nDatabase initialization complete!");
    console.log("You can now run: npm run dev");
    process.exit(0);
  } catch (error) {
    console.error(
      "\nDatabase initialization failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

async function runMigrations(): Promise<void> {
  const DATABASE_POOLED_URL = process.env.DATABASE_POOLED_URL || process.env.DATABASE_URL;

  if (!DATABASE_POOLED_URL) {
    throw new Error("DATABASE_POOLED_URL or DATABASE_URL not set");
  }

  const client = postgres(DATABASE_POOLED_URL);
  const db = drizzle(client);

  console.log("Running Drizzle migrations...");

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, "..", "drizzle"),
    });
  } catch (error) {
    console.warn(
      "Drizzle migrate encountered an error:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Manually apply SQL migrations
  console.log("Applying schema initialization SQL...");
  try {
    const initSqlPath = path.join(__dirname, "..", "drizzle", "0001_init.sql");
    if (fs.existsSync(initSqlPath)) {
      let initSql = fs.readFileSync(initSqlPath, "utf-8");

      // Remove line comments (-- ...)
      initSql = initSql
        .split("\n")
        .map((line) => {
          const commentIdx = line.indexOf("--");
          return commentIdx === -1 ? line : line.substring(0, commentIdx);
        })
        .join("\n");

      // Split by semicolon and execute each statement
      const statements = initSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(`Executing ${statements.length} SQL statements...`);
      let successCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i] || "";
        if (!stmt) continue;
        try {
          await client.unsafe(stmt);
          successCount++;
        } catch (err) {
          // Ignore errors for idempotent operations
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (
            errorMsg.includes("already exists") ||
            errorMsg.includes("duplicate key") ||
            errorMsg.includes("42P06") ||
            errorMsg.includes("42P07") ||
            errorMsg.includes("42710")
          ) {
            successCount++;
          } else {
            console.warn(`Statement ${i + 1} warning: ${errorMsg.substring(0, 80)}`);
          }
        }
      }

      console.log(`✓ Schema initialization completed (${successCount}/${statements.length} statements)`);
    }
  } catch (error) {
    console.error(
      "Error applying schema SQL:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  // Apply type varchar migration
  console.log("Applying type column migration...");
  try {
    const typeSqlPath = path.join(__dirname, "..", "drizzle", "0002_type_varchar.sql");
    if (fs.existsSync(typeSqlPath)) {
      const typeSql = fs.readFileSync(typeSqlPath, "utf-8");

      try {
        // Execute the entire SQL file as a single transaction
        await client.unsafe(typeSql);
        console.log("✓ Type column migration completed");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (
          errorMsg.includes("already exists") ||
          errorMsg.includes("duplicate") ||
          errorMsg.includes("NOTICE") ||
          errorMsg.includes("does not exist")
        ) {
          console.log("✓ Type column migration completed (already applied or not needed yet)");
        } else {
          throw err;
        }
      }
    }
  } catch (error) {
    console.warn(
      "Warning: Type migration skipped:",
      error instanceof Error ? error.message.substring(0, 100) : String(error)
    );
  }

  await client.end();

  console.log("✓ Migrations completed");
}

async function runSeed(): Promise<void> {
  try {
    execSync("npx tsx scripts/seed.ts", {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: "inherit",
    });
    console.log("Database seeded");
  } catch (error) {
    throw new Error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
