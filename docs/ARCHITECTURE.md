# Registry Architecture - Master Plan Implementation

This document explains the correct separation of concerns based on the Master Plan.

## The Four Layers

```
Government Portal
        ↓
    SCRAPER (Downloads raw data)
        ↓
    RawRow (JSON from API)
        ↓
    CONNECTOR (Normalizes to EntryDraft)
        ↓
    EntryDraft (Normalized structure)
        ↓
    RUNNER (Orchestrates validation & storage)
        ↓
    registry_snapshots + registry_entries
        ↓
    Verification Mirror (Read-only lookup)
```

## 1. Scrapers

**Location**: `src/server/registry/scrapers/{authority}.ts`

**Responsibility**: Download raw data. Nothing else.

**Example: AICTE Scraper**

```typescript
/**
 * SCRAPER - Downloads raw data from AICTE API.
 * No parsing. No validation. No fixtures.
 * Returns AsyncIterable<RawRow> with raw API response.
 */
export async function* scrapeAICTE(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  for (const state of STATES) {
    const url = buildURL(state);
    const response = await scraper.fetchWithRetry(url);
    const data = await response.json();

    for (const row of data) {
      yield {
        aicteId: row[0],
        name: row[1],
        address: row[2],
        district: row[3],
        // ... all raw fields
        rawData: row,
      };
    }
  }
}
```

**What scrapers should NOT do:**
- ❌ Parse data
- ❌ Access database
- ❌ Validate records
- ❌ Use fixtures
- ❌ Know about EntryDraft or snapshots

**What scrapers CAN do:**
- ✅ Fetch via HTTP (BaseScraper.fetchWithRetry)
- ✅ Use Playwright (BaseScraper.getPlaywrightPage)
- ✅ Retry with backoff
- ✅ Rate limit
- ✅ Log errors

---

## 2. Connectors

**Location**: `src/server/registry/connectors/{authority}.ts`

**Responsibility**: Convert RawRow → EntryDraft. Only parsing logic.

**Example: AICTE Connector**

```typescript
/**
 * CONNECTOR - Normalizes raw AICTE rows to EntryDraft.
 * Only job: understand AICTE's data structure.
 */
export const aicte: RegistryConnector = {
  code: "aicte",
  displayName: "AICTE - Approved Technical Institutions",
  sector: ["engineering"],
  cadence: "annually",

  async *fetch(ctx?: FetchContext) {
    // Delegate to scraper
    yield* scrapeAICTE(ctx);
  },

  parse(raw: RawRow): EntryDraft | null {
    // Understand AICTE's row format: [ID, Name, Address, District, ...]
    if (!raw.name || typeof raw.name !== "string") {
      return null;
    }

    return {
      externalId: String(raw.aicteId),
      name: String(raw.name).trim(),
      city: raw.district ? String(raw.district).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      rawData: raw,
    };
  },

  validation: { /* rules */ },
  sourceUrls: [ /* ... */ ],
};
```

**The fetch() method:**
- Returns the scraper's AsyncIterable<RawRow>
- Is called by the Runner
- Should not do any parsing

**The parse() method:**
- Takes a RawRow
- Returns EntryDraft | null
- Handles type conversions and normalization
- Is called by the Runner for each raw row

