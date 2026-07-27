# Legacy Implementation Notes

Extracted from `University_Validation(20-07)` — a working Python/LangGraph implementation of university validation. This document captures technical requirements only; no code architecture was ported.

---

## 1. Statutory Bodies Supported

The legacy implementation supports 16 Indian statutory authorities:

| Authority | Abbreviation | Governs | Scraper File |
|-----------|--------------|---------|--------------|
| University Grants Commission | UGC | All higher education + maintains fake list | `src/scrapers/ugc.py` |
| AICTE | AICTE | Engineering, technology, management approval | `src/scrapers/aicte.py` |
| National Medical Commission | NMC | Medical education recognition | `src/scrapers/nmc_enhanced.py` |
| National Council for Teacher Education | NCTE | Teacher education recognition | `src/scrapers/ncte_enhanced.py` |
| Pharmacy Council of India | PCI | Pharmacy education recognition | `src/scrapers/pci_enhanced.py` |
| Council of Architecture | COA | Architecture/planning education recognition | `src/scrapers/coa_enhanced.py` |
| Indian Nursing Council | INC | Nursing education recognition | `src/scrapers/inc_enhanced.py` |
| Institutes of National Importance | INI | IIT, NIT, IIIT, AIIMS, etc. (Parliament-created) | `src/scrapers/ini.py` |
| Central Board of Secondary Education | CBSE | School-level examination board | `src/scrapers/cbse.py` |
| Indian School Certificate Examination | CISCE | School-level examination board (ICSE) | `src/scrapers/cisce.py` |
| National Institute of Open Schooling | NIOS | Open/distance schooling | `src/scrapers/nios.py` |
| World Higher Education Directory | WHED | International institution verification | `src/scrapers/whed.py` |

**INI Detection:** The scraper detects Institutes of National Importance by checking for keywords: IIT, NIT, IIIT, AIIMS, IISc, IISER, JIPMER, PGIMER, IIST, IIFT, and other Parliament-created bodies. No UGC check is performed for these bodies.

**School-Level Detection:** CBSE, CISCE, NIOS are detected separately; K-12 institutions are excluded from UGC checks.

---

## 2. Scraper API Specifications

Each scraper implements a common interface (`ScrapingResult` dataclass) but uses different backend APIs.

### 2.1 AICTE Scraper

**Statutory Body:** All India Council for Technical Education
**Scope:** Approved engineering, technology, management institutions

**API Endpoint:**
```
https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php
```

**HTTP Method:** GET (PHP backend API)

**Query Parameters:**
```python
{
    'method': 'fetchdata',
    'year': '2025-2026',         # Current academic year
    'program': '1',              # Engineering
    'level': '1',                # UG/PG
    'institutiontype': '1',      # All types
    'Women': '1',                # Include women's institutions
    'Minority': '1',             # Include minority institutions
    'state': '<state_name>',     # Dynamic: inferred from city/name
}
```

**Pagination:** None — data is cached by state; all results returned at once.

**JavaScript Required:** YES (AngularJS SPA)
- Frontend: `https://facilities.aicte-india.org/dashboard/pages/angulardashboard.php#!/approved`
- The public search page uses AngularJS DataTables
- State dropdown populated via ng-model binding
- Search results filtered via DataTable filtering

**Response Shape:** JSON array of institution records
```python
[
    [
        "1-46222853801",                    # ID
        "UNIVERSITY COLLEGE OF ENGINEERING",  # Name
        "OSMANIA UNIVERSITY HYDERABAD",     # Parent/affiliation
        "HYDERABAD",                         # City
        "State Government University",       # Type
        ...
    ]
]
```

**State Inference:** The scraper infers state from:
1. City keywords in institution name (e.g., "Hyderabad" → Telangana)
2. Misspelling correction map (e.g., "Hyderbad" → "Hyderabad")
3. Institution-name-to-state map (e.g., "Osmania" → Telangana, "BITS" → Rajasthan)

**Screenshot Proof:** After API match, Playwright captures proof screenshot from AICTE dashboard with state pre-selected and search results visible.

---

### 2.2 UGC Scraper

**Statutory Body:** University Grants Commission
**Scope:** All higher education institutions + fake university list

**Three-Step Verification Approach:**

