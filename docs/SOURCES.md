# Registry Data Sources

This document describes the data sources, collection methods, and update cadence for each registry connector.

## Higher Education

### UGC - University Grants Commission

**Connectors:** `ugc-recognized`, `ugc-fake`

**Primary Source:** https://www.ugc.gov.in/
- Recognized universities: https://www.ugc.gov.in/universitydetails/university
- Fake institutions: https://www.ugc.gov.in/universitydetails/Fakeuniversity

**Method:** Web scraping (JavaScript-based portal)
- Requires browser rendering via Playwright/Puppeteer
- DataTables API integration
- Update cadence: Quarterly
- Data quality: Official government source

**Scope:**
- Central universities
- State universities
- Deemed universities
- Private universities with UGC recognition

---

### AICTE - All India Council for Technical Education

**Connector:** `aicte`

**Primary Source:** https://facilities.aicte-india.org/
- Approved institutions API: https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php

**Method:** PHP API with query parameters
- Parameters: method=fetchdata, year=2025-2026, program=1, level=1
- Update cadence: Annually (with mid-year updates)
- Data quality: Official regulatory source

**Scope:** Engineering, management, diploma, and polytechnic institutions

---

### AISHE - All India Survey on Higher Education

**Connector:** `aishe`

**Status:** ⚠️ **Needs Source Documentation**

**Expected Source:** https://aishe.gov.in/ (Ministry of Education)
- Annual census data on higher education institutions
- Potentially covers all recognized and unrecognized institutions

---

### INI - Institutes of National Importance

**Connector:** `ini`

**Primary Sources:**
- IITs, NITs, IIITs, AIIMS official websites
- IISc: https://www.iisc.ac.in/
- Parliamentary records for institutional acts

**Method:** Aggregation from official sources
**Scope:** IITs (23), NITs (31), IIITs (25), AIIMS (22), IISc, and other centrally-funded institutions
**Update cadence:** Annually (new institutions created via parliament)

---

### DigiLocker NAD

**Connector:** `digilocker`

**Primary Source:** https://digilocker.gov.in/
- National Academic Depository registry of verified degree-issuing institutions

**Method:** API access to degree-issuing institutions
**Update cadence:** Monthly
**Data quality:** Government verification via blockchain

---

## Professional Education

### NMC - National Medical Commission

**Connector:** `nmc`

**Primary Source:** https://nmc.org.in/
- Public register: https://nmc.org.in/public-register

**Method:** Browser rendering (JavaScript portal)
**Scope:** Medical colleges, dental colleges, AYUSH institutions
**Update cadence:** Monthly
**Data quality:** Official regulatory source (replaced MCI in 2020)

---

### PCI - Pharmacy Council of India

**Connector:** `pci`

**Primary Source:** https://pci.nic.in/
- Pharmacy institutions directory

**Method:** GET/POST search
**Scope:** B.Pharm and D.Pharm institutions
**Update cadence:** Quarterly

---

### NCTE - National Council for Teacher Education

**Connector:** `ncte`

**Primary Source:** https://ncte.gov.in/
- Accredited teacher training institutions

**Method:** GET search
**Scope:** Teacher training colleges and B.Ed/M.Ed institutions
**Update cadence:** Quarterly

---

### COA - Council of Architecture

**Connector:** `coa`

**Primary Source:** https://ecoa.in/
- Registered institutions directory

**Method:** Browser rendering
**Scope:** B.Arch and M.Arch institutions
**Update cadence:** Quarterly

---

### INC - Indian Nursing Council

**Connector:** `inc`

**Primary Source:** https://indiannursingcouncil.org/
- Nursing institutions directory

**Method:** GET/POST search
**Scope:** Nursing colleges and diploma programs
**Update cadence:** Quarterly

---

## Accreditation & Ranking

### NAAC - National Assessment and Accreditation Council

**Connector:** `naac`

**Status:** ⚠️ **Needs Source Documentation**

**Expected Source:** https://www.naac.gov.in/
- Accreditation database with grades and scores

---

### NIRF - National Institutional Ranking Framework

**Connector:** `nirf`

**Status:** ⚠️ **Needs Source Documentation**

**Expected Source:** https://www.nirfindia.org/
- Annual institutional rankings across multiple categories

---

### BCI - Bar Council of India

**Connector:** `bci`

**Status:** ⚠️ **Needs Source Documentation**

**Expected Source:** https://www.barcouncilofindia.org/
- Law college directory (access method to be determined)

---

## School Education

### CBSE - Central Board of Secondary Education

**Connector:** `cbse`

**Primary Source:** https://cbseresults.nic.in/
- School information portal

**Method:** Static/API access to school registry
**Scope:** CBSE-affiliated schools (Classes I-XII)
**Update cadence:** Quarterly
**Data quality:** Official board source

---

### CISCE - Council for the Indian School Certificate Examination

**Connector:** `cisce`

**Primary Source:** https://cisce.org/
- Affiliated schools directory

**Method:** Static/API access
**Scope:** ICSE/ISC affiliated schools
**Update cadence:** Quarterly
**Data quality:** Official board source

---

### NIOS - National Institute of Open Schooling

**Connector:** `nios`

**Primary Source:** https://nios.ac.in/
- Study center directory

**Method:** Static/API access
**Scope:** NIOS study centers (Classes X, XII equivalents)
**Update cadence:** Quarterly
**Data quality:** Official source

---

## Implementation Status

| Connector | Source | Method | Status |
|-----------|--------|--------|--------|
| ugc-recognized | UGC website | Browser + DataTables | ⚠️ Fixture |
| ugc-fake | UGC website | HTML scraping | ⚠️ Fixture |
| aicte | AICTE API | PHP API | ⚠️ Fixture |
| aishe | Ministry of Education | TBD | ❌ Needs source |
| nmc | NMC registry | Browser | ⚠️ Fixture |
| pci | PCI directory | Search API | ⚠️ Fixture |
| ncte | NCTE portal | Search | ⚠️ Fixture |
| coa | COA registry | Browser | ⚠️ Fixture |
| inc | INC directory | Search API | ⚠️ Fixture |
| bci | BCI website | TBD | ❌ Needs source |
| naac | NAAC database | TBD | ❌ Needs source |
| nirf | NIRF website | TBD | ❌ Needs source |
| cbse | CBSE portal | API/Static | ⚠️ Fixture |
| cisce | CISCE website | API/Static | ⚠️ Fixture |
| nios | NIOS website | API/Static | ⚠️ Fixture |
| ini | Multiple sources | Aggregation | ⚠️ Fixture |
| digilocker | DigiLocker API | REST API | ⚠️ Fixture |

---

## Notes

- **Fixture-based:** All connectors currently use JSON fixtures for testing/development
- **Browser rendering:** Some sources (UGC, NMC, COA) require JavaScript execution
- **Rate limiting:** All sources respect 500ms+ delays between requests
- **Update cadence:** Refers to source update frequency, not polling frequency
- **Partial implementation:** Fixtures work; real source integration pending

---

## Contributing

To complete source documentation or implement real fetching:

1. Research the official data source
2. Document the API/scraping method
3. Implement fetching logic in the connector
4. Update validation rules based on real data characteristics
5. Add comprehensive error handling

See individual connector files for implementation details.
