#!/usr/bin/env node

/**
 * Registry ingestion CLI script
 *
 * Usage:
 *   npm run ingest -- --code=aicte [--dry-run]
 *
 * Options:
 *   --code=<CODE>  Connector code (e.g., aicte, ugc-recognized, ini, etc.)
 *   --dry-run      Run validation without publishing to database
 */

import { config } from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables FIRST, before any other imports
const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(`❌ Error: .env.local file not found at ${envPath}`);
  console.error("");
  console.error("Please create a .env.local file with the required environment variables.");
  console.error("See .env.example for all required variables.");
  process.exit(1);
}

config({ path: envPath });

// Use dynamic imports to ensure environment is loaded first
async function start() {
  const { ingestRegistry } = await import("../src/server/registry/runner");
  const { getConnector, listConnectors } = await import("../src/server/registry/connectors");
  const { getLogger } = await import("../src/server/observability/logger");

  const logger = getLogger();

  async function main() {
    const args = process.argv.slice(2);
    const codeArg = args.find(arg => arg.startsWith("--code="));
    const isDryRun = args.includes("--dry-run");

    if (!codeArg) {
      logger.info("Registry Ingestion CLI");
      logger.info("");
      logger.info("Usage: pnpm ingest --code=<CODE> [--dry-run]");
      logger.info("");
      logger.info("Available connectors:");
      const connectorList = listConnectors();
      connectorList.forEach(conn => {
        logger.info(`  ${conn.code.padEnd(20)} - ${conn.displayName}`);
      });
      logger.info("");
      logger.info("Examples:");
      logger.info("  pnpm ingest --code=aicte");
      logger.info("  pnpm ingest --code=ugc-recognized --dry-run");
      process.exit(0);
    }

    const code = codeArg!.split("=")[1]!.toLowerCase();

    try {
      const connector = getConnector(code);

      logger.info(`Ingesting from ${connector.displayName}...`);
      if (isDryRun) {
        logger.warn("Running in DRY-RUN mode - results will not be saved");
      }

      const result = await ingestRegistry(connector, isDryRun ? { dryRun: true } : undefined);

      logger.info("");
      logger.info("Ingestion completed:");
      logger.info(`  Status: ${result.state}`);
      logger.info(`  Rows processed: ${result.rowCount}`);

      if (result.added !== undefined) {
        logger.info(`  Rows added: ${result.added}`);
      }
      if (result.removed !== undefined) {
        logger.info(`  Rows removed: ${result.removed}`);
      }
      if (result.changed !== undefined) {
        logger.info(`  Rows changed: ${result.changed}`);
      }

      if (result.state === "rejected" || result.state === "failed") {
        if (result.error) {
          logger.error(`  Error: ${result.error}`);
        }
        if (result.validationReport) {
          logger.error(`  Validation: ${result.validationReport.summary}`);
        }
        process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      logger.error(`Failed to ingest: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  return main();
}

start().catch(error => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