#### Step 1: Fake List Check
```
URL: https://www.ugc.gov.in/universitydetails/Fakeuniversity
Method: GET (static HTML)
Matching: Substring-based with word-count guards
```

#### Step 2: Genuine List (HEI Search)
```
URL: https://www.ugc.gov.in/universitydetails/university?type=MuOh4z0uqRaY2k8Ag10I0g==
Method: GET (DataTables SPA)
JavaScript: YES
Interaction: Fills institution name search input; waits for DataTable update
```

#### Step 3: Category Pages (Fallback)
```
Category-specific URLs:
- Central: ?type=ddmCMsxJZgXH2S/m0uMOKQ==
- State: ?type=LZ1FUMk6U2JWGNLvhWfVSA==
- Deemed: ?type=UCL6fMspL2LJS89kv++N3A==
- Private: ?type=0wBmFB1Rb4JGVzq9UP/iOg==
```

**Classification Logic:**
```
if found_on_fake_list and found_on_genuine_list:
    category = "Genuine"  # Fake list has false positives
elif found_on_genuine_list:
    category = "Genuine"
elif found_on_category_pages:
    category = "Genuine"
elif found_only_on_fake_list:
    category = "Fake"
else:
    category = "Unknown"  # or "New"
```

**JavaScript Required:** YES (DataTables / Elasticsearch-backed SPA)

**Response Shape:** HTML table rows with institution data
- Institution name, state, category (central/deemed/private/state)
- Links to individual institution pages

---

### 2.3 NMC, NCTE, PCI, COA, INC Scrapers

These five scrapers follow a similar pattern (enhanced versions prefixed with `_enhanced.py`):

**General Pattern:**
- Search via the authority's official website/registry
- Some use HTML forms (POST), others use URL query parameters (GET)
- Many require Playwright/JavaScript rendering
- Return institution name, registration number, status, and affiliation

**NMC (National Medical Commission):**
- Registry URL: Variable (nmc.org.in subdomain)
- Method: GET + Playwright
- Parameters: Searches practitioner/institution name

**NCTE (Teacher Education Council):**
- Registry URL: ncte.gov.in
- Method: GET + search parameter
- May require JavaScript for dynamic loading

**PCI (Pharmacy Council of India):**
- Registry URL: pci.nic.in
- Method: GET/POST
- Parameters: Institution name, registration number search

**COA (Council of Architecture):**
- Registry URL: ecoa.in
- Method: GET + Playwright
- Parameters: Institution/program name search
- Note: Uses radio button selection for program type

**INC (Indian Nursing Council):**
- Registry URL: indiannursingcouncil.org
- Method: GET/POST
- Parameters: Institution name search

---

### 2.4 INI, CBSE, CISCE, NIOS, WHED Scrapers

**INI (Institutes of National Importance):**
- Multiple data sources (IIT websites, Parliament records)
- Maintains hardcoded list of recognized INI bodies
- No single API endpoint; uses official published lists

**CBSE & CISCE:**
- School examination boards
- Maintain school/center lists on their websites
- CBSE: cbseresults.nic.in
- CISCE: cisce.org

**NIOS:**
- National Institute of Open Schooling
- Registry at nios.ac.in
- Study centers and exam center listings

**WHED:**
- World Higher Education Directory (international)
- Used for verifying institution's international standing
- Partial coverage of Indian institutions

---

## 3. Abbreviations Dictionary

Extracted from `src/name_resolver.py` — **155+ entries**.

### Core Abbreviations (with full expansions)

