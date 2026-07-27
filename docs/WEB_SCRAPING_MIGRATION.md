# Registry Web Scraping Migration

## Overview

This document summarizes the migration from fixture-based testing to real web scraping for all 18 statutory authority connectors.

## Implementation Roadmap

### Phase 1: ✅ Foundation (Complete)

- [x] Base scraper class (`src/server/registry/scrapers/base.ts`)
- [x] Fixture utilities (`src/server/registry/connectors/fixture-utils.ts`)
- [x] Database schema and migrations
- [x] Registry pipeline (runner, validator, diff)
- [x] CLI scripts (init-db, cleanup-db, ingest)
- [x] Documentation

### Phase 2: 🔄 Priority Connectors (Recommended Next)

#### UGC (University Grants Commission)

**File**: `src/server/registry/scrapers/ugc-recognized.ts`

**Status**: ⏳ Needs Implementation

**Source**: https://www.ugc.gov.in/universitydetails/university

**Implementation Steps**:

1. Use Playwright to load JavaScript SPA
2. Iterate through category filters (Central, State, Deemed, Private)
3. Extract table data (Institution Name, City, State, Type)
4. Implement fuzzy name matching
5. Take screenshot of each matched result
6. Handle pagination and dynamic loading
7. Respect 500ms+ rate limiting

**Expected**: ~1,500 universities

```bash
npm run ingest -- --code=ugc-recognized
npm run ingest -- --code=ugc-recognized --dry-run
```

#### UGC Fake Universities

**File**: `src/server/registry/scrapers/ugc-fake.ts`

**Status**: ⏳ Needs Implementation

**Source**: https://www.ugc.gov.in/universitydetails/Fakeuniversity

**Implementation Steps**:

1. Fetch HTML page
2. Parse fake institutions table
3. Extract name, city, state
4. Mark all as "Fake"
5. No Playwright needed (static HTML)

**Expected**: ~50 fake entries

#### AICTE (All India Council for Technical Education)

**File**: `src/server/registry/scrapers/aicte.ts`

**Status**: ⏳ Needs Implementation

**Source**: https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php

**Implementation Steps**:

1. Fetch PHP API for each state (36 states/UTs)
2. Use ThreadPoolExecutor with 8 workers for parallel requests
3. Parse JSON response
4. Implement sophisticated matching algorithm:
   - Direct name match
   - Combined match (name + address/parent)
   - Cross-field distinctive word overlap
5. Location-aware re-scoring (boost if city mentioned, penalize if contradictory city)
6. Take Playwright screenshot if found
7. Cache results by state + year
8. Handle AngularJS form interactions

**Expected**: ~5,000+ approved institutions

**Reference**: See `University_Validation(20-07)/src/scrapers/aicte.py` for full matching algorithm

```bash
npm run ingest -- --code=aicte
npm run ingest -- --code=aicte --dry-run
```

### Phase 3: Medical & Professional Regulators

#### NMC (National Medical Commission)

**File**: `src/server/registry/scrapers/nmc.ts`

**Source**: https://nmc.org.in/public-register

**Expected**: ~2,000+ medical professionals/institutions

#### PCI (Pharmacy Council of India)

**File**: `src/server/registry/scrapers/pci.ts`

**Source**: https://pci.nic.in/

**Expected**: ~1,500+ pharmacy institutions

#### NCTE (National Council for Teacher Education)

**File**: `src/server/registry/scrapers/ncte.ts`

**Source**: https://ncte.gov.in/AccreditationStatus

**Expected**: ~1,000+ teacher training institutions

#### COA (Council of Architecture)

**File**: `src/server/registry/scrapers/coa.ts`

**Source**: https://ecoa.in/

**Expected**: ~500+ architecture schools

#### INC (Indian Nursing Council)

**File**: `src/server/registry/scrapers/inc.ts`

**Source**: https://indiannursingcouncil.org/

**Expected**: ~1,000+ nursing institutions

#### BCI (Bar Council of India)

**File**: `src/server/registry/scrapers/bci.ts`

**Source**: https://www.barcouncilofindia.org/

**Status**: ⚠️ **Needs Source Research**

### Phase 4: School Boards & Other Authorities

#### CBSE (Central Board of Secondary Education)

**File**: `src/server/registry/scrapers/cbse.ts`

**Source**: https://saras.cbse.gov.in/

**Status**: ❌ Unavailable - Return Unknown

**Reason**: Portal frequently unavailable, no name-based search, complex location filtering

#### CISCE (Council for Indian School Certificate Examination)

**File**: `src/server/registry/scrapers/cisce.ts`

**Source**: https://cisce.org/

**Status**: ⏳ Needs Investigation

#### NIOS (National Institute of Open Schooling)

**File**: `src/server/registry/scrapers/nios.ts`

**Source**: https://nios.ac.in/

**Status**: ⏳ Needs Investigation

