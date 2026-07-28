/**
 * Test DigiLocker verification for a specific institution
 * Usage: tsx scripts/test-digilocker.ts "Institution Name"
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { checkDigiLocker, clearDigiLockerCache } from '@/server/registry/verification/digilocker';
import { getLogger } from '@/server/observability/logger';

const logger = getLogger();

async function testDigiLocker() {
  const institutionName = process.argv[2] || 'Indian Institute of Technology Bombay';

  console.log(`\n📚 Checking DigiLocker for: "${institutionName}"\n`);

  try {
    clearDigiLockerCache(); // Ensure fresh fetch
    const result = await checkDigiLocker(institutionName, { logger });

    console.log('\n=== RESULT ===');
    console.log(`Status: ${result.is_available ? '✅ AVAILABLE on DigiLocker' : '❌ NOT AVAILABLE on DigiLocker'}`);

    if (result.is_available) {
      console.log(`\nMatched Institution: ${result.matched_name}`);
      if (result.matched_state) console.log(`State: ${result.matched_state}`);
      if (result.document_types && result.document_types.length > 0) {
        console.log(`Document Types: ${result.document_types.join(', ')}`);
      }
      if (result.available_years && result.available_years.length > 0) {
        console.log(`Available Years: ${result.available_years.join(', ')}`);
      }
      if (result.total_documents) {
        console.log(`Total Documents: ${result.total_documents}`);
      }

      if (result.year_data) {
        console.log('\n=== YEAR-BY-YEAR DATA ===');
        for (const docType in result.year_data) {
          console.log(`\n${docType}:`);
          const yearCounts = result.year_data[docType];
          for (const yearStr in yearCounts) {
            const year = parseInt(yearStr, 10);
            const count = yearCounts[year];
            console.log(`  ${year}: ${count}`);
          }
        }
      }
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testDigiLocker();
