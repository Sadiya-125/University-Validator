/**
 * Drizzle ORM configuration.
 * Configures schema location, migrations, and database driver.
 */

import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load .env.local directly for drizzle-kit
config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required in .env.local");
}

export default defineConfig({
  schema: "./src/server/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  migrations: {
    table: "__drizzle_migrations__",
    schema: "public",
  },
  verbose: true,
  strict: true,
});