#### DigiLocker NAD

**File**: `src/server/registry/scrapers/digilocker.ts`

**Source**: https://digilocker.gov.in/

**Status**: ⏳ Needs API Documentation

### Phase 5: Research & Investigate Sources

#### AISHE (All India Survey on Higher Education)

**Status**: ⚠️ **Needs Source URL**

Expected source: https://aishe.gov.in/ (Ministry of Education)

#### NAAC (National Assessment and Accreditation Council)

**Status**: ⚠️ **Needs Source URL**

Expected source: https://www.naac.gov.in/

#### NIRF (National Institutional Ranking Framework)

**Status**: ⚠️ **Needs Source URL**

Expected source: https://www.nirfindia.org/

## Test Commands Reference

### Database

```bash
npm run init-db       # Initialize database
npm run cleanup-db    # Clean all tables
```

### Ingestion

```bash
npm run ingest -- --code=ugc-recognized              # Full ingestion
npm run ingest -- --code=ugc-recognized --dry-run    # Dry-run
npm run ingest                                        # Show help
```

### Testing

```bash
npm test                                  # Run all tests
npm run test:registry                     # Test registry pipeline
npm run test:connector -- --code=aicte    # Test specific connector
npm run test:all -- --watch               # Watch mode
```

## Code Template for New Connectors

```typescript
/**
 * [Authority] Scraper
 *
 * Source: [URL]
 * Method: [API/Scraping/Lookup]
 * Scope: [What it covers]
 */

import { RegistryConnector, RawRow, EntryDraft, ValidationRules, FetchContext } from "../types";
import { BaseScraper } from "./base";

class MyAuthorityScraper extends BaseScraper {
  async fetchData(): Promise<RawRow[]> {
    const response = await this.fetchWithRetry("https://example.gov.in/api");
    return await response.json();
  }
}

export const myAuthority: RegistryConnector = {
  code: "my-authority",
  displayName: "My Authority",
  sector: ["higher-education"],
  cadence: "quarterly",

  async *fetch(ctx?: FetchContext) {
    const scraper = new MyAuthorityScraper();
    try {
      const data = await scraper.fetchData();
      for (const row of data) {
        await scraper.rateLimit();
        yield row;
      }
    } catch (error) {
      ctx?.logger?.error("Fetch failed", error as Error);
      throw error;
    }
  },

  parse(raw: RawRow): EntryDraft | null {
    if (!raw.name || typeof raw.name !== "string") return null;
    return {
      externalId: String(raw.externalId || raw.name),
      name: String(raw.name),
      city: raw.city ? String(raw.city) : undefined,
      state: raw.state ? String(raw.state) : undefined,
      rawData: raw,
    };
  },

  sourceUrls: ["https://example.gov.in/"],

  validation: {
    rowCountVariance: 0.2,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ["externalId", "name"],
  },
};
```

## Performance Targets

| Connector | Rows    | Target Time | Actual | Status |
| --------- | ------- | ----------- | ------ | ------ |
| INI       | 100     | <1s         | —      | ⏳     |
| AICTE     | 5,000   | 5-10min     | —      | ⏳     |
| UGC       | 1,500   | 5-10min     | —      | ⏳     |
| NMC       | 2,000   | 3-5min      | —      | ⏳     |
| NCTE      | 1,000   | 2-3min      | —      | ⏳     |
| Total     | ~15,000 | <1hr        | —      | ⏳     |

## Error Handling Strategy

Each connector implements:

```typescript
try {
  // Fetch from source
} catch (networkError) {
  // Retry with exponential backoff (3 attempts)
  // If all fail, throw with helpful message
  ctx?.logger?.error("Connection failed", networkError);
}
```

Database layer:

- If scraping fails: Snapshot marked as "failed"
- Previous snapshot stays "published"
- No partial data written

## Validation Gates

Each snapshot must pass:

```typescript
validation: {
  // Example for AICTE (±20% variance allowed)
  rowCountVariance: 0.2,

  // At least 95% of rows have required fields
  requiredColumnsThreshold: 0.95,

  // Less than 1% duplicate external IDs
  duplicateExternalIdThreshold: 0.01,

  // These specific fields must exist
  requiredColumns: ["externalId", "name"],
}
```

If validation fails:

- Snapshot state: "rejected"
- Error recorded in validation_report
- Previous snapshot remains published
- Manual investigation required

## Browser Automation (Playwright)

For JavaScript-rendered sites:

```typescript
const { page, browser, context } = await scraper.getPlaywrightPage();

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".data-table");

  // Extract data
  const data = await page.evaluate(() => {
    return document.querySelectorAll("tr").map((tr) => ({
      name: tr.cells[0].textContent,
      city: tr.cells[1].textContent,
    }));
  });

  // Take screenshot for verification
  const screenshot = await page.screenshot();
} finally {
  await browser.close();
}
```
