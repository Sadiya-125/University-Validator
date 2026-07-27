# Connector Implementation Progress

**Last Updated:** July 27, 2026
**Total Implemented Connectors:** 10
**Total Scrapers:** 9 (+ 1 verification module)

## Implementation Status Summary

| Code | Connector Name | Scraper | Source | Status | Data Quality |
|------|---|---|---|---|---|
| ugc-recognized | UGC Recognized Institutions | ✅ | https://www.ugcnet.ac.in | ✅ Implemented | High |
| ugc-fake | UGC Fake Institutions | ✅ | https://www.ugcnet.ac.in | ✅ Implemented | High |
| ugc-colleges | UGC Colleges | ✅ | https://www.ugcnet.ac.in | ✅ Implemented | High |
| aicte | AICTE Approved Institutes | ✅ | https://www.aicte-india.org | ✅ Implemented | High |
| aishe-universities | AISHE Universities | ✅ | https://dashboard.aishe.gov.in | ✅ Implemented | High |
| aishe-colleges | AISHE Colleges | ✅ | https://dashboard.aishe.gov.in | ✅ Implemented | High |
| nmc | NMC Colleges (Archival) | ✅ | https://www.nmc.org.in | ✅ Implemented | Medium |
| pci | PCI Pharmacy Institutions | ✅ | https://www.pci.nic.in | ✅ Implemented | High |
| ini | INI - Institutes of National Importance | ✅ | https://dashboard.aishe.gov.in | ✅ Implemented | High |
| digilocker | DigiLocker NAD Verification | ✅ | https://nad.digilocker.gov.in | ✅ Implemented | High |

---

## Detailed Connector Specifications

### 1. UGC Connectors (ugc-recognized, ugc-fake, ugc-colleges)

**Source:** https://www.ugcnet.ac.in
**Method:** Dynamic HTML table scraping
**Playwright:** Yes (JavaScript-heavy)

**Scraper:** [src/server/registry/scrapers/ugc-recognized.ts](../src/server/registry/scrapers/ugc-recognized.ts)
**Connector:** [src/server/registry/connectors/ugc-recognized.ts](../src/server/registry/connectors/ugc-recognized.ts)

**Data Fields:**
- Institution name
- State/UT
- District
- Affiliation (universities, boards)
- Estab. Year
- Website
- Email
- Phone
- Address

**Expected Rows:** 40,000+
**Scraping Method:** Playwright with pagination
**Rate Limiting:** 500ms between requests
**Timeout:** 30 seconds per page
**Cache:** None (live data)

**Implementation Details:**
- Three separate URLs for recognized, fake, and college institutions
- Each list contains similar columns but different data
- Handles state-wise categorization
- Captures affiliation URLs for verification

**Validation Rules:**
- Row count variance: ±25%
- Required columns: name, externalId
- Duplicate threshold: 2%

---

### 2. AICTE Connector

**Source:** https://www.aicte-india.org
**Method:** API-based scraping
**Playwright:** Yes (Single Page Application)

**Scraper:** [src/server/registry/scrapers/aicte.ts](../src/server/registry/scrapers/aicte.ts)
**Connector:** [src/server/registry/connectors/aicte.ts](../src/server/registry/connectors/aicte.ts)

**Data Fields:**
- Institution name
- State
- Course type (UG, PG, etc.)
- Intake
- Accreditation status
- Approval letter
- Approval year

**Expected Rows:** 15,000+
**Scraping Method:** Playwright navigation + API calls
**Concurrency:** 3 states in parallel
**Rate Limiting:** 500ms between requests
**Timeout:** 40 seconds per state
**Cache:** None

**Implementation Details:**
- Uses Playwright to navigate state filters
- Extracts data from dynamically loaded content
- Parallel processing of states (3 at a time) for efficiency
- Handles pagination within each state
- Retries with exponential backoff

**Validation Rules:**
- Row count variance: ±20%
- Required columns: name, externalId
- Duplicate threshold: 1%

---

### 3. AISHE Connectors (aishe-universities, aishe-colleges)

**Source:** https://dashboard.aishe.gov.in
**Method:** JavaScript SPA scraping with data tables
**Playwright:** Yes

**Scraper:** [src/server/registry/scrapers/aishe.ts](../src/server/registry/scrapers/aishe.ts)
**Connectors:**
- [src/server/registry/connectors/aishe.ts](../src/server/registry/connectors/aishe.ts)

**Data Fields:**
- AISHE Code (ID)
- Institution name
- State/UT
- District
- Affiliation status
- Establishment year
- Campus location
- Website URL

**Expected Rows:**
- Universities: 500+
- Colleges: 45,000+

**Scraping Method:** Playwright with DataTable pagination
**Page Length:** 1000 rows per page
**Rate Limiting:** 500ms between requests
**Timeout:** 30 seconds
**Cache:** None

**Implementation Details:**
- Two separate connectors (universities vs colleges)
- Dynamically sets page length to 1000 for efficiency
- Handles Bootstrap DataTable pagination
- Extracts all 7 data columns from table cells
- Validates minimum 3-character institution names