```typescript
export const ABBREVIATIONS_LEGACY = {
  // ── Premier Institutes ──
  "IIT": "Indian Institute of Technology",
  "IIM": "Indian Institute of Management",
  "IISc": "Indian Institute of Science",
  "IISER": "Indian Institute of Science Education and Research",
  "NIT": "National Institute of Technology",
  "IIIT": "Indian Institute of Information Technology",

  // ── Medical ──
  "AIIMS": "All India Institute of Medical Sciences",
  "JIPMER": "Jawaharlal Institute of Postgraduate Medical Education and Research",
  "PGIMER": "Post Graduate Institute of Medical Education and Research",
  "CMC": "Christian Medical College",
  "MAMC": "Maulana Azad Medical College",
  "LHMC": "Lady Hardinge Medical College",
  "UCMS": "University College of Medical Sciences",
  "KGMC": "King George's Medical College",
  "KGMU": "King George's Medical University",
  "VMMC": "Vardhman Mahavir Medical College",
  "GMC": "Government Medical College",
  "ESIC": "ESIC Medical College",

  // ── Technology / Engineering ──
  "BITS": "Birla Institute of Technology and Science",
  "VIT": "Vellore Institute of Technology",
  "SRM": "SRM Institute of Science and Technology",
  "DTU": "Delhi Technological University",
  "NSUT": "Netaji Subhas University of Technology",

  // ── Delhi Universities ──
  "DU": "University of Delhi",
  "JNU": "Jawaharlal Nehru University",
  "IIITD": "Indraprastha Institute of Information Technology Delhi",
  "JMI": "Jamia Millia Islamia",
  "MAMC": "Maulana Azad Medical College",
  "LHMC": "Lady Hardinge Medical College",
  "UCMS": "University College of Medical Sciences",
  "KGMC": "King George's Medical College",
  "KGMU": "King George's Medical University",
  "VMMC": "Vardhman Mahavir Medical College",
  "GMC": "Government Medical College",
  "ESIC": "ESIC Medical College",

  // ── Law ──
  "NLU": "National Law University",
  "NLUD": "National Law University Delhi",
  "NALSAR": "NALSAR University of Law",
  "NLSIU": "National Law School of India University",

  // ── Regional Universities ──
  "BU": "Bangalore University",
  "MU": "Mumbai University",
  "CU": "Calcutta University",
  "AU": "Anna University",
  "OU": "Osmania University",
  "PU": "Panjab University",
  "BHU": "Banaras Hindu University",
  "HU": "Hyderabad University",
  "AMU": "Aligarh Muslim University",

  // ── Research Institutes ──
  "TISS": "Tata Institute of Social Sciences",
  "TIFR": "Tata Institute of Fundamental Research",
  "ISI": "Indian Statistical Institute",
  "IIST": "Indian Institute of Space Science and Technology",
  "IIFT": "Indian Institute of Foreign Trade",
  "IRMA": "Institute of Rural Management Anand",

  // ── NITs (All 31) ──
  "MANIT": "Maulana Azad National Institute of Technology",
  "MNIT": "Malaviya National Institute of Technology",
  "SVNIT": "Sardar Vallabhbhai National Institute of Technology",
  "NITK": "National Institute of Technology Karnataka",
  "NITW": "National Institute of Technology Warangal",
  "NITT": "National Institute of Technology Tiruchirappalli",
  "NITC": "National Institute of Technology Calicut",
  "NITR": "National Institute of Technology Rourkela",
  "NITD": "National Institute of Technology Durgapur",
  "NITJ": "National Institute of Technology Jalandhar",
  "NITKKR": "National Institute of Technology Kurukshetra",
  "NITS": "National Institute of Technology Silchar",
  "NITA": "National Institute of Technology Agartala",
  "NITM": "National Institute of Technology Meghalaya",
  "NITP": "National Institute of Technology Patna",
  "NITGOA": "National Institute of Technology Goa",
  "NITUK": "National Institute of Technology Uttarakhand",
  "NITAP": "National Institute of Technology Arunachal Pradesh",
  "NITMGR": "National Institute of Technology Nagaland",
  "NITSKR": "National Institute of Technology Sikkim",

  // ── IIITs ──
  "IIITB": "International Institute of Information Technology Bangalore",
  "IIITH": "International Institute of Information Technology Hyderabad",
  "IIITM": "Indian Institute of Information Technology and Management",
  "DAIICT": "Dhirubhai Ambani Institute of Information and Communication Technology",
  "LNMIIT": "The LNM Institute of Information Technology",

  // ── Other Private/Central ──
  "UPES": "University of Petroleum and Energy Studies",
  "LPU": "Lovely Professional University",
  "KIIT": "Kalinga Institute of Industrial Technology",
  "GITAM": "Gandhi Institute of Technology and Management",
  "SASTRA": "Shanmugha Arts Science Technology and Research Academy",
  "SATHYABAMA": "Sathyabama Institute of Science and Technology",

  // ── Central Universities ──
  "CUJ": "Central University of Jharkhand",
  "CUB": "Central University of Bihar",
  "CUG": "Central University of Gujarat",
  "CUK": "Central University of Karnataka",
  "CUP": "Central University of Punjab",
  "CURAJ": "Central University of Rajasthan",
  "CUTN": "Central University of Tamil Nadu",

  // ── Northeast Universities ──
  "NEHU": "North Eastern Hill University",
  "PONDY": "Pondicherry University",
  "SU": "Sikkim University",
  "TU": "Tezpur University",
  "MANU": "Manipur University",
  "ASU": "Assam University",
  "MGU": "Mahatma Gandhi University",

  // ── Technological Universities ──
  "CBIT": "Chaitanya Bharathi Institute of Technology",
  "JNTU": "Jawaharlal Nehru Technological University",
  "JNTUH": "Jawaharlal Nehru Technological University Hyderabad",
  "JNTUK": "Jawaharlal Nehru Technological University Kakinada",
  "JNTUA": "Jawaharlal Nehru Technological University Anantapur",
  "MGIT": "Mahatma Gandhi Institute of Technology",
  "GRIET": "Gokaraju Rangaraju Institute of Engineering and Technology",
  "NMIT": "Nitte Meenakshi Institute of Technology",
  "BMSIT": "BMS Institute of Technology",
  "PESIT": "PES Institute of Technology",
  "MSRIT": "MS Ramaiah Institute of Technology",

  // ── Agricultural Universities ──
  "GBPUAT": "Govind Ballabh Pant University of Agriculture and Technology",
  "PAU": "Punjab Agricultural University",
  "CSAU": "Chandra Shekhar Azad University of Agriculture and Technology",
  "BAU": "Birsa Agricultural University",
  "JAU": "Junagadh Agricultural University",
  "MPUAT": "Maharana Pratap University of Agriculture and Technology",
  "NDUAT": "Narendra Deva University of Agriculture and Technology",
  "RAU": "Rajendra Agricultural University",
  "SDAU": "Sardarkrushinagar Dantiwada Agricultural University",
  "UAS": "University of Agricultural Sciences",

  // ── Veterinary Universities ──
  "KVAFSU": "Karnataka Veterinary Animal and Fisheries Sciences University",
  "MAFSU": "Maharashtra Animal and Fishery Sciences University",
  "RAJUVAS": "Rajasthan University of Veterinary and Animal Sciences",
  "SVVU": "Sri Venkateswara Veterinary University",
  "TANUVAS": "Tamil Nadu Veterinary and Animal Sciences University",
  "KVASU": "Kerala Veterinary and Animal Sciences University",

  // ── Other Universities ──
  "CUSAT": "Cochin University of Science and Technology",
  "KU": "Kakatiya University",
  "SKU": "Sri Krishnadevaraya University",
  "SVU": "Sri Venkateswara University",
  "SKUAST": "Sher-e-Kashmir University of Agricultural Sciences and Technology",

  // ── Krishi Vishwavidyalayas ──
  "JNKVV": "Jawaharlal Nehru Krishi Vishwavidyalaya",
  "IGKV": "Indira Gandhi Krishi Vishwavidyalaya",
  "BCKV": "Bidhan Chandra Krishi Viswavidyalaya",
  "UBKV": "Uttar Banka Krishi Viswavidyalaya",
  "WBUAFS": "West Bengal University of Animal and Fishery Sciences",

  // ── State Universities (Haryana) ──
  "KU": "Kurukshetra University",
  "GJU": "Guru Jambheshwar University",
  "CDLU": "Chaudhary Devi Lal University",
  "MDU": "Maharshi Dayanand University",
} as const;
```

