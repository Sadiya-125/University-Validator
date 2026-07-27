# Registry Connector Implementation Guide

This guide explains how to implement web scraping for all 18 statutory authority connectors, replacing the fixture-based approach.

## Architecture

### Base Scraper Class

All connectors extend `BaseScraper` (src/server/registry/scrapers/base.ts) which provides:

- **HTTP Session Management**: Automatic retries (exponential backoff), rate limiting
- **Playwright Integration**: Browser automation for JavaScript-rendered pages
- **HTML Parsing**: Cheerio for DOM manipulation
- **Error Handling**: Structured logging and error tracking

### Implementation Patterns

There are three main patterns used by the legacy implementation:

#### Pattern 1: Known Database (Lookup-Based)

Used for: **INI** (Institutes of National Importance)

These institutions are established by Acts of Parliament and don't change frequently.

```typescript
export const ini: RegistryConnector = {
  async *fetch(ctx?: FetchContext) {
    for (const [pattern, name, state] of INI_DATABASE) {
      yield { externalId, name, state };
    }
  },

  parse(raw: RawRow) {
    return { externalId: raw.externalId, name: raw.name, state: raw.state };
  }
};
```

#### Pattern 2: API-Based Search

Used for: **AICTE**, **UGC**, **NMC**, **PCI**, **NCTE**, **COA**, **INC**, **BCI**

These authorities provide REST/PHP APIs or JavaScript-based portals.

```typescript
export const aicte: RegistryConnector = {
  async *fetch(ctx?: FetchContext) {
    for (const state of STATES) {
      const data = await fetchStateData(state);
      for (const record of data) {
        yield record; // Raw API response
      }
    }
  },

  parse(raw: RawRow) {
    return normalizeRecord(raw);
  }
};
```

**Key Considerations:**
- Use parallel requests for multiple states (8-16 workers)
- Cache state-level data to avoid redundant API calls
- Implement fuzzy matching for institution names
- Capture screenshots as proof of verification
- Handle AngularJS forms with JavaScript evaluation
- Respect rate limits (500ms+ between requests)

#### Pattern 3: Unavailable/Fallback

Used for: **CBSE**, **CISCE**, **NIOS**, **AISHE**, **NAAC**, **NIRF**

These portals are frequently unavailable or don't support name-based search.

```typescript
export const cbse: RegistryConnector = {
  async *fetch(ctx?: FetchContext) {
    // Return empty or static data
  },

  parse(raw: RawRow) {
    return null; // Or minimal data
  }
};
```

## Implementation Checklist

### 1. UGC Recognized Universities

**File**: `src/server/registry/scrapers/ugc-recognized.ts`

- [ ] Fetch from: https://www.ugc.gov.in/universitydetails/university
- [ ] Use Playwright for JavaScript rendering
- [ ] Handle category filters
- [ ] Parse institution name, city, state from table
- [ ] Implement fuzzy name matching
- [ ] Capture screenshots
- [ ] Cache results by state/category

**Expected Fields**:
```typescript
{
  externalId: string;
  name: string;
  city?: string;
  state?: string;
  type?: "Central" | "State" | "Deemed" | "Private";
  website?: string;
}
```

### 2. UGC Fake Universities

**File**: `src/server/registry/scrapers/ugc-fake.ts`

- [ ] Fetch from: https://www.ugc.gov.in/universitydetails/Fakeuniversity
- [ ] Parse HTML table of fake institutions
- [ ] Extract name, city, state
- [ ] Mark all as "Fake"

### 3. AICTE

**File**: `src/server/registry/scrapers/aicte.ts`

- [ ] Fetch from: https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php
- [ ] Query by state (all 36 states/UTs in parallel)
- [ ] Parse JSON response
- [ ] Match search name against result
- [ ] Implement location-aware re-scoring
- [ ] Handle AngularJS forms for screenshots
- [ ] Cache by state + year

### 4. AISHE

**File**: `src/server/registry/scrapers/aishe.ts`

**Status**: ⚠️ Source URL unknown

- [ ] Research Ministry of Education portal
- [ ] Once source found, implement CSV/JSON download parser
- [ ] Return Unknown until source confirmed

### 5. NMC (National Medical Commission)

**File**: `src/server/registry/scrapers/nmc.ts`

- [ ] Fetch from: https://nmc.org.in/public-register
- [ ] Use Playwright (JavaScript portal)
- [ ] Handle pagination
- [ ] Parse medical college data
- [ ] Filter by institution type (medical, dental, AYUSH)

### 6. PCI (Pharmacy Council)

**File**: `src/server/registry/scrapers/pci.ts`

- [ ] Fetch from: https://pci.nic.in/
- [ ] Implement search functionality
- [ ] Parse pharmacy college data
- [ ] Extract B.Pharm and D.Pharm institutions

### 7. NCTE (Teacher Education)

**File**: `src/server/registry/scrapers/ncte.ts`

- [ ] Fetch from: https://ncte.gov.in/AccreditationStatus
- [ ] Parse accredited institutions table
- [ ] Extract B.Ed/M.Ed institutions

### 8. COA (Council of Architecture)

**File**: `src/server/registry/scrapers/coa.ts`

- [ ] Fetch from: https://ecoa.in/
- [ ] Use Playwright for dynamic portal
- [ ] Parse architecture school directory
- [ ] Extract B.Arch and M.Arch institutions

### 9. INC (Indian Nursing Council)

**File**: `src/server/registry/scrapers/inc.ts`

