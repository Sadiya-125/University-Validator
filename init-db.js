#!/usr/bin/env node
/**
 * Database initialization script.
 * Loads .env.local, runs migrations, and seeds the database.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

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
    console.log("\n Running database migrations...");
    await runMigrations();

    // Run seed
    console.log("\n Seeding database...");
    await runSeed();

    console.log("\n Database initialization complete!");
    console.log("You can now run: npm run dev");
    process.exit(0);
  } catch (error) {
    console.error("\n Database initialization failed:", error.message);
    process.exit(1);
  }
}

async function runMigrations() {
  const postgres = require("postgres");
  const migrationPath = path.join(__dirname, "drizzle/0001_init.sql");

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
  const DATABASE_POOLED_URL = process.env.DATABASE_POOLED_URL || process.env.DATABASE_URL;

  return new Promise((resolve, reject) => {
    (async () => {
      const sql = postgres(DATABASE_POOLED_URL);
      try {
        console.log("Executing migration SQL...");
        await sql.unsafe(migrationSQL);
        await sql.end();
        console.log("Migrations completed");
        resolve();
      } catch (error) {
        reject(new Error(`Migration failed: ${error.message}`));
      }
    })();
  });
}

async function runSeed() {
  return new Promise((resolve, reject) => {
    try {
      execSync("npx tsx scripts/seed-direct.ts", {
        cwd: __dirname,
        env: process.env,
        stdio: "inherit",
      });
      console.log("Database seeded");
      resolve();
    } catch (error) {
      reject(new Error(`Seed failed: ${error.message}`));
    }
  });
}

main();