**Validation Rules:**
- Universities: Row variance ±15%, Required columns: 2/7
- Colleges: Row variance ±20%, Required columns: 2/7
- Duplicate threshold: 0.5%

---

### 4. NMC Connector

**Source:** https://www.nmc.org.in
**Method:** DataTable scraping
**Playwright:** Yes

**Scraper:** [src/server/registry/scrapers/nmc.ts](../src/server/registry/scrapers/nmc.ts)
**Connector:** [src/server/registry/connectors/nmc.ts](../src/server/registry/connectors/nmc.ts)

**Data Fields:**
- Sl.No (sequential)
- State
- College name
- Course name
- University
- Year of inception
- Intake (seats)
- Recognition status
- Remarks

**Expected Rows:** 500+
**Scraping Method:** Playwright with DataTable pagination
**Page Length:** 1000 rows
**Rate Limiting:** 500ms
**Timeout:** 30 seconds
**Cache:** None

**Implementation Details:**
- Archival data for NMC (National Medical Commission)
- Fixed page with DataTable widget
- Sets length dropdown to 1000 for all data in one fetch
- Extracts 9 columns from table rows
- All rows already paginated in one view

**Validation Rules:**
- Row count variance: ±10%
- Required columns: name, externalId
- Duplicate threshold: 0.5%

---

### 5. PCI Connector

**Source:** https://www.pci.nic.in
**Method:** Static HTML table scraping
**Playwright:** No (pure HTML)

**Scraper:** [src/server/registry/scrapers/pci.ts](../src/server/registry/scrapers/pci.ts)
**Connector:** [src/server/registry/connectors/pci.ts](../src/server/registry/connectors/pci.ts)

**URLs (8 total):**
1. Degree institutes
2. Diploma colleges
3. M.Pharm institutes
4. Diploma institutions (conduct only)
5. Degree institutes (conduct only)
6. PharmD programs
7. PharmD Post-Baccalaureate
8. Bridge courses

**Data Fields:**
- S.No
- PCI Code (institution identifier)
- State
- Institution name
- Approval info (approval year range)
- Examining authority

**Expected Rows:** 1,500+
**Scraping Method:** HTTP fetch + regex parsing
**Rate Limiting:** 500ms between URLs
**Timeout:** 30 seconds per URL
**Cache:** None

**Implementation Details:**
- 8 different approved URLs covering all pharmacy programs
- Handles two table formats (new format: PCI Code | State | Name, old format: Name | State)
- Format auto-detection based on second column (numeric = new format)
- Deduplicates by name + state
- ExternalId: `pci-{pciCode}` or `pci-{normalized-name}`

**Validation Rules:**
- Row count variance: ±20%
- Required columns: name, externalId
- Duplicate threshold: 1%

---

### 6. INI Connector (Institutes of National Importance)

**Source:** https://dashboard.aishe.gov.in
**Method:** Playwright with mat-table (Angular Material)
**Playwright:** Yes

**Scraper:** [src/server/registry/scrapers/ini.ts](../src/server/registry/scrapers/ini.ts)
**Connector:** [src/server/registry/connectors/ini.ts](../src/server/registry/connectors/ini.ts)

**Categories (13 total):**
- IIIT, IIM, IISc Education & Research
- IIT, ISI, National Institute of Design
- NIFT, NIT, SPA (School of Planning & Architecture)
- NIPER, INICU, AIIMS, Others

**Data Fields:**
- AISHE Code
- Name
- State
- District
- Web URL
- Year of Establishment
- Location (Rural/Urban)

**Expected Rows:** 173+
**Scraping Method:** Playwright + page.evaluate()
**Rate Limiting:** Per-page basis
**Timeout:** 30 seconds
**Cache:** None

**Implementation Details:**
- Scrapes all 13 INI category URLs from AISHE Dashboard
- Uses Angular Material mat-table cells extraction
- Deduplicates by name and state
- Captures full institution metadata
- Validation optimized for 173 expected INIs

**Validation Rules:**
- Row count variance: ±15%
- Required columns: name, externalId
- Duplicate threshold: 1%

---

### 7. DigiLocker Verification Module

**Source:** https://nad.digilocker.gov.in
**Method:** NAD registry scraping + name matching
**Playwright:** No (fetch API)

**Module:** [src/server/registry/verification/digilocker.ts](../src/server/registry/verification/digilocker.ts)
**Connector:** [src/server/registry/connectors/digilocker.ts](../src/server/registry/connectors/digilocker.ts)

**Purpose:** Verify if institutions are registered on DigiLocker (NAD)

**Data Fields:**
- Institution name
- State
- Document types supported

**Features:**
- Tab-based navigation (21 categories)
- Multiple years (2022-2026+)
- Multiple document types per institution
- Name matching with:
  - Abbreviation expansion (IIT → Indian Institute of Technology)
  - City aliases (Mumbai ↔ Bombay)
  - Stop word removal
  - Case-insensitive matching
  - Variant generation

**Cache:**
- TTL: 24 hours
- Fallback: Stale cache on network failure
- Indexed for fast lookup

