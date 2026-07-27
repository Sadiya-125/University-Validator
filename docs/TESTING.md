# Testing Guide - Quick Reference

**For comprehensive connector details, see [CONNECTOR_PROGRESS.md](CONNECTOR_PROGRESS.md)**

## Quick Start

```bash
# Setup database (destructive)
npm run cleanup-db
npm run init-db

# Test a single connector
npm run ingest -- --code=aicte --dry-run

# Run all tests
npm test
```

---

## Database Operations

### Initialize Database
```bash
npm run init-db
```
Sets up schema, enums, and seed data.

### Cleanup Database
```bash
npm run cleanup-db
```
⚠️ **WARNING:** Removes ALL data. Use only to start fresh.

---

## Testing Connectors

### Run All Tests
```bash
npm test
```

### Test Specific Connector
```bash
npm run test -- digilocker.test.ts
npm test -- --watch              # Watch mode
npm test -- --coverage           # Coverage report
```

### Ingestion Tests

**Dry-run (no database changes):**
```bash
npm run ingest -- --code=aicte --dry-run
npm run ingest -- --code=ini --dry-run
npm run ingest -- --code=pci --dry-run
```

**Full ingestion (saves to database):**
```bash
npm run ingest -- --code=aicte
npm run ingest -- --code=ugc-recognized
npm run ingest -- --code=aishe-colleges
```

---

## Test Results Interpretation

### Success (Published)
```
Status: published
Rows processed: 1500
Rows added: 1500
Rows removed: 0
```
✅ All rows ingested successfully.

### Validation Failure (Rejected)
```
Status: rejected
Rows processed: 300
Error: Row count variance exceeded: -80% (threshold: ±20%)
```
❌ Data quality issue detected. System prevented bad data.

### Update (Diff Detected)
```
Status: published
Rows processed: 1450
Rows added: 100
Rows removed: 50
Rows changed: 200
```
✅ Some institutions added, removed, or updated.

---

## Available Connectors

| Code | Name | Status | Method |
|------|------|--------|--------|
| `ugc-recognized` | UGC Recognized | ✅ | Scraping |
| `ugc-fake` | UGC Fake Institutions | ✅ | Scraping |
| `ugc-colleges` | UGC Colleges | ✅ | Scraping |
| `aicte` | AICTE Institutes | ✅ | Scraping |
| `aishe-universities` | AISHE Universities | ✅ | Scraping |
| `aishe-colleges` | AISHE Colleges | ✅ | Scraping |
| `nmc` | NMC Colleges (Archival) | ✅ | Scraping |
| `pci` | PCI Pharmacy | ✅ | Scraping |
| `ini` | INI (Institutes of National Importance) | ✅ | Scraping |
| `digilocker` | DigiLocker Verification | ✅ | Verification |

---

## Common Issues

### Database Connection Failed
```
Error: DATABASE_URL or DATABASE_POOLED_URL not set
```
**Fix:** Check `.env.local` has database URLs.

### Timeout During Scraping
```
Error: Fetch attempt 3 failed - all retries exceeded
```
**Fix:** Check network, verify website is accessible, try again.

### Validation Fails on First Run
```
Error: Row count variance: No previous snapshot
```
**Normal.** Run twice to test diff logic.

---

## Performance Expectations

| Connector | Rows | Speed |
|-----------|------|-------|
| INI | 173 | <1s |
| PCI | 1,500 | ~30s |
| NMC | 500 | ~20s |
| AISHE | 45,000+ | ~2min |
| AICTE | 15,000+ | ~3min |
| UGC | 40,000+ | ~5min |

---

## Debugging

**Enable debug logging:**
```bash
LOG_LEVEL=debug npm run ingest -- --code=aicte
```

**View connector details:**
- See [CONNECTOR_PROGRESS.md](CONNECTOR_PROGRESS.md) for implementation status
- See [WEB_SCRAPING_MIGRATION.md](WEB_SCRAPING_MIGRATION.md) for technical details

**Check specific connector:**
```bash
npm run ingest -- --code=aicte --dry-run 2>&1 | head -50
```

---

## CI/CD

```bash
npm run test:all        # Run all tests
npm run build           # Build project
npm run lint            # Lint code
```

---

For more details, see [CONNECTOR_PROGRESS.md](CONNECTOR_PROGRESS.md).
