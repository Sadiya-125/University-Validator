/**
 * Search for an institution by name and return details
 * Usage: pnpm exec tsx scripts/search-institution.ts "Institution Name"
 */

import dotenv from "dotenv";
import { searchMany } from "@/server/search/factory";

// Load .env.local explicitly
dotenv.config({ path: ".env.local" });

async function searchInstitution(institutionName: string) {
  console.log("\n🔍 Institution Search\n");
  console.log(`📚 Searching for: "${institutionName}"\n`);

  try {
    // Perform search using the search factory (uses SearXNG, DuckDuckGo, Google CSE)
    console.log("⏳ Querying search providers...\n");

    const results = await searchMany(institutionName);

    if (!results || results.length === 0) {
      console.log("❌ No results found\n");
      process.exit(0);
    }

    console.log(`✅ Found ${results.length} results\n`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Display top 10 results
    results.slice(0, 10).forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   🔗 URL: ${result.url}`);
      if (result.domain) {
        console.log(`   🌐 Domain: ${result.domain}`);
      }
      if (result.description) {
        console.log(`   📝 Description: ${result.description}`);
      }
      console.log();
    });

    console.log("═══════════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    console.error("\n💡 Tips:");
    console.error("   1. Make sure .env.local is configured with search providers");
    console.error("   2. Check that SearXNG or DuckDuckGo is accessible");
    console.error("   3. For Google CSE, ensure USE_GOOGLE_CSE=true and API key is set\n");
    process.exit(1);
  }
}

// Get institution name from command line argument
const institutionName = process.argv[2] || "Indian Institute of Technology Bombay";

searchInstitution(institutionName);