**Result Fields:**
- `institution_name`: Queried name
- `is_available`: Boolean (present in NAD)
- `matched_name`: Official registered name
- `matched_state`: State from registry
- `document_types`: Array of supported document types

**Implementation Details:**
- Fetches NAD page once per 24 hours
- Builds variant index for O(1) matching
- Handles multi-row institutions (rowspan)
- Detects both table formats (State | Name | DocType vs Name | DocType)
- Batch checking support for multiple institutions

**Usage:**
```typescript
const result = await checkDigiLocker("MyUniversity");
const results = await batchCheckDigiLocker(["Uni1", "Uni2", "Uni3"]);
clearDigiLockerCache(); // Force refresh
```

---

## Removed Connectors (Fixture-based)

The following fixture-based connectors have been removed:
- ❌ BCI (Bar Council of India)
- ❌ CISCE (Indian School Cert. Exam Board)
- ❌ COA (Council of Architecture)
- ❌ INC (Indian Nursing Council)
- ❌ NAAC (Accreditation Board)
- ❌ NCTE (Teacher Education Council)
- ❌ NIOS (Open School Board)
- ❌ NIRF (Ranking Framework)

**Reason:** No active web scrapers implemented; fixture-utils.ts removed.

---

## Scraper Features Summary

### Common Features (All Scrapers)

1. **Rate Limiting**
   - Configurable delay between requests (default: 500ms)
   - Prevents server overload
   - Respects robots.txt (implicit)

2. **Retry Logic**
   - Up to 3 retry attempts
   - Exponential backoff (2^n seconds)
   - Handles 429 (Too Many Requests) and 5xx errors

3. **Timeout Handling**
   - Per-request: 30 seconds
   - Abortable via AbortController
   - Graceful failure with error logging

4. **Logging**
   - Debug: Detailed retry/parse info
   - Info: Progress milestones
   - Warn: Recoverable errors
   - Error: Critical failures

### Playwright-Based Scrapers

**Base Class:** [src/server/registry/scrapers/base.ts](../src/server/registry/scrapers/base.ts)

**Features:**
```typescript
getPlaywrightPage()         // Launch Chrome with proper setup
rateLimit()                 // Enforce request delays
fetchWithRetry()            // HTTP with retries
normalizeName()             // Text normalization
sleep()                     // Async sleep
```

**Configuration:**
- Headless mode: ✅
- Sandbox disabled: ✅ (for server environments)
- Ignore cert errors: ✅ (for dev)
- User-Agent: Mozilla 5.0 (spoofed)
- Viewport: 1280x720

### HTML Parsing

**Regex Patterns:**
- Table rows: `/<tr[^>]*>([\s\S]*?)<\/tr>/gi`
- Cells (td/th): `/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi`
- Data attributes: `/<td[^>]*data-v="([^"]*)"/`

**Entities Decoded:**
- `&nbsp;` → space
- `&amp;` → &
- `&lt;` → <
- `&gt;` → >
- `&quot;` → "

---

## Testing

**Test File:** [src/server/registry/verification/digilocker.test.ts](../src/server/registry/verification/digilocker.test.ts)

**Run Tests:**
```bash
npm test -- digilocker.test.ts
npm test -- --watch
npm test -- --coverage
```

**Command Documentation:** See [TESTING_GUIDE.md](TESTING_GUIDE.md)

---

## Database Integration

All connectors integrate with the registry system:

1. **Fetch:** Connector yields RawRow objects
2. **Parse:** Normalizes to EntryDraft
3. **Validate:** Checks against rules
4. **Store:** Saves to registry_snapshots and registry_entries
5. **Diff:** Computes changes vs. previous snapshot

**Tables:**
- `registry_snapshots`: Bulk ingestion records
- `registry_entries`: Individual institution records
- `authority_types`: Reference data

---

## Performance Metrics

| Connector | Data Quality | Speed | Coverage | Notes |
|-----------|---|---|---|---|
| UGC | High | Slow (full scrape) | 40,000+ | Comprehensive |
| AICTE | High | Medium (parallel) | 15,000+ | Parallel states |
| AISHE | High | Fast | 45,000+ | Pagination |
| NMC | Medium | Fast | 500+ | Archival |
| PCI | High | Fast | 1,500+ | Multi-format |
| INI | High | Medium | 173 | 13 categories |
| DigiLocker | High | Very Fast | Dynamic | Cached |

---

## Next Steps

1. **Testing:** Run `npm test` to verify all scrapers work
2. **Ingestion:** Use `npm run ingest -- --code=X` to test each connector
3. **Validation:** Check log output for validation passes/failures
4. **Monitoring:** Watch logs for performance bottlenecks
5. **Maintenance:** Keep source URLs updated if websites change

---

## Support & Troubleshooting

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for:
- Detailed test commands
- Common issues and solutions
- Performance benchmarks
- CI/CD setup

See [WEB_SCRAPING_MIGRATION.md](WEB_SCRAPING_MIGRATION.md) for:
- Technical implementation details
- JavaScript SPA handling
- Error recovery strategies
- Data validation approaches