---

## 4. Categorization Rules

Extracted from `src/nodes.py` — `categorisation_node` and `final_assessment_node`.

### Categorization States

Four possible verdicts:
- **Genuine**: Institution is recognized by a relevant statutory body or appears in authoritative registries
- **Fake**: Institution appears on UGC's fake university list and not on any genuine registry
- **New**: Institution is not found in any registry but passes validation checks (new/upcoming institution)
- **Unknown**: Insufficient evidence or conflicting data

### Decision Logic

```python
# Categorisation node logic:

# STEP 1: Check statutory bodies (parallel)
for authority in [UGC, AICTE, NMC, NCTE, PCI, COA, INC, INI]:
    result = scraper.search(institution_name)
    if result.categorisation == "Genuine":
        return Genuine
    if result.categorisation == "Fake":
        return Fake

# STEP 2: If found on UGC genuine list → Genuine
if found_on_ugc_genuine:
    return Genuine

# STEP 3: If found on fake list but NOT on any genuine list → Fake
if found_on_ugc_fake and not found_on_genuine:
    return Fake

# STEP 4: If found in category pages → Genuine
if found_in_category_pages:
    return Genuine

# STEP 5: Open web search validation
evidence = web_search_and_agent_validate(institution_name)
if evidence_strong:
    return Genuine
if evidence_contradicts:
    return Fake

# STEP 6: Default → Unknown
return Unknown
```