- [ ] Fetch from: https://indiannursingcouncil.org/
- [ ] Parse nursing college directory
- [ ] Extract BSc Nursing and Diploma institutions

### 10. BCI (Bar Council of India)

**File**: `src/server/registry/scrapers/bci.ts`

**Status**: ⚠️ Source URL unknown

- [ ] Research BCI website for law college directory
- [ ] Return Unknown until source confirmed

### 11. NAAC (Accreditation Council)

**File**: `src/server/registry/scrapers/naac.ts`

**Status**: ⚠️ Source URL unknown

- [ ] Research NAAC accreditation database access
- [ ] Return Unknown until source confirmed

### 12. NIRF (Ranking Framework)

**File**: `src/server/registry/scrapers/nirf.ts`

**Status**: ⚠️ Source URL unknown

- [ ] Research NIRF ranking publication source
- [ ] Return Unknown until source confirmed

### 13-18. School Boards and DigiLocker

**Files**:
- `src/server/registry/scrapers/cbse.ts`
- `src/server/registry/scrapers/cisce.ts`
- `src/server/registry/scrapers/nios.ts`
- `src/server/registry/scrapers/digilocker.ts`

For now, return Unknown - these require complex portal interactions or have limited APIs.

## Testing Commands

### Test Individual Connector

```bash
# Create test fixture (optional)
npm run test:connector -- --code=aicte

# Test with fixture
npm run test:connector:fixture -- --code=aicte

# Test with live scraping (requires working scraper implementation)
npm run test:connector:live -- --code=aicte
```

### Run All Tests

```bash
npm test -- src/registry.test.ts
```

### Dry-Run Ingestion

```bash
npm run ingest -- --code=aicte --dry-run
```

### Full Ingestion Pipeline

```bash
# Clean up old data
npm run cleanup-db

# Initialize fresh database
npm run init-db

# Test each connector
npm run ingest -- --code=ugc-recognized
npm run ingest -- --code=aicte
# ... etc
```

## Implementation Steps

### Phase 1: Core Infrastructure (✓ Done)
- [x] Base scraper class with Playwright, HTTP, parsing
- [x] Fixture-based connectors (baseline)
- [x] Database schema and migrations
- [x] Registry runner and validation pipeline

### Phase 2: Known-List Connectors (Recommended Next)
- [ ] INI (Institutes of National Importance)
- [ ] UGC Fake Universities (static HTML parsing)

### Phase 3: API-Based Connectors
- [ ] AICTE (PHP API)
- [ ] NMC (JavaScript portal)
- [ ] PCI (Search API)
- [ ] NCTE (HTML scraping)
- [ ] COA (JavaScript portal)
- [ ] INC (Search API)

### Phase 4: Fallback Connectors
- [ ] CBSE (return Unknown)
- [ ] CISCE (return Unknown)
- [ ] NIOS (return Unknown)
- [ ] DigiLocker (return Unknown)

### Phase 5: Research & Document
- [ ] Investigate AISHE, BCI, NAAC, NIRF sources
- [ ] Document APIs and access methods
- [ ] Implement once sources confirmed

## Code Example: Simple Scraper

```typescript
import { RegistryConnector, RawRow, EntryDraft, ValidationRules } from "../types";
import { BaseScraper } from "./base";

export const myAuthority: RegistryConnector = {
  code: "my-authority",
  displayName: "My Authority",
  sector: ["higher-education"],
  cadence: "quarterly",

  async *fetch(ctx) {
    const scraper = new BaseScraper();

    try {
      // Fetch data from API
      const response = await scraper.fetchWithRetry(
        "https://example.gov.in/api/institutions"
      );
      const data = await response.json();

      // Yield each record as RawRow
      for (const record of data) {
        await scraper.rateLimit();
        yield {
          externalId: record.id,
          name: record.institutionName,
          city: record.city,
          state: record.state,
          website: record.website,
          rawData: record,
        };
      }
    } catch (error) {
      ctx?.logger?.error("Fetch failed", error as Error);
      throw error;
    }
  },

  parse(raw: RawRow): EntryDraft | null {
    if (!raw.name || typeof raw.name !== "string") {
      return null;
    }

    return {
      externalId: String(raw.externalId),
      name: String(raw.name),
      city: raw.city ? String(raw.city) : undefined,
      state: raw.state ? String(raw.state) : undefined,
      website: raw.website ? String(raw.website) : undefined,
      rawData: raw,
    };
  },

  sourceUrls: ["https://example.gov.in/api/institutions"],

  validation: {
    rowCountVariance: 0.2,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.01,
    requiredColumns: ["externalId", "name"],
  },
};
```

## Deployment Checklist

- [ ] All 18 connectors implemented
- [ ] Live scraping tested for each
- [ ] Database migrations run successfully
- [ ] All fixtures deleted from repository
- [ ] Tests passing (>95% pass rate)
- [ ] Rate limiting verified (500ms+ between requests)
- [ ] Error handling tested (network failures, timeouts, etc.)
- [ ] Screenshot capture working (where applicable)
- [ ] Performance acceptable (<5 minutes per authority)
- [ ] Logging comprehensive and helpful

## References

- **Legacy Python Implementation**: `d:\University Validation\University_Validation(20-07)\src\scrapers\`
- **Playwright Documentation**: https://playwright.dev/
- **Base Scraper**: `src/server/registry/scrapers/base.ts`
- **Types**: `src/server/registry/types.ts`
- **Runner**: `src/server/registry/runner.ts`