**What connectors should NOT do:**
- ❌ Call fetch() directly
- ❌ Use fixtures in production code
- ❌ Access database
- ❌ Validate entire snapshots
- ❌ Capture screenshots (scraper's job)

**What connectors CAN do:**
- ✅ Understand the raw data structure
- ✅ Normalize field names and types
- ✅ Extract nested fields
- ✅ Compute derived fields
- ✅ Filter out invalid records

---

## 3. Fixtures (Test Only)

**Location**: `tests/fixtures/registry/{code}.json`

**Purpose**: Fake government data for tests ONLY.

**Usage in Tests:**
```typescript
// In test files ONLY
describe("AICTE Connector", () => {
  it("parses raw rows correctly", () => {
    const fixture = require("../../fixtures/registry/aicte.json");
    const connector = new AICTEConnector();

    for (const row of fixture) {
      const entry = connector.parse(row);
      expect(entry).toBeDefined();
    }
  });
});
```

**How fixtures fit the architecture:**
```
Test Environment:
  Fixture JSON
      ↓
  Connector.parse()
      ↓
  EntryDraft
      ↓
  Validation
      ↓
  Database

Production Environment:
  AICTE API
      ↓
  Scraper (HTTP request)
      ↓
  RawRow
      ↓
  Connector.parse()
      ↓
  EntryDraft
      ↓
  Validation
      ↓
  Database
```

**Critical Rule:**
- ❌ **NEVER use fixtures in connector fetch() code**
- ✅ **ONLY use fixtures in tests**

---

## 4. Registry Runner

**Location**: `src/server/registry/runner.ts` (Already implemented)

**Responsibility**: Orchestrate the entire pipeline.

```typescript
export async function ingestRegistry(
  connector: RegistryConnector,
  opts?: { dryRun?: boolean }
): Promise<IngestionResult> {
  // 1. Create snapshot (status: running)
  const snapshot = await createSnapshot(connector.code);

  // 2. Call connector.fetch() to get raw rows
  //    (which delegates to scraper)
  const entries: EntryDraft[] = [];
  for await (const raw of connector.fetch()) {
    // 3. Call connector.parse() to normalize
    const entry = connector.parse(raw);
    if (entry) {
      entries.push(entry);
    }
  }

  // 4. Deduplicate by externalId
  const deduplicated = deduplicateByExternalId(entries);

  // 5. Validate (status: validating)
  const validation = validateSnapshot(deduplicated, connector.validation);
  if (!validation.passed) {
    snapshot.state = "rejected";
    return snapshot;
  }

  // 6. Publish (status: published)
  //    Write entries to database
  await publishSnapshot(snapshot, deduplicated);

  // 7. Compute diff from previous snapshot
  const diff = await diffSnapshots(previousId, snapshot.id);

  return {
    ...snapshot,
    ...diff,
  };
}
```

The Runner:
- ✅ Calls scraper (via connector.fetch())
- ✅ Calls parser (via connector.parse())
- ✅ Validates
- ✅ Saves to database
- ✅ Computes diffs

---

## 5. Registry Snapshots

**Purpose**: Immutable record of data at a point in time.

**Database Schema:**
```sql
registry_snapshots (
  id: int,
  code: enum (UGC, AICTE, NMC, ...),
  state: enum (running, validating, published, rejected, failed),
  rowCount: int,
  publishedCount: int,
  validationReport: jsonb,
  errorMessage: text,
  startedAt: timestamp,
  completedAt: timestamp,
  validTo: timestamp
)

registry_entries (
  id: int,
  code: enum,
  snapshotId: int (FK),
  externalId: string,
  canonicalName: string,
  normalizedName: string,
  attributes: jsonb
)
```

**Workflow:**
```
Step 1: CREATE snapshot (state: running)
Step 2: STREAM entries into registry_entries
Step 3: VALIDATE snapshot (state: validating)
Step 4a: PASS → state: published, write to database
Step 4b: FAIL → state: rejected, don't write
Step 5: COMPUTE diff from previous published snapshot
```

---

## 6. Validation

**During Ingestion:**
Only validates the new snapshot against rules:
```typescript
validation: {
  rowCountVariance: 0.2,      // ±20% from previous
  requiredColumnsThreshold: 0.95,  // 95% completeness
  duplicateExternalIdThreshold: 0.01,  // <1% duplicates
  requiredColumns: ["name", "externalId"],
}
```

**During Lookup (Read Path):**
Uses the local mirror (registry_entries), NEVER hits live portals:
```
User Query: "VIT Vellore"
        ↓
  SELECT * FROM registry_entries WHERE normalizedName LIKE 'vit%'
        ↓
  Found in AICTE 2024-09-15 snapshot
        ↓
  Return evidence + score
```

---

## Complete AICTE Example

### Scraper: `src/server/registry/scrapers/aicte.ts`

```typescript
export async function* scrapeAICTE(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  for (const state of STATES) {
    const url = new URL("https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php");
    url.searchParams.set("method", "fetchdata");
    url.searchParams.set("year", "2026-2027");
    url.searchParams.set("state", state);
    url.searchParams.set("program", "1");
    url.searchParams.set("level", "1");
    url.searchParams.set("institutiontype", "1");
    url.searchParams.set("Women", "1");
    url.searchParams.set("Minority", "1");
    url.searchParams.set("course", "1");

    const response = await scraper.fetchWithRetry(url.toString());
    const data = await response.json();

    for (const row of data) {
      yield {
        aicteId: row[0],
        name: row[1],
        address: row[2],
        district: row[3],
        institutionType: row[4],
        women: row[5],
        minority: row[6],
        pid: row[7],
        state: state,
        rawData: row,
      };
    }

    await scraper.rateLimit();
  }
}
```

### Connector: `src/server/registry/connectors/aicte.ts`

```typescript
export const aicte: RegistryConnector = {
  code: "aicte",
  displayName: "AICTE - Approved Technical Institutions",
  sector: ["engineering"],
  cadence: "annually",

  async *fetch(ctx?: FetchContext) {
    yield* scrapeAICTE(ctx);  // Delegate to scraper
  },

  parse(raw: RawRow): EntryDraft | null {
    if (!raw.name || typeof raw.name !== "string") return null;

    return {
      externalId: String(raw.aicteId),
      name: String(raw.name).trim(),
      city: raw.district ? String(raw.district).trim() : undefined,
      state: raw.state ? String(raw.state).trim() : undefined,
      rawData: raw,
    };
  },

  validation: {
    rowCountVariance: 0.15,
    requiredColumnsThreshold: 0.95,
    duplicateExternalIdThreshold: 0.005,
    requiredColumns: ["name", "externalId", "state"],
  },

  sourceUrls: [
    "https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php",
  ],
};
```

### Test: `tests/aicte.test.ts`

```typescript
describe("AICTE", () => {
  it("parses raw rows correctly", () => {
    const fixture = require("../fixtures/registry/aicte.json");
    const connector = aicte;

    for (const raw of fixture) {
      const entry = connector.parse(raw);
      expect(entry).toBeDefined();
      expect(entry.externalId).toBeDefined();
      expect(entry.name).toBeDefined();
    }
  });

  it("ingests and publishes", async () => {
    const result = await ingestRegistry(aicte);
    expect(result.state).toBe("published");
    expect(result.rowCount).toBeGreaterThan(0);
  });
});
```

---

## Implementation Checklist

For each of the 18 connectors:

- [ ] **Scraper** (`src/server/registry/scrapers/{code}.ts`)
  - [ ] async function* scrape{Name}()
  - [ ] Fetches raw data (HTTP, Playwright, or static)
  - [ ] Yields RawRow objects
  - [ ] No parsing, no database, no fixtures

- [ ] **Connector** (`src/server/registry/connectors/{code}.ts`)
  - [ ] Exports RegistryConnector instance
  - [ ] fetch() delegates to scraper
  - [ ] parse() converts RawRow → EntryDraft
  - [ ] Defines validation rules
  - [ ] Lists source URLs

- [ ] **Tests** (`tests/{code}.test.ts`)
  - [ ] Tests parse() with fixture data
  - [ ] Tests full ingestion pipeline
  - [ ] Verifies validation gates

- [ ] **Fixture** (`tests/fixtures/registry/{code}.json`)
  - [ ] Sample raw rows from API
  - [ ] Used ONLY in tests, never in production code

---

## Key Rules

1. **Scraper = Download Only**
   - No parsing, no database, no validation

2. **Connector = Parse Only**
   - No downloading, no database, no validation

3. **Fixtures = Test Only**
   - Never used in production connector code
   - Only in test setup

4. **Runner = Orchestrate**
   - Calls scraper → connector → validator → database
   - Single source of truth for workflow

5. **No Cross-Layer Dependencies**
   - Scrapers don't import connectors
   - Connectors don't import scrapers directly (only call via fetch())
   - Neither imports Runner

---

## Common Mistakes to Avoid

❌ **Wrong:**
```typescript
export const aicte: RegistryConnector = {
  async *fetch() {
    yield* loadFixture('aicte.json');  // ❌ Fixtures in production!
  }
};
```

✅ **Correct:**
```typescript
export const aicte: RegistryConnector = {
  async *fetch() {
    yield* scrapeAICTE();  // ✅ Real scraper
  }
};
```

---

## File Structure

```
src/server/registry/
├── types.ts                    (Shared types)
├── runner.ts                   (Orchestrator)
├── diff.ts                     (Diff computation)
├── lookup.ts                   (Read path)
├── scrapers/
│   ├── base.ts                 (Base class)
│   ├── aicte.ts                (Scraper for AICTE)
│   ├── ugc.ts                  (Scraper for UGC)
│   └── ...                     (17 more scrapers)
└── connectors/
    ├── aicte.ts                (Connector for AICTE)
    ├── ugc.ts                  (Connector for UGC)
    ├── index.ts                (Registry of all connectors)
    └── ...                     (17 more connectors)

tests/
├── registry.test.ts            (Main test suite)
├── aicte.test.ts              (AICTE-specific tests)
└── fixtures/registry/
    ├── aicte.json             (Fixture data)
    └── ...                    (17 more fixtures)
```

---

## Testing Command Reference

```bash
# Initialize database
npm run init-db

# Test with REAL data (AICTE scraper)
npm run ingest -- --code=aicte --dry-run
npm run ingest -- --code=aicte

# Test all fixtures
npm run test:registry

# Watch mode
npm test -- --watch
```

---

This architecture ensures:
- ✅ Separation of concerns
- ✅ Testability (fixtures for tests, real data for production)
- ✅ Maintainability (understand each layer independently)
- ✅ Scalability (add new connectors without changing core logic)