### Blocking Rules

The system explicitly blocks certain domains from being trusted as proof:
- `ugc.gov.in`, `aicte-india.org`, `nmc.org.in`, `ncte.gov.in`, etc. — these are authority sites themselves, not third-party verification

---

## 5. DigiLocker/NAD Field Semantics

Extracted from `src/digilocker.py`.

### Field Distinctions

| Field | Meaning |
|-------|---------|
| `is_on_digilocker` | Document exists in DigiLocker (government's digital document repository) |
| `is_in_nad` | Institution appears in NAD (National Academic Depository) — registry of degree-issuing institutions |
| `matched_name` | The full name of the institution as it appears in DigiLocker/NAD |
| `match_type` | How the match was achieved (exact, fuzzy, abbreviation-expanded) |

### Matching Engine

The legacy scraper implements sophisticated name matching:

1. **Normalization:** Lowercase, remove punctuation, collapse whitespace
2. **Significant Tokens:** Remove stop words (of, the, and, for, etc.)
3. **City Aliases:** Handle common city name variants
   - bombay ↔ mumbai
   - calcutta ↔ kolkata
   - madras ↔ chennai
   - bangalore ↔ bengaluru

4. **Abbreviation Expansion:** Use the abbreviations dictionary
   - "IIT Bombay" → "Indian Institute of Technology Bombay"

5. **Variant Generation:** 11 strategies
   - Normalized name
   - Significant tokens only
   - Expanded abbreviations
   - Contracted form
   - With city aliases
   - Without university/college suffix
   - With state name
   - And more

6. **Collision Policy:**
   - Same base name → Keep (campus variants)
   - Has distinguishing token → Keep
   - Generic words only → Remove (prevent false positives)

---

## 6. Duplicate Detection Weights

Extracted from `duplicate_matcher.py`.

### Scoring Thresholds

```python
DUPLICATE_THRESHOLD = 85.0      # Final score ≥ 85 → duplicate
NAME_THRESHOLD = 85.0            # Name score ≥ 85 → strong match
ADDRESS_THRESHOLD = 77.0         # Address score ≥ 77 → likely same location

NAME_WEIGHT = 0.4                # Blend: 40% name, 60% address
ADDRESS_WEIGHT = 0.6

# For blending name variants:
ORIGINAL_NAME_WEIGHT = 0.4       # 40% original name similarity
CLEANED_NAME_WEIGHT = 0.6        # 60% cleaned name similarity
```

### Scoring Formula

```python
# Original vs. cleaned name blend
name_score = (
    0.4 × fuzzy_match(original_name, candidate_original_name) +
    0.6 × fuzzy_match(cleaned_name, candidate_cleaned_name)
)

# Address scoring (exact + fuzzy)
address_score = fuzzy_match(normalized_address, candidate_address)

# Final duplicate score
final_score = (
    0.4 × name_score +
    0.6 × address_score
)

is_duplicate = (
    final_score >= 85.0 AND
    (name_score >= 85.0 OR address_score >= 77.0)
)
```

### Common Institution Words (Stop Words)

Removed before fuzzy matching to focus on unique parts:

**Institution Type:** college, university, institute, school, academy, polytechnic, technical, professional, research, education

**Ownership:** public, private, autonomous, government, state, national, international

**Level:** junior, senior, women, girls, boys

**Domain:** medical, pharmacy, nursing, dental, engineering, management, law, agriculture, hotel, catering

**Connectors:** of, and, the, for, in, at, by, or

Fuzzy matching uses `rapidfuzz.fuzz.token_set_ratio` with stopword removal.

---

## 7. Database Schema (3-Table Normalized)

Extracted from `src/database.py` — the old system's PostgreSQL schema.

### Table 1: `university_validation`

**Purpose:** Main record per institution, categorization, and status tracking

```sql
CREATE TABLE university_validation (
    id SERIAL PRIMARY KEY,
    university_name TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    affiliated_university TEXT,                -- e.g., "Osmania University"
    institution_category TEXT,                 -- Genuine, Fake, Unknown, New
    statutory_body TEXT,                       -- UGC, AICTE, NMC, etc.
    source TEXT,                               -- Where verified (e.g., "UGC", "Official Website")
    verification_proof JSONB,                  -- Evidence: screenshots, URLs, extracted fields
    modified_fields TEXT,                      -- Audit trail: which fields were changed by agent
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked_time TIMESTAMP,               -- When verification last occurred
    next_check_time TIMESTAMP,                 -- When to re-verify
    modified_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    digilocker_availability TEXT,              -- "Available", "Not Available", "Partial"
    digilocker_matched_name TEXT,              -- Full name from DigiLocker/NAD
    digilocker_match_type TEXT,                -- How matched: exact, fuzzy, abbreviation

    UNIQUE (university_name, institution_name)
);

CREATE INDEX idx_university_name ON university_validation(university_name);
CREATE INDEX idx_institution_name ON university_validation(institution_name);
CREATE INDEX idx_category ON university_validation(institution_category);
CREATE INDEX idx_next_check_time ON university_validation(next_check_time);
CREATE INDEX idx_combined ON university_validation(university_name, institution_name);
```

### Table 2: `university_contact_details`

**Purpose:** Contact information, extracted and verified

```sql
CREATE TABLE university_contact_details (
    id INTEGER PRIMARY KEY REFERENCES university_validation(id),
    university_name TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    address TEXT,                              -- Extracted from registries / website
    website TEXT,                              -- Official website URL
    email TEXT,                                -- Institutional email
    primary_mobile_number TEXT,                -- USER PROVIDED — NEVER overwritten by agent
    secondary_mobile_number TEXT,              -- Agent-found numbers (searchresults, website)
    landline_number TEXT,                      -- DEPRECATED — no longer used
    normalized_institution_name TEXT,          -- For pg_trgm duplicate detection
    normalized_address TEXT,                   -- For pg_trgm duplicate detection

    UNIQUE (university_name, institution_name)
);

CREATE INDEX idx_contact_normalized_name ON university_contact_details
    USING GIN (normalized_institution_name gin_trgm_ops);
CREATE INDEX idx_contact_normalized_address ON university_contact_details
    USING GIN (normalized_address gin_trgm_ops);
```

### Table 3: `university_verification_details`

**Purpose:** Verification-specific metadata

```sql
CREATE TABLE university_verification_details (
    id INTEGER PRIMARY KEY REFERENCES university_validation(id),
    university_name TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    active_status TEXT,                        -- Active, Inactive, Suspended, etc.
    verification_mode TEXT,                    -- Registry, Website, Scraping, Manual
    mandatory_documents TEXT,                  -- JSONB: list of required recognition docs
    verification_source_details TEXT,          -- JSONB: raw source data per authority

    UNIQUE (university_name, institution_name)
);
```

### Field Mappings to New Schema

All fields from the 3-table schema must map to the new unified schema (defined in MASTER-PLAN.md §9.2):

| Old Column | New Column | Notes |
|-----------|-----------|-------|
| university_name | name (with type=submitted) | User input |
| institution_name | — | Merged into name |
| affiliated_university | affiliatedUniversity | |
| institution_category | verdict | Genuine/Fake/Unknown/New |
| statutory_body | evidence[].authority | |
| source | evidence[].source | |
| verification_proof | evidence[].details | Structured JSON |
| address | contact.address | |
| website | contact.website | |
| email | contact.email | |
| primary_mobile_number | contact.phone (primary) | Never auto-overwritten |
| secondary_mobile_number | contact.phone (secondary) | |
| active_status | metadata.status | |
| verification_mode | metadata.verificationMode | |
| digilocker_* | evidence[].digilockerMatch | |

---

## 8. Authority Mapping Logic

Extracted from `src/authority_mapper.py`.

### Keyword-Based Authority Selection

Before attempting registry lookups, the system infers applicable authorities via keyword matching:

```python
_KEYWORD_MAP = {
    "medical": ["NMC", "UGC"],
    "dental": ["DCI", "UGC"],  # DCI not in primary 16
    "pharmacy": ["PCI", "UGC"],
    "nursing": ["INC", "UGC"],
    "architecture": ["COA", "UGC"],
    "building": ["COA", "UGC"],
    "engineering": ["AICTE", "UGC"],
    "technology": ["AICTE", "UGC"],
    "management": ["AICTE", "UGC"],
    "mba": ["AICTE", "UGC"],
    "teacher": ["NCTE", "UGC"],
    "education": ["NCTE", "UGC"],
    "school": ["CBSE", "CISCE", "NIOS", "UGC"],
    "iit": ["INI", "UGC"],
    "nit": ["INI", "UGC"],
    # ... 40+ keywords total
}
```

### INI Pattern Detection

Separate logic detects parliamentary institutes:
```python
INI_PATTERNS = [
    r"IIT\s+",
    r"NIT\s+",
    r"IIIT",
    r"AIIMS",
    r"IISc",
    r"IISER",
    r"IIST",
    r"IIFT",
    r"JNU",
    r"JIPMER",
    r"PGIMER",
    # ... and more
]
```

---

## 9. Name Resolution & Variant Generation

Extracted from `src/name_resolver.py`.

### Two-Phase Resolution

1. **LLM Abbreviation Expansion**
   - Input: "IIT Bombay"
   - LLM expands: "Indian Institute of Technology Bombay"
   - Output: Both the original and expanded form

2. **Deterministic Variant Generation**
   - 11 variants generated from each name variant
   - Variants tested in order against registries
   - First match wins

### Name Corrections (Misspellings)

```python
_NAME_CORRECTIONS = {
    "indian institute of sciences": [
        "Indian Institute of Science",  # Primary (UGC listing)
        "Indian Institute of Science Bangalore",  # Alternative
    ],
    "bit": [
        "Birla Institute of Technology and Science",
        "Birla Institute of Technology",
    ],
    # ... and more
}
```

---

## 10. Feature Flags & Configuration

Default feature flags (can be overridden in DB at runtime):

```
USE_GOOGLE_CSE=false           # Google Custom Search (100 free queries/day)
USE_BROWSER=true               # Playwright/browser rendering
USE_LLM_REASONING=true         # LLM-driven decision making
USE_LIVE_AUTHORITIES=true      # Query live authority endpoints
USE_VECTOR_SEARCH=true         # Semantic search via embeddings
USE_WIKIDATA=true              # Cross-check against Wikidata
STRICT_ROBOTS=true             # Respect robots.txt
READ_ONLY_MODE=false           # Disable writes (safeguard)
```

---

## 11. HTTP Request Configuration

From `src/scrapers/base.py` — common HTTP session settings:

```python
# Retry logic
RETRY_ATTEMPTS = 3
RETRY_BACKOFF = 2 seconds exponential

# Timeouts
CONNECT_TIMEOUT = 10 seconds
READ_TIMEOUT = 30 seconds

# Headers
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
VERIFY_SSL = True (configurable per environment)

# Rate limiting
Per-domain backoff after 429 responses
```

---

## Summary: Data Loss Prevention Checklist

When implementing the new schema (MASTER-PLAN.md §9.2), verify:

- [ ] All fields from the 3-table schema are preserved or mapped
- [ ] No user-provided contact information is overwritten
- [ ] Audit trail (modified_fields) is maintained
- [ ] Scheduling logic (last_checked_time, next_check_time) is preserved
- [ ] Verification proof (JSONB) includes all evidence details
- [ ] DigiLocker matching is preserved in evidence
- [ ] Duplicate detection state is stored

---

**Extracted from:** `University_Validation(20-07)` (Python 3.11, FastAPI, LangGraph, PostgreSQL)
**Extraction Date:** 2025-07-25
**Schema:** Legacy 3-table normalized; maps to unified schema in MASTER-PLAN.md §9.2
