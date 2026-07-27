/**
 * Direct seed script using Drizzle insert API.
 * Populates authorities, scoring policies, embedding spaces, and feature flags.
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { getDbPooled } from "@/server/db/client";
import {
  authorities,
  scoringPolicies,
  featureFlags,
  embeddingSpaces,
} from "@/server/db/schema";

async function seed() {
  console.log("🌱 Starting database seed...");

  const db = getDbPooled();

  try {
    // 1. Seed authorities
    console.log("Seeding authorities...");
    const authorityRecords = [
      { authority_code: "UGC", display_name: "University Grants Commission", website: "https://ugc.ac.in" },
      { authority_code: "AICTE", display_name: "All India Council for Technical Education", website: "https://aicte-india.org" },
      { authority_code: "NMC", display_name: "National Medical Commission", website: "https://nmc.org.in" },
      { authority_code: "PCI", display_name: "Pharmacy Council of India", website: "https://pci.nic.in" },
      { authority_code: "NCTE", display_name: "National Council for Teacher Education", website: "https://ncte-india.org" },
      { authority_code: "COA", display_name: "Council of Architecture", website: "https://coa.gov.in" },
      { authority_code: "INC", display_name: "Indian Nursing Council", website: "https://indiannursingcouncil.in" },
      { authority_code: "BCI", display_name: "Bar Council of India", website: "https://barcouncilofindia.org" },
      { authority_code: "INI", display_name: "Institutes of National Importance", website: "https://ini.gov.in" },
      { authority_code: "AISHE", display_name: "All India Survey on Higher Education", website: "https://aishe.gov.in" },
      { authority_code: "NAAC", display_name: "National Assessment and Accreditation Council", website: "https://naac.gov.in" },
      { authority_code: "NIRF", display_name: "National Institutional Ranking Framework", website: "https://nirf.nic.in" },
      { authority_code: "CBSE", display_name: "Central Board of Secondary Education", website: "https://cbse.gov.in" },
      { authority_code: "CISCE", display_name: "Council for the Indian School Certificate", website: "https://cisce.org" },
      { authority_code: "NIOS", display_name: "National Institute of Open Schooling", website: "https://nios.ac.in" },
      { authority_code: "WIKIDATA", display_name: "Wikidata", website: "https://wikidata.org" },
      { authority_code: "WEBSITE", display_name: "Institution Website", website: "https://example.com" },
    ];

    for (const auth of authorityRecords) {
      await db.insert(authorities).values(auth as any).onConflictDoNothing();
    }
    console.log(`✓ Seeded ${authorityRecords.length} authorities`);

    // 2. Seed embedding spaces
    console.log("Seeding embedding spaces...");
    await db
      .insert(embeddingSpaces)
      .values({ model_name: "e5-small-384", dimensions: 384, is_active: true })
      .onConflictDoNothing();
    console.log("✓ Seeded embedding space");

    // 3. Seed feature flags
    console.log("Seeding feature flags...");
    const flags = [
      { key: "USE_GOOGLE_CSE", value: 0 },
      { key: "USE_BROWSER", value: 1 },
      { key: "USE_LLM_REASONING", value: 1 },
      { key: "USE_LIVE_AUTHORITIES", value: 1 },
      { key: "USE_VECTOR_SEARCH", value: 1 },
      { key: "USE_WIKIDATA", value: 1 },
      { key: "STRICT_ROBOTS", value: 1 },
      { key: "READ_ONLY_MODE", value: 0 },
    ];

    for (const flag of flags) {
      await db.insert(featureFlags).values(flag).onConflictDoNothing();
    }
    console.log(`✓ Seeded ${flags.length} feature flags`);

    // 4. Seed scoring policies
    console.log("Seeding scoring policies...");
    const policies = [
      { name: "engineering_policy", institution_type: "engineering_college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "medical_policy", institution_type: "medical_college", version: 1, weights: JSON.stringify({ source: 0.6, derived: 0.25, inferred: 0.15 }), is_active: true },
      { name: "pharmacy_policy", institution_type: "pharmacy_college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "nursing_policy", institution_type: "nursing_college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "law_policy", institution_type: "law_college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "university_policy", institution_type: "public_university", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "college_policy", institution_type: "college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "school_policy", institution_type: "school", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "architecture_policy", institution_type: "architecture_college", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
      { name: "teacher_ed_policy", institution_type: "teacher_training", version: 1, weights: JSON.stringify({ source: 0.5, derived: 0.3, inferred: 0.2 }), is_active: true },
    ];

    for (const policy of policies) {
      await db.insert(scoringPolicies).values(policy as any).onConflictDoNothing();
    }
    console.log(`✓ Seeded ${policies.length} scoring policies`);

    console.log("\n✅ Database seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
