# University Validation Platform — Master Plan

**Stack:** Next.js 15 · React 19 · Tailwind v4 · shadcn/ui · Neon Postgres · Drizzle · Inngest · Upstash Redis · Vercel · one self-hosted VPS
**Purpose:** enter an institution name, get a validated, explainable, auditable verdict. Batch-process thousands. Revalidate on a schedule. No auth.

---

## How to use this document

| If you are…                     | Read                                                |
| ------------------------------- | --------------------------------------------------- |
| Setting up for the first time   | **Part 0** — accounts, keys, env, the legacy folder |
| Trying to understand the design | **Part I** — architecture                           |
| Provisioning the VPS            | **Part II** — infrastructure                        |
| Driving Claude Code             | **Part III** — the 22 prompts, in order             |

**Every prompt in Part III is self-contained.** Paste it, plus the standing instruction block from §20, into a fresh Claude Code session. Do not skip ahead — the dependency order in §19 is real.

---

## Contents

**Part 0 — Before you start**

1. What you need
2. The legacy folder — what to take, what to ignore
3. Complete `.env.example`
4. Dependencies
5. Glossary

**Part I — Architecture** 6. The core idea 7. Resolution ladder 8. Pipeline stages 9. Data model 10. Registry ingestion 11. Scoring 12. Workflow state machine 13. Reliability 14. Observability 15. Cost 16. Considered and rejected

**Part II — Self-hosted infrastructure** 17. Topology and sizing 18. `docker-compose.yml` · SearXNG `settings.yml` · `Caddyfile` 19. Browser worker · Operating playbook

**Part III — Build plan** 20. Rules for every prompt 21. `CLAUDE.md` 22. Prompts 0–21 23. Common failure modes 24. Milestones and manual work

---

---

# PART 0 — BEFORE YOU START

---

## 1. What you need

Have all of this ready before Prompt 0. Missing any of it will stall you mid-build.

| #   | Item                              | Where                                                                 | Cost       |
| --- | --------------------------------- | --------------------------------------------------------------------- | ---------- |
| 1   | **Neon account + project**        | neon.tech — copy both the direct and the `-pooler` connection strings | Free → $19 |
| 2   | **Upstash Redis database**        | upstash.com — copy REST URL + token                                   | Free → $15 |
| 3   | **Inngest account**               | inngest.com — event key + signing key                                 | Free       |
| 4   | **Vercel account**                | Pro plan needed for 300s+ function duration                           | $20        |
| 5   | **A VPS**                         | Hetzner CX22 (€3.79) or Fly.io/Render                                 | ~$5        |
| 6   | **A domain** with DNS you control | 3 A records: `search.`, `browser.`, `embed.`                          | —          |
| 7   | **Gemini API key**                | aistudio.google.com — for development                                 | Free tier  |
| 8   | **Production LLM endpoint**       | Your Qwen route + API key (see §3)                                    | —          |
| 9   | **Vercel Blob store**             | Created from the Vercel dashboard                                     | Included   |
| 10  | **Sentry project** (optional)     | sentry.io                                                             | Free tier  |
| 11  | **The legacy folder**             | `University_Validation(20-07)` in the workspace                       | —          |

**Local tooling:** Node 20+, pnpm 9+, Docker (for the VPS work and Testcontainers), `psql`, `openssl`.

### Setup order

```
1. Provision Neon, Upstash, Inngest, Gemini  →  fill .env.local
2. Prompt 0    (repo foundation)
3. Provision the VPS + DNS  →  Prompt 1  (infra)  →  bash infra/verify.sh
4. Prompt 2 onward
```

---

## 2. The legacy folder — what to take, what to ignore

A working Python implementation exists at `University_Validation(20-07)` in the workspace. **It is a requirements document, not a codebase to port.**

### Take from it

| What                                                               | Where in the legacy repo                                                                                                                                  | Why it matters                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Real registry URLs, form fields, POST bodies, pagination logic** | `src/scrapers/*.py` — `ugc.py`, `aicte.py`, `nmc*.py`, `pci*.py`, `ncte*.py`, `coa*.py`, `inc*.py`, `whed.py`, `ini.py`, `nios.py`, `cbse.py`, `cisce.py` | **This is the single most valuable thing in the folder.** It collapses most of the manual source-hunting work in §24 |
| The 16 statutory bodies and what each governs                      | `src/scrapers/factory.py`, `src/authority_mapper.py`                                                                                                      | Feeds `applicability.ts` (§8.2)                                                                                      |
| Abbreviation dictionary (80+ entries)                              | `src/name_resolver.py` `_ABBREVIATIONS`                                                                                                                   | Seeds `abbreviations.ts` (Prompt 5)                                                                                  |
| Validation rules and categorisation logic                          | `src/nodes.py` — `categorisation_node`, `final_assessment_node`                                                                                           | Sanity-check against the scoring policies (§11)                                                                      |
| DigiLocker/NAD field semantics                                     | `src/digilocker.py`                                                                                                                                       | `is_on_digilocker` vs `is_in_nad` distinction                                                                        |
| Duplicate-detection weights                                        | `duplicate_matcher.py` — `NAME_WEIGHT` 0.6, `ADDRESS_WEIGHT` 0.4                                                                                          | Starting point for the fusion score (§8.5)                                                                           |
| Evidence fields the old system stored                              | `src/database.py` 3-table schema                                                                                                                          | Ensures no data loss vs the old system                                                                               |
| API contract expected by any existing consumers                    | `app.py` endpoints                                                                                                                                        | Only if something already calls it                                                                                   |

### Ignore completely

- The LangGraph workflow and every node in `src/nodes.py` as _structure_
- The synchronous request pipeline
- The 3-table schema
- `search_tool.py` (one file handling every provider)
- Playwright-as-default scraping
- The folder structure, the Python idioms, the FastAPI layout

### The one instruction that matters

> Study `University_Validation(20-07)` **only** to extract business requirements: which statutory bodies exist, what each registry endpoint is, what fields are collected, what makes an institution genuine or fake, and what the abbreviation dictionary contains.
>
> **Do not copy its architecture, folder structure, Python implementation, LangGraph workflow, or synchronous request flow.** Reimplement everything using the event-driven architecture in Part I.

This instruction is baked into `CLAUDE.md` (§21) and repeated in Prompt 0.

---

## 3. Complete `.env.example`

Copy this verbatim into the repo in Prompt 0. Every variable is validated by Zod at boot — a missing one fails fast with a readable message.

```bash
# ─────────────────────────────────────────────────────────────
# APPLICATION
# ─────────────────────────────────────────────────────────────
APP_ENV=development                    # development | preview | production
LOG_LEVEL=info                         # debug | info | warn | error
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─────────────────────────────────────────────────────────────
# DATABASE  (Neon in dev, ANY PostgreSQL in production)
# Only standard Postgres features are used. Switching to a
# self-hosted instance requires changing these two lines only.
# ─────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.ap-south-1.aws.neon.tech/uv?sslmode=require
DATABASE_POOLED_URL=postgresql://user:pass@ep-xxx-pooler.ap-south-1.aws.neon.tech/uv?sslmode=require
# For local Postgres, set BOTH to the same value:
# DATABASE_URL=postgresql://uv:uv@localhost:5432/uv
# DATABASE_POOLED_URL=postgresql://uv:uv@localhost:5432/uv

# ─────────────────────────────────────────────────────────────
# REDIS  (Upstash REST — edge-safe)
# Leave BLANK to fall back to an in-memory cache (tests, offline dev)
# ─────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=

# ─────────────────────────────────────────────────────────────
# INNGEST
# ─────────────────────────────────────────────────────────────
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_DEV=1                          # 1 = local dev server; unset in production

# ─────────────────────────────────────────────────────────────
# SELF-HOSTED INFRASTRUCTURE  (Part II)
# One bearer token guards all three VPS endpoints.
# Generate with: openssl rand -hex 32
# ─────────────────────────────────────────────────────────────
INFRA_TOKEN=
SEARXNG_URL=https://search.your-domain.tld
BROWSER_SERVICE_URL=https://browser.your-domain.tld
EMBEDDINGS_URL=https://embed.your-domain.tld

# ─────────────────────────────────────────────────────────────
# SEARCH  (Discovery stage only)
# Default chain. google-cse is NOT in it — invoked explicitly.
# ─────────────────────────────────────────────────────────────
SEARCH_CHAIN=searxng,duckduckgo
GOOGLE_CSE_ID=                         # optional, 100 queries/day free
GOOGLE_API_KEY=

# ─────────────────────────────────────────────────────────────
# LLM  —  ONE interface, TWO configurations.
# Switching dev → production changes ONLY these variables.
# No application code changes.
# ─────────────────────────────────────────────────────────────
LLM_PROVIDER=gemini                    # gemini | openai-compatible

#   ── development ──
GEMINI_API_KEY=
LLM_MODEL=gemini-2.5-flash

#   ── production (uncomment and set LLM_PROVIDER=openai-compatible) ──
# LLM_PROVIDER=openai-compatible
# LLM_BASE_URL=https://llm-qwen-7b-route-srt-innovation.apps.inmumocpcl.atrapa.deloitte.com/v1
# LLM_MODEL=Qwen/Qwen3-VL-8B-Instruct
# LLM_API_KEY=

LLM_MAX_TOKENS=2048
LLM_TEMPERATURE=0.0
LLM_VERIFY_SSL=true                    # false ⇒ custom undici Agent, see Prompt 10
LLM_TIMEOUT_MS=30000
LLM_MAX_RUN_COST_USD=0.05              # per-validation budget ceiling

# ─────────────────────────────────────────────────────────────
# EMBEDDINGS
# Model and dimension are read from the embedding_spaces table,
# NOT from env. This URL is only the transport.
# ─────────────────────────────────────────────────────────────
# (EMBEDDINGS_URL is set above under infrastructure)

# ─────────────────────────────────────────────────────────────
# STORAGE / OBSERVABILITY
# ─────────────────────────────────────────────────────────────
BLOB_READ_WRITE_TOKEN=
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
METRICS_TOKEN=                         # guards /api/metrics

# ─────────────────────────────────────────────────────────────
# FEATURE FLAGS  (defaults only — runtime values live in the DB)
# ─────────────────────────────────────────────────────────────
USE_GOOGLE_CSE=false
USE_BROWSER=true
USE_LLM_REASONING=true
USE_LIVE_AUTHORITIES=true
USE_VECTOR_SEARCH=true
USE_WIKIDATA=true
STRICT_ROBOTS=true
READ_ONLY_MODE=false

# ─────────────────────────────────────────────────────────────
# CRAWLER IDENTITY  (be honest — this is a public-interest tool)
# ─────────────────────────────────────────────────────────────
CRAWLER_USER_AGENT=UniversityValidationBot/1.0 (+https://your-domain.tld/about-bot)
CRAWLER_CONTACT_EMAIL=you@your-domain.tld
```

### VPS `.env` (separate file, lives at `/opt/uv-infra/.env`)

```bash
DOMAIN=your-domain.tld
INFRA_TOKEN=              # SAME value as the app's INFRA_TOKEN
SEARXNG_SECRET=           # openssl rand -hex 32
```

---

## 4. Dependencies

Install these in Prompt 0. Pin exact versions at install time; the majors below are what the plan assumes.

**Core**

```
next@15 · react@19 · react-dom@19 · typescript@5
tailwindcss@4 · @tailwindcss/postcss
```

**UI**

```
shadcn/ui (CLI-initialized) · lucide-react · framer-motion
@tanstack/react-query@5 · @tanstack/react-table@8 · @tanstack/react-virtual
react-hook-form · @hookform/resolvers · zod · recharts · nuqs · sonner
```

**Data**

```
drizzle-orm · drizzle-kit · @neondatabase/serverless · postgres
@upstash/redis · @upstash/ratelimit
```

**Jobs**

```
inngest · @inngest/realtime
```

**Fetch / parse**

```
undici · cheerio · papaparse
```

**LLM / embeddings**

```
ai · @ai-sdk/google · @ai-sdk/openai-compatible
```

**Platform**

```
@vercel/blob · @sentry/nextjs · pino · pino-pretty
@opentelemetry/api · @opentelemetry/sdk-node
```

**Dev**

```
vitest · @vitest/coverage-v8 · @testcontainers/postgresql
@playwright/test · eslint · prettier · tsx
```

**Deliberately absent from the root `package.json`:** `playwright`, `playwright-core`, `@sparticuz/chromium`. Playwright lives **only** in `infra/browser-worker/package.json`. If Claude Code adds it to the root, that is a bug — see §23.

---

## 5. Glossary

Terms used precisely throughout this document. Claude Code should treat these as defined vocabulary.

| Term                | Meaning                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Registry mirror** | Statutory registry data ingested into our Postgres on a schedule. The system's primary source of truth. Not a cache of live scraping |
| **Snapshot**        | One ingestion run of one authority. Immutable, dated, content-hashed, and **published only after passing validation**                |
| **L0–L4**           | The resolution ladder (§7). L0 Redis · L1 validated record · L2 mirror · L3 web+LLM · L4 live portals                                |
| **Discovery**       | The stage that answers _"which institution is this and where does it live on the web?"_ The only stage allowed to run web search     |
| **Verification**    | The stage that answers _"what does every trusted source say about this identity?"_ Never runs web search                             |
| **Enricher**        | One verification source implementing a single interface. Tiered `mirror` / `api` / `live`                                            |
| **Tier** (evidence) | `mirror` = local DB, 20–80ms · `api` = cheap known endpoint, 200–600ms · `live` = government portal, 3–20s                           |
| **Identity**        | One row linking an institution to how _one specific source_ names and identifies it. Replaces flat aliases                           |
| **Weight**          | How much a _source type_ counts, from the scoring policy                                                                             |
| **Quality**         | How good a _specific observation_ is, from its tier, domain, and directness                                                          |
| **Policy**          | A versioned row of weights and thresholds for one institution type                                                                   |
| **Verdict**         | `Genuine` · `Likely Genuine` · `Unknown` · `Unverified` · `Fake` · `New`                                                             |
| **Run**             | One validation execution, with its own state machine, steps, evidence, and pinned provenance                                         |
| **Legacy folder**   | `University_Validation(20-07)` — a requirements reference only                                                                       |

---

---

# PART I — ARCHITECTURE

---

## 6. The core idea

Statutory registries — AICTE, UGC, NMC, PCI, AISHE — are **slow-moving datasets, not real-time APIs**. They change quarterly.

So don't scrape them per request. **Mirror them into Postgres on a schedule, index them, and answer from your own database in ~50ms.** Live scraping becomes a rare background fallback, not the hot path.

This one decision is what makes everything else work:

| Without the mirror                  | With the mirror                          |
| ----------------------------------- | ---------------------------------------- |
| 10–40s per validation               | 220ms for most validations               |
| Constant rate limiting and IP bans  | ~92% of queries make zero external calls |
| Non-reproducible results            | Every verdict cites a dated snapshot     |
| Government portal downtime = outage | Downtime is invisible                    |

**If one thing in this project is built carefully, it is the ingestion pipeline (§10).** Everything downstream is bounded by how good the mirror is.

### The 16 authorities

| Code       | Name                                          | Governs                            |
| ---------- | --------------------------------------------- | ---------------------------------- |
| `UGC`      | University Grants Commission                  | Universities, higher education     |
| `UGC_FAKE` | UGC Fake Universities list                    | **Terminal negative signal**       |
| `AICTE`    | All India Council for Technical Education     | Engineering, management, technical |
| `NMC`      | National Medical Commission                   | Medical, dental                    |
| `PCI`      | Pharmacy Council of India                     | Pharmacy                           |
| `NCTE`     | National Council for Teacher Education        | Teacher education                  |
| `COA`      | Council of Architecture                       | Architecture                       |
| `INC`      | Indian Nursing Council                        | Nursing                            |
| `BCI`      | Bar Council of India                          | Law                                |
| `INI`      | Institutes of National Importance             | IITs, NITs, AIIMS, IISERs          |
| `AISHE`    | All India Survey on Higher Education          | Baseline census of all colleges    |
| `NAAC`     | National Assessment and Accreditation Council | Quality accreditation              |
| `NIRF`     | National Institutional Ranking Framework      | Ranking participation              |
| `CBSE`     | Central Board of Secondary Education          | Schools                            |
| `CISCE`    | Council for the Indian School Certificate     | Schools                            |
| `NIOS`     | National Institute of Open Schooling          | Open schooling                     |
| `NAD`      | DigiLocker National Academic Depository       | Degree deposit status              |

_(17 including `NAD`; the legacy system called this "16 statutory bodies" plus DigiLocker.)_

### Bulk sources

AICTE approved-institution exports (~40k colleges) · UGC university lists and the fake-universities list · MoE Institutes of National Importance · AISHE bulk datasets · sector-regulator institution lists · NIRF and NAAC lists · DigiLocker/NAD onboarded institutions.

**The legacy folder's `src/scrapers/*.py` files already contain the working URLs and form fields for most of these.** Mine them in Prompt 0.

---

## 7. Resolution ladder

Every validation walks down until it can answer confidently.

| Tier   | Source                                         | Latency            | Traffic |
| ------ | ---------------------------------------------- | ------------------ | ------- |
| **L0** | Redis verdict cache                            | 35ms               | ~40%    |
| **L1** | `institutions` — validated record, still fresh | 70ms               | ~25%    |
| **L2** | **Registry mirror** — trigram + vector match   | 220ms              | ~25%    |
| **L3** | Discovery + Verification (web, LLM)            | 5.4s p50 / 11s p95 | ~8%     |
| **L4** | L3 + live authority portals + browser render   | 21s p50 / 50s p95  | ~2%     |

L0–L2 return synchronously. L3–L4 return `202 { runId }`; the UI subscribes to Inngest Realtime and fills in live.

**Freshness policy** — an L1 hit is served immediately even when stale, and enqueues a background refresh. Users never wait for freshness.

| Verdict                      | Fresh for |
| ---------------------------- | --------- |
| Genuine, authority-confirmed | 180 days  |
| Fake (UGC fake list)         | 90 days   |
| Likely Genuine               | 30 days   |
| Unknown                      | 14 days   |
| New                          | 7 days    |

Any record whose source snapshot has been superseded is stale regardless of age.

**Batch throughput:** ~900 institutions/minute at 20 concurrent runs, mirror-dominated. Interactive validations run at a higher Inngest priority and a separate concurrency scope so batches never starve them.

---

## 8. Pipeline stages

Four stages with hard boundaries, enforced in CI rather than by convention.

### 8.1 Discovery — "which institution is this, and where does it live on the web?"

**Identity Resolution** (budget 400ms, cache 24h)

```
Redis → institutions → REGISTRY MIRROR → Wikidata (P856) → web search
```

**Official Website Discovery** (budget 2s, cache 7d)

```
domain-guess (acronym × .ac.in/.edu.in) → search results → title verification
```

```ts
ResolvedIdentity {
  institutionId?, canonicalName, officialUrl?, type,
  state?, district?, confidence, source, candidates[]
}
```

**Rule: Discovery is the only stage permitted to perform open web search.**

### 8.2 Verification — "what does every trusted source say about this identity?"

```ts
interface Enricher {
  code: SourceCode; // UGC | AICTE | NMC | WIKIDATA | NAD | WEBSITE …
  tier: "mirror" | "api" | "live";
  appliesTo(identity): boolean;
  fetch(identity, ctx): Promise<Evidence[]>;
  timeoutMs: number;
}
```

| Tier     | Latency   | Sources                                                  | Runs when                                                                         |
| -------- | --------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `mirror` | 20–80ms   | UGC, AICTE, UGC_FAKE, AISHE, INI, NAAC, NIRF             | Always — local DB read                                                            |
| `api`    | 200–600ms | Wikidata, Wikipedia, official website, DigiLocker mirror | Always — cheap, no ban risk                                                       |
| `live`   | 3–20s     | NMC, PCI, NCTE, COA, INC, BCI, CBSE, CISCE portals       | Only when the mirror has no entry for an authority that `appliesTo` this identity |

Tiers run in sequence; enrichers within a tier run concurrently. A `UGC_FAKE` mirror hit is terminal — nothing further runs.

**`appliesTo` is the highest-value function in this layer.** It stops a medical college being scored against AICTE and an arts college being penalised for missing NMC.

**Rule: Verification never calls a SearchProvider.**
Enforced by an ESLint `no-restricted-imports` rule plus an architecture test: no file under `src/server/verification/` may import from `src/server/search/` or `src/server/discovery/`.

### 8.3 Reasoning — two-stage LLM

```
Evidence JSON → extract (structured facts) → reason (findings, contradictions)
```

The LLM never sees raw HTML — enforced by a runtime guard that throws if the payload contains `<html` or `<!DOCTYPE`. Both stages use `generateObject` with a Zod schema. **Neither stage produces a number.**

### 8.4 Scoring — arithmetic, not LLM

See §11. Deterministic, reproducible, explainable.

### 8.5 Matching pipeline (name → institution)

Deliberately no LLM in the hot path.

```
input
  ↓ normalize      lowercase, unaccent, strip punctuation, collapse whitespace,
                   "&"→"and", expand ordinals, strip honorifics, canonicalize
                   Indian place variants
  ↓ identity hit   exact match on institution_identities → done (0ms path)
  ↓ abbreviation   deterministic dictionary seeded from the legacy
                   _ABBREVIATIONS map → 1–5 candidate strings
  ↓ trgm recall    similarity() > 0.35 across institutions, identities,
                   registry_entries — one UNION ALL query, LIMIT 50/source
  ↓ vector rerank  cosine similarity in the active embedding space
  ↓ fusion         0.45·trgm + 0.35·vector + 0.12·state + 0.08·addressTrgm
  ↓ decision       ≥0.90 accept │ 0.70–0.90 accept + needsReview │ <0.70 new
```

The legacy system used `NAME_WEIGHT 0.6` / `ADDRESS_WEIGHT 0.4`. The fusion score above generalises that with two extra signals; tune against the Prompt 5 fixture set.

---

## 9. Data model

### 9.1 Identity graph

Names differ across registries. AICTE spells it one way, UGC another, Wikidata a third. **None should overwrite the others.**

```
institutions                 canonical entity — one row per real institution
  ↑
institution_identities       one row per (institution, source, external_id)
                             stores the name AS THAT SOURCE SPELLS IT
```

```
institution_identities
  id, institution_id, source, external_id, name_as_source, normalized_name,
  url, snapshot_id, match_score, match_method, confirmed_by (auto|human),
  created_at, superseded_at
```

`source ∈ {AICTE, UGC, AISHE, NIRF, NAAC, NMC, PCI, NCTE, COA, INC, BCI, INI, CBSE, CISCE, NIOS, WIKIDATA, NAD, WEBSITE, MANUAL}`

Aliases are **derived**: a materialized view over `institution_identities.normalized_name` plus manually added variants. "IITB", "IIT Bombay", and "Indian Institute of Technology Bombay" coexist as three identity rows pointing at one institution, each retaining provenance.

This replaces both a flat alias table and a separate registry-link table — one concept, one table.

### 9.2 Full schema

```
── Canonical ──────────────────────────────────────────────
institutions            id, canonical_name, normalized_name, slug, type,
                        state, district, pincode, address, lat, lng, website,
                        parent_institution_id, verdict, confidence,
                        policy_id, first_validated_at, last_validated_at,
                        valid_until, created_at, updated_at, deleted_at
institution_identities  (§9.1)
institution_contacts    institution_id, kind, value, evidence_id, verified_at
institution_links       institution_id, platform, url, evidence_id, verified_at

── Registry mirror ────────────────────────────────────────
authorities             code, name, sector, jurisdiction, refresh_cron,
                        source_url, is_active
registry_snapshots      id, authority_code, state, fetched_at, published_at,
                        row_count, content_hash, blob_key,
                        validation_report jsonb, error
registry_entries        id, snapshot_id, authority_code, raw_name,
                        normalized_name, state, district, address,
                        external_id, status, valid_from, valid_to, payload jsonb

── Embeddings (§9.3) ──────────────────────────────────────
embedding_spaces        code PK, model, dimension, is_active, created_at
vec_<space>             owner_type, owner_id, embedding vector(N)

── Evidence & runs ────────────────────────────────────────
validation_runs         id, institution_id, input_name, input_university,
                        trigger, state, verdict, confidence,
                        score_breakdown jsonb, policy_id, prompt_version,
                        snapshot_ids jsonb, embedding_space, code_version,
                        started_at, finished_at, duration_ms, cost_usd, error
run_steps               id, run_id, seq, name, status, started_at,
                        duration_ms, cache_hit, provider, attempt, error
                        (APPEND-ONLY — never updated in place)
evidence                id, run_id, institution_id, kind, source, tier, url,
                        title, snippet, extracted jsonb, content_hash,
                        blob_key, quality, weight_applied, observed_at
llm_calls               id, run_id, stage, model, prompt_hash, tokens_in,
                        tokens_out, latency_ms, cost_usd, cache_hit

── Policy & config ────────────────────────────────────────
scoring_policies        id, code, version, weights jsonb, required_sources[],
                        expected_max, thresholds jsonb, is_active, created_at
feature_flags           key, value, description, updated_at

── Batch & ops ────────────────────────────────────────────
batches                 id, name, source_blob_key, total, queued, succeeded,
                        failed, state, created_at, finished_at
batch_items             id, batch_id, row_no, input_name, input_university,
                        state, run_id, error, attempts
dead_letters            id, kind, payload jsonb, error, attempts,
                        last_attempt_at, resolved_at
provider_health         provider, state, failures, opened_at, last_success_at,
                        p50_ms, p95_ms, engine_failures jsonb, updated_at
metrics_hourly          hour, tier, verdict, count, p50_ms, p95_ms,
                        cache_hits, cost_usd
audit_log               id, actor, action, entity, entity_id, before jsonb,
                        after jsonb, reason, created_at
```

**Indexes**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX ON institutions           USING GIN (normalized_name gin_trgm_ops);
CREATE INDEX ON institution_identities USING GIN (normalized_name gin_trgm_ops);
CREATE INDEX ON registry_entries       USING GIN (normalized_name gin_trgm_ops);
CREATE INDEX ON registry_entries       (authority_code, snapshot_id);
CREATE INDEX ON vec_e5small_384        USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON institutions           (verdict, valid_until);
CREATE INDEX ON validation_runs        (institution_id, started_at DESC);
CREATE INDEX ON evidence               (run_id, kind);
```

### 9.3 Embedding spaces — no hardcoded dimension

`pgvector` requires a fixed dimension per column, so multiple models mean multiple tables. **The domain model must not know which one is live.**

```
embedding_spaces
  code       "e5small_384"
  model      "intfloat/multilingual-e5-small"
  dimension  384
  is_active  true
```

Each space gets its own table (`vec_e5small_384`) created by migration. A repository reads `embedding_spaces` and routes to the active table. **No application code references a dimension or a model name.**

Upgrading a model: create the new table, backfill in the background, shadow-run both, flip `is_active`, drop the old table later. Zero downtime, no schema change to `institutions`.

> e5 models require the `query: ` / `passage: ` prefix convention. Implement it or lose meaningful accuracy.

### 9.4 Database access

`db` — `@neondatabase/serverless` HTTP driver for one-shot reads in route handlers.
`dbPooled` — `postgres.js` on `DATABASE_POOLED_URL` for transactions inside Inngest steps.

Both sit behind the same Drizzle schema so query code is identical. **Only standard Postgres features.** A non-Neon `DATABASE_URL` falls back to `postgres.js` for both, so moving to self-hosted Postgres (or pgAdmin-managed) is a two-line env change.

---

## 10. Registry ingestion — a separate pipeline

Validation never touches raw registry files.

```
download → normalize → deduplicate → snapshot → diff → VALIDATE → publish
```

The **publish gate** is the part that matters. A snapshot is not live until it passes:

- row count within ±20% of the previous published snapshot
- required columns non-null above a per-connector threshold
- duplicate `external_id` rate below threshold
- content hash differs from the previous snapshot (otherwise mark `unchanged`)

States: `running → validating → published | rejected | failed`

A truncated download, a changed page layout, or a captcha'd response produces a **rejected** snapshot with a `validation_report` explaining exactly what failed. The previous published snapshot stays active. The system never ends up with no data, and never silently serves a corrupt registry.

Ingestion is idempotent and resumable.

### Cadence

| Authority                     | Schedule  |
| ----------------------------- | --------- |
| UGC_FAKE                      | Weekly    |
| UGC, AICTE                    | Monthly   |
| NMC, PCI, NCTE, COA, INC, BCI | Monthly   |
| CBSE, CISCE, NIOS             | Monthly   |
| DigiLocker / NAD              | Monthly   |
| AISHE, NAAC, NIRF             | Quarterly |

Staggered start times so they never overlap.

---

## 11. Scoring — policies, not constants

Weights are **not hardcoded**. Each institution type has a versioned policy row, so adding a regulator is a database insert rather than a deploy.

```
scoring_policies
  code             "MEDICAL"
  version          3
  weights          { "NMC": 0.35, "UGC": 0.30, "UGC_FAKE": -1.0,
                     "AISHE": 0.15, "WEBSITE": 0.10, "WIKIDATA": 0.08,
                     "WIKIPEDIA": 0.04, "NAD": 0.10, "NAAC": 0.10 }
  required_sources ["NMC"]
  expected_max     0.85
  thresholds       { genuine: 0.75, likely: 0.45, unknown: 0.20 }
```

Policies: `ENGINEERING` · `MEDICAL` · `PHARMACY` · `NURSING` · `TEACHER_ED` · `ARCHITECTURE` · `LAW` · `UNIVERSITY` · `SCHOOL` · `GENERIC`.

### Computation

```
contribution     = weight × quality × freshness_decay
freshness_decay  = exp(-age_days / half_life_days)

score = clamp(Σ contribution / policy.expected_max, 0, 1)
      − 0.10 per unresolved conflict
```

`quality` is separate from `weight`: mirror-tier authority entry 1.0, official website 0.75, Wikipedia mention 0.40. **Weight = how much this source type counts. Quality = how good this observation is.**

### Terminal rules (first, short-circuiting)

- UGC fake-list match → `Fake`, score 1.0
- Authority entry with status `withdrawn` / `closed` → strong negative

### Verdict bands

```
score ≥ 0.75          → Genuine
0.45 ≤ score < 0.75   → Likely Genuine (needs review)
0.20 ≤ score < 0.45   → Unknown
score < 0.20          → Unverified
no evidence at all    → New (queued for deep validation)
fake-list hit         → Fake (terminal)
```

### Hard constraint

**`Genuine` requires at least one `mirror`-tier or `live`-tier authority hit.** API-tier evidence alone — Wikidata plus Wikipedia plus a good website — caps at `Likely Genuine (needs review)`. An entity existing proves it is real, not that it is recognised.

### Explainability

```
evidence → rule applied → weight → quality → freshness → contribution → score
```

```ts
Explanation {
  verdict, score,
  steps: [{ evidenceId, source, tier, rule, weight, quality,
            freshness, contribution }],
  terminalRule?, constraints[]
}
```

Rendered as: _"Genuine (0.82) — UGC recognised universities list, snapshot 2026-06-14 (+0.35); AICTE approved institutions, snapshot 2026-07-01 (+0.30); official website verified (+0.10); NAAC A++ (+0.07)."_

### Decision provenance

Every run pins `policy_id`, `prompt_version`, `snapshot_ids`, `embedding_space`, `code_version`. A verdict from three months ago can be explained precisely, and re-running with the same inputs reproduces it.

---

## 12. Workflow state machine

```
queued → discovering → verifying → reasoning → scoring → completed
            ↓            ↓           ↓           ↓
          failed       failed      failed      failed
                                                  ↓
                                              archived
   any state → cancelled
```

Legal transitions enforced in the repository; illegal ones throw. `run_steps` is append-only. Combined with Inngest's durable step history, this gives full replay without a separate event store.

---

## 13. Reliability

1. **Registry mirroring** — removes ~92% of outbound requests. Everything else is secondary.
2. **Inngest `throttle`** — `{ limit: 6, period: "10s" }` on search, shared across all runs. This is what actually prevents rate limiting under batch load.
3. **Inngest `concurrency` with a domain key** — `{ key: "event.data.hostname", limit: 2 }`. Two in-flight requests per government host globally, regardless of batch size.
4. **Redis circuit breakers** — per provider. 5 failures in 60s → open 120s → half-open probe.
5. **Graceful degradation.**

| Down                    | Behaviour                                                      |
| ----------------------- | -------------------------------------------------------------- |
| Redis                   | In-memory LRU, reduced hit rate                                |
| Search                  | Mirror-only, `degraded: true`, reduced confidence              |
| Browser worker          | Static extraction only                                         |
| LLM                     | Rules-only verdict, forced `needsReview`                       |
| A live authority portal | `check-unavailable` evidence, confidence reduced, not an error |

**A validation always produces a verdict.** Worst case that verdict is `Unknown` with a listed reason.

Plus: distributed locks so concurrent requests for the same institution collapse into one run; Inngest idempotency keys so replays are free; a dead-letter table with one-click requeue.

### Feature flags

Runtime values in the DB, cached in Redis 60s, env only as defaults:

```
USE_GOOGLE_CSE · USE_BROWSER · USE_LLM_REASONING · USE_LIVE_AUTHORITIES
USE_VECTOR_SEARCH · USE_WIKIDATA · STRICT_ROBOTS · READ_ONLY_MODE
```

### Legal and ethical guardrails

Respect `robots.txt`. Identify the crawler honestly via `CRAWLER_USER_AGENT` with a contact URL. Per-host concurrency 2 with delays. Cache aggressively so each page is fetched once. Store snapshot provenance so any published verdict traces to an official source and date. Keep the manual-override path and the needs-review band — **never let an automated `Fake` verdict publish without the fake-list citation attached.**

---

## 14. Observability

**Trace context** — `runId` and `requestId` propagate through every Inngest step, DB query, and external call via `AsyncLocalStorage`.

```
validation_duration_seconds{tier,state}
cache_hit_ratio{layer}                    -- L0, L1, L2 separately
searxng_engine_failures_total{engine}     -- the early warning
live_enricher_invocations_total{code}     -- should trend toward zero
enricher_duration_seconds{code,tier}
registry_snapshot_age_seconds{authority}
llm_cost_usd_total · llm_tokens_total{stage,model}
browser_render_total{outcome} · browser_worker_queue_depth
gcse_quota_remaining · queue_depth · circuit_breaker_state{provider}
```

Dashboards: cache hit ratio by tier · cost split (LLM / browser / search) · registry freshness per authority · provider latency histograms.

Errors: Sentry with `runId` tagged, PII scrubbed, expected `AppError`s below warning level.

---

## 15. Cost

| Item                                           | Monthly          |
| ---------------------------------------------- | ---------------- |
| Vercel Pro                                     | $20              |
| Neon (scale-to-zero, 10 GB)                    | $19              |
| Upstash Redis                                  | $5–15            |
| Inngest                                        | $0–50            |
| VPS (Hetzner CX22)                             | $5               |
| Search + embeddings                            | $0 — self-hosted |
| LLM (Gemini Flash dev / self-hosted Qwen prod) | $0–40            |
| Blob + Sentry + Axiom                          | $0–20            |
| **Total**                                      | **$49–170**      |

---

## 16. Considered and rejected

| Proposal                                                          | Decision | Reason                                                                                                                             |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Port the legacy Python/LangGraph implementation                   | Rejected | Request-time scraping is the root cause of every latency and reliability problem. Business logic is preserved; architecture is not |
| Two SearXNG instances                                             | Rejected | Shared egress IP — no independent failure domain. One instance already isolates per-engine                                         |
| Wikidata as a SearchProvider                                      | Rejected | Category error. It returns structured entity facts, not ranked links; it can't substitute for a search engine in a failover chain  |
| Rename `SearchProvider` → `AuthorityResolver` / `ContactResolver` | Rejected | Those are Verification enrichers, not Discovery resolvers. Renaming re-merges the §8 boundary                                      |
| Separate event store                                              | Rejected | Inngest is already a durable event log with full replay. Append-only `run_steps` covers the query side                             |
| Browser pool → context pool → page pool                           | Rejected | Context reuse bleeds cookies and storage between unrelated sites and leaks memory                                                  |
| JSON Schema as source of truth, generate Zod                      | Rejected | Zod already is the source of truth and can emit JSON Schema. Codegen adds a toolchain for no benefit                               |
| Playwright on Vercel                                              | Rejected | Chromium ~280 MB against the bundle cap; `@sparticuz/chromium-min` runs 4–8× slower with severe cold starts                        |
| Paid search API (Brave / Serper)                                  | Deferred | Not needed at current volume. `SearchProvider` stays shaped so adding one is a single file plus an env change                      |
| Firecrawl                                                         | Deferred | Behind a feature flag if the browser worker proves insufficient. Not in v1                                                         |
| LangGraph                                                         | Rejected | Inngest provides the durability, retries, concurrency control and idempotency the orchestration needs                              |

---

---

# PART II — SELF-HOSTED INFRASTRUCTURE

---

## 17. Topology and sizing

**On Vercel:** UI, route handlers, Inngest functions.
**On one VPS:** Caddy, SearXNG, Valkey, browser worker, embeddings.

```
Vercel ──bearer token──> Caddy ──> searxng | browser-worker | tei
                                      ↑
                                   valkey
```

Vercel egress IPs are dynamic, so IP allowlisting is out — every VPS endpoint sits behind a Caddy bearer-token header matcher.

| Component                   | RAM steady  | RAM peak    |
| --------------------------- | ----------- | ----------- |
| Caddy                       | 30 MB       | 60 MB       |
| Valkey                      | 60 MB       | 150 MB      |
| SearXNG                     | 250 MB      | 400 MB      |
| Browser worker (2 contexts) | 700 MB      | **1.6 GB**  |
| TEI (e5-small, CPU)         | 600 MB      | 900 MB      |
| **Total**                   | **~1.6 GB** | **~3.1 GB** |

**Hetzner CX22** (2 vCPU / 4 GB / €3.79) is comfortable. CX32 (8 GB / €6.80) gives headroom for a larger browser pool.

> **IP reputation:** Hetzner ranges are heavily flagged by Google and Bing. Since those engines are disabled (§18), this doesn't matter. Re-enabling them would need a residential proxy — at which point paid search is cheaper. Don't go down that road.

### Why one SearXNG instance, not two

Both would share an egress IP, and upstream blocking is IP/ASN-level — no independent failure domain, which is the entire point of failover. A single instance already queries its engines in parallel and degrades per-engine. The only benefit of a second container was throughput, and that's `UWSGI_WORKERS`.

Real failover comes from a **different mechanism**: direct DuckDuckGo HTML, then Google CSE.

### Search chain

```
SearXNG → DuckDuckGo HTML → Google CSE (only when no credible official site found)
```

Google CSE has a hard 100/day counter in Redis and is never in the default chain — it is invoked explicitly with a reason.

Wikidata and Wikipedia are **not** in this chain. They are verification enrichers, and Wikidata additionally acts as an identity resolver in Discovery via `P856`.

---

## 18. Configuration files

### 18.1 `docker-compose.yml`

```yaml
# /opt/uv-infra/docker-compose.yml
name: uv-infra

x-logging: &default-logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      INFRA_TOKEN: ${INFRA_TOKEN}
      DOMAIN: ${DOMAIN}
    logging: *default-logging

  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
    command: >
      valkey-server --save "" --appendonly no
      --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes: [valkey_data:/data]
    logging: *default-logging

  searxng:
    image: searxng/searxng:latest # PIN TO A DIGEST — see §19.3
    restart: unless-stopped
    depends_on: [valkey]
    volumes:
      - ./searxng:/etc/searxng:rw
    environment:
      SEARXNG_BASE_URL: https://search.${DOMAIN}/
      SEARXNG_SECRET: ${SEARXNG_SECRET}
      UWSGI_WORKERS: 4
      UWSGI_THREADS: 4
    logging: *default-logging

  browser-worker:
    build: ./browser-worker
    restart: unless-stopped
    environment:
      PORT: 3000
      BROWSER_POOL_SIZE: 2
      MAX_RENDER_MS: 20000
      RECYCLE_AFTER_RENDERS: 50
      MAX_QUEUE_DEPTH: 20
      AUTH_TOKEN: ${INFRA_TOKEN}
    shm_size: 1gb # REQUIRED — Chromium hard-crashes on Docker's 64MB default
    init: true # REQUIRED — reaps zombie Chromium processes
    mem_limit: 2g
    logging: *default-logging

  tei:
    image: ghcr.io/huggingface/text-embeddings-inference:cpu-latest
    restart: unless-stopped
    command: --model-id intfloat/multilingual-e5-small --port 3000
    volumes: [tei_cache:/data]
    mem_limit: 1500m
    logging: *default-logging

volumes:
  caddy_data: {}
  caddy_config: {}
  valkey_data: {}
  tei_cache: {}
```

**The two settings that cost hours if missed:** `shm_size: 1gb` and `init: true`.

### 18.2 SearXNG `settings.yml`

A default install works on a laptop and then quietly degrades to near-zero results within 3–10 days on a VPS. Three causes:

| Problem                                                                                                | Fix                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **JSON output disabled by default** → 403 on `?format=json`, and you assume the instance is broken     | `search.formats: [html, json]`                                    |
| **Google and Bing block datacenter IPs** within days — results silently thin out with no errors logged | Disable both. Enable Mojeek, DuckDuckGo, Brave, Marginalia, Qwant |
| **The limiter needs Valkey** or it fails open / throws 429s at your own app                            | `server.limiter: false` — the instance is private                 |

| Engine        | Own index?        | Datacenter-IP tolerance | Decision                  |
| ------------- | ----------------- | ----------------------- | ------------------------- |
| Mojeek        | Yes               | High                    | **Enable** — most durable |
| DuckDuckGo    | No (Bing-derived) | Medium-high             | **Enable**                |
| Brave         | Yes               | Medium-high             | **Enable**                |
| Marginalia    | Yes               | High                    | **Enable**                |
| Qwant         | Partly            | Medium                  | Enable                    |
| Startpage     | No (Google proxy) | Low                     | Disable                   |
| Google / Bing | —                 | **Very low**            | **Disable**               |
| Yandex        | Yes               | Low                     | Disable                   |

```yaml
# /opt/uv-infra/searxng/settings.yml
use_default_settings: true

general:
  instance_name: "uv-search"
  debug: false
  contact_url: false
  enable_metrics: true

server:
  secret_key: "${SEARXNG_SECRET}" # REQUIRED — openssl rand -hex 32
  base_url: "https://search.your-domain.tld/"
  limiter: false # private instance
  public_instance: false
  image_proxy: false
  method: "GET"

search:
  formats: # THE CRITICAL LINE — json is off by default
    - html
    - json
  safe_search: 0
  autocomplete: ""
  default_lang: "en"
  max_page: 2

# Older SearXNG versions use `redis:` instead of `valkey:`.
# Check container logs on first boot — a wrong key is silently ignored.
valkey:
  url: redis://valkey:6379/0

outgoing:
  request_timeout: 6.0
  max_request_timeout: 12.0
  pool_connections: 100
  pool_maxsize: 20
  enable_http2: true

engines:
  - { name: google, disabled: true }
  - { name: google news, disabled: true }
  - { name: bing, disabled: true }
  - { name: bing news, disabled: true }
  - { name: startpage, disabled: true }
  - { name: yandex, disabled: true }

  - { name: mojeek, disabled: false, timeout: 6.0 }
  - { name: duckduckgo, disabled: false, timeout: 6.0 }
  - { name: brave, disabled: false, timeout: 6.0 }
  - { name: marginalia, disabled: false, timeout: 6.0 }
  - { name: qwant, disabled: false, timeout: 6.0 }

  # Disable every image / video / music / social / package-registry engine.
```

### 18.3 `Caddyfile`

```caddyfile
{
	email you@your-domain.tld
}

(private) {
	@unauthorized not header Authorization "Bearer {env.INFRA_TOKEN}"
	respond @unauthorized "forbidden" 403
	header {
		-Server
		Strict-Transport-Security "max-age=31536000"
	}
}

search.{$DOMAIN} {
	import private
	reverse_proxy searxng:8080
}

browser.{$DOMAIN} {
	import private
	reverse_proxy browser-worker:3000
	request_body { max_size 2MB }
}

embed.{$DOMAIN} {
	import private
	reverse_proxy tei:3000
}
```

UFW allowing only 80/443/22, SSH key-only. That is the whole security surface.

---

## 19. Browser worker and operations

### 19.1 Browser worker design

**Pool browsers. Create a fresh context per request. Close it in a `finally` block.**

Reusing contexts was considered and rejected: cookie and storage bleed between unrelated sites, fingerprint contamination, progressive memory leaks. For arbitrary third-party sites this is a correctness hazard, not an optimisation.

Throughput comes from **resource blocking** (abort `image`, `font`, `media`, `stylesheet` — roughly halves render time), a **warm pool**, and a **bigger pool** if cores allow.

```
POST /render { url, waitFor?, screenshot?, timeoutMs? }
  → { html, finalUrl, screenshotBase64?, timings, consoleErrors[] }

GET /health
  → { poolSize, busy, queued, rendersSinceRecycle, uptime, memoryMB }
```

Hard 20s timeout · SSRF guard (resolve DNS, reject private/link-local, reject non-`http(s)`, hostname denylist) · recycle every 50 renders and on crash · bounded queue (20) → **503 when full** · bearer auth except `/health` · `FROM mcr.microsoft.com/playwright`, non-root.

**Invoked only when `needsJavaScript(html)` is true** for the official-site candidate. Expected hit rate **5–10% of pages** — Cheerio handles the rest. If `BROWSER_SERVICE_URL` is unset or `USE_BROWSER` is off, `RenderProvider` returns `{ rendered: false }` and the pipeline degrades to static extraction.

### 19.2 The one metric that matters

`unresponsive_engines` in the SearXNG JSON response.

When an upstream starts blocking you, SearXNG **doesn't error** — it returns `200` with fewer results and lists the failed engine there. Track failure counts per engine and alert above a 20% failure rate over an hour.

**Treat "200 OK + zero results + non-empty `unresponsive_engines`" as a circuit-breaker failure. Never cache it as a valid miss.** This check is the difference between noticing in an hour and noticing when someone reports bad verdicts three weeks later.

### 19.3 Recovery playbook

| Symptom                                  | Action                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| One engine failing >20% for 1h           | Disable it in `settings.yml`, restart, promote a replacement from §18.2                                                 |
| All engines thin                         | Check VPS egress isn't rate-limited; confirm Mojeek is enabled; temporarily widen the Google CSE trigger                |
| Latency p95 > 8s                         | SearXNG and the browser worker are competing for CPU. Raise `UWSGI_WORKERS`, lower `BROWSER_POOL_SIZE`, or move to CX32 |
| Empty results for names that should work | Verify `formats: [html, json]` survived a container image update — this resets on some upgrades                         |
| Browser worker OOM                       | Confirm `shm_size` and `init: true`; lower `BROWSER_POOL_SIZE` to 1; check `RECYCLE_AFTER_RENDERS`                      |

**Pin image digests, not `:latest`.** SearXNG will eventually ship a config schema change that silently drops the JSON format setting. Re-run `infra/verify.sh` after every upgrade.

---

---

# PART III — BUILD PLAN

---

## 20. Rules for every prompt

### 20.1 Session procedure

1. **`/clear`** — one prompt per session.
2. **Open with:** _"Read `CLAUDE.md` and `MASTER-PLAN.md` Parts 0–II. Plan before writing code."_
3. Paste the prompt from §22.
4. **Append the standing block below, every time.**
5. Verify the acceptance criteria yourself before moving on.

Use plan mode (`shift+tab` twice) for **Prompts 4, 5, 12, 13** — the most design surface.

### 20.2 Standing instruction block — append to every prompt

```
── STANDING INSTRUCTIONS (apply to every task) ──

Before writing code:
  1. Explain your implementation plan in 5–10 lines.
  2. List every file you will create or modify.
  3. Wait for nothing — proceed once the list is stated.

While working:
  4. Implement ONLY this subsystem. Do not touch unrelated modules.
  5. Do not refactor completed modules unless required for correctness.
     If a change to a completed module IS required, say why before doing it.
  6. Keep the application runnable. `pnpm build` must succeed at the end.
  7. If a decision is ambiguous, choose the option consistent with
     MASTER-PLAN.md and state the assumption in one line. Do not stop to ask.

Before finishing:
  8. Run: pnpm typecheck && pnpm lint && pnpm test
  9. Fix every failure. Do not report success with failing checks.
 10. Output a verification checklist:
       - files created / modified
       - env vars added (also added to .env.example?)
       - tests added and what they prove
       - anything deferred, and to which prompt
 11. One conventional commit. No unrelated changes.
```

### 20.3 Dependency order

```
0 → 1 → 2 → 3 → 4 → 5 ─┐
                       ├→ 12 → 13 → 14 ─┬→ 16 → 17 → 18 → 19 → 20 → 21
    6 → 7 → 8 → 9 → 10 ┤                │
                    11 ┘        15 ─────┘
```

Prompt 15 (design system) is independent and can run in a parallel worktree.

### 20.4 Mapping to the earlier 18-phase roadmap

Nothing from the original roadmap was dropped. Four prompts were added.

| Original phase                           | Prompt(s) here                                              |
| ---------------------------------------- | ----------------------------------------------------------- |
| 1. Master architecture and planning      | Parts 0–II of this document + Prompt 0                      |
| 2. Initialize Next.js and design system  | Prompt 0 (init) + Prompt 15 (design system)                 |
| 3. Static dashboard UI                   | Prompt 15                                                   |
| 4. Database schema + Drizzle abstraction | Prompt 2                                                    |
| 5. API foundation                        | Prompt 14                                                   |
| 6. Inngest orchestration                 | Prompt 13                                                   |
| 7. Redis cache                           | Prompt 3                                                    |
| 8. Search providers                      | Prompt 7                                                    |
| 9. Name resolution                       | Prompt 5                                                    |
| 10. Website extraction                   | Prompt 6                                                    |
| 11. Statutory scrapers                   | **Prompt 4 (mirror ingestion) + Prompt 8 (live fallback)**  |
| 12. Evidence store                       | Prompt 9                                                    |
| 13. LLM abstraction                      | Prompt 10                                                   |
| 14. Confidence engine                    | Prompt 11                                                   |
| 15. Frontend/backend integration         | Prompts 16–17                                               |
| 16. Batch processing + cron              | Prompts 18–19                                               |
| 17. Observability                        | Prompt 20                                                   |
| 18. Production optimization              | Prompt 21                                                   |
| — _added_                                | **Prompt 1** — self-hosted infrastructure                   |
| — _added_                                | **Prompt 8** — verification enrichers (split from scrapers) |
| — _added_                                | **Prompt 12** — validation orchestrator                     |
| — _added_                                | **Prompt 17** — records / overview / sources pages          |

> The most significant change: **phase 11 splits in two.** Statutory checking is primarily _ingestion_ (Prompt 4), not _scraping_ (Prompt 8). That inversion is the core of this architecture.

### 20.5 Repository layout

```
university-validator/
├── CLAUDE.md
├── MASTER-PLAN.md
├── docs/            SOURCES.md · LEGACY-NOTES.md · RUNBOOK.md
│                    BENCHMARKS.md · DECISIONS/
├── infra/           docker-compose.yml · Caddyfile · searxng/
│                    browser-worker/ · README.md · verify.sh
├── src/
│   ├── app/         (dashboard)/ · api/{validate,stream,institutions,
│   │                batches,health,stats,metrics,inngest}/
│   ├── components/  ui/ (shadcn) · domain/
│   ├── server/
│   │   ├── db/          client · schema/ · migrations/ · queries/
│   │   ├── cache/       redis · keys · cache · locks · ratelimit
│   │   │                circuit-breaker · flags
│   │   ├── registry/    types · runner · diff · lookup · connectors/
│   │   ├── matching/    normalize · abbreviations · trigram · embeddings
│   │   │                identity · resolver
│   │   ├── fetch/       http · extract · render · robots
│   │   ├── search/      types · factory · providers/    ← Discovery only
│   │   ├── discovery/   types · resolvers/ · website · service
│   │   ├── verification/ types · applicability · enrichers/ · service
│   │   ├── evidence/    store · quality · collector · project
│   │   ├── llm/         gateway · providers · schemas · prompts/
│   │   ├── scoring/     policies · engine · policy · explain
│   │   ├── services/    validation · institution · batch
│   │   └── observability/ logger · metrics · tracing
│   ├── inngest/     client · channels · functions/
│   └── lib/         env · errors · result · types
├── tests/           unit/ · integration/ · e2e/ · fixtures/
└── scripts/         seed · ingest · bench-matching · bootstrap · smoke
```

---

## 21. `CLAUDE.md`

Created in Prompt 0. This is what keeps sessions on-architecture across a 22-prompt build.

```markdown
# CLAUDE.md — University Validation Platform

## The legacy folder

`University_Validation(20-07)` in this workspace is a WORKING PYTHON
IMPLEMENTATION. Treat it as a REQUIREMENTS DOCUMENT, NOT a codebase to port.

TAKE from it: statutory body list, real registry URLs and form fields in
src/scrapers/\*.py, the \_ABBREVIATIONS dictionary, categorisation rules,
DigiLocker field semantics, duplicate-detection weights, stored evidence
fields.

DO NOT COPY: its architecture, folder structure, Python implementation,
LangGraph workflow, synchronous request flow, 3-table schema, or
search_tool.py. Reimplement using the event-driven design in MASTER-PLAN.md.

## Non-negotiable rules

1. Statutory verification reads from the REGISTRY MIRROR. Live scraping is a
   fallback, runs only inside an Inngest function, never in a route handler.
2. Playwright never runs on Vercel and never appears in the root
   package.json. Browser work goes through RenderProvider → the external
   browser worker over HTTP.
3. Route handlers do bounded work only (<1s). Anything unbounded sends an
   Inngest event and returns 202 + runId.
4. Discovery is the ONLY stage that performs open web search.
   Verification NEVER imports from src/server/search or src/server/discovery.
5. The LLM never receives raw HTML. Only normalized evidence JSON.
6. The confidence score is arithmetic (src/server/scoring), never LLM output.
7. No hardcoded scoring weights — they live in the scoring_policies table.
8. No hardcoded embedding dimension or model name — read embedding_spaces.
9. All external calls go through an interface with timeout, retry, circuit
   breaker, health recording, and a defined degradation behaviour.
10. Standard Postgres only. No Neon-specific SQL. One DATABASE_URL.
11. Every LLM call uses generateObject + a Zod schema, via src/server/llm
    only. Switching Gemini → Qwen must require env changes ONLY.
12. Every evidence row carries source, url, content_hash, observed_at.
13. No `any`. No non-null assertions. Errors are typed via Result<T, AppError>.

## Conventions

- TypeScript strict. Zod at every boundary: env, API, LLM output, CSV rows.
- Drizzle only. Raw SQL via sql`` template, confined to src/server/db/queries/.
- Server code never imported into client components. Use `server-only`.
- Services take injected dependencies so they are unit-testable without network.
- run_steps is append-only. Never update a step row in place.
- Structured logging via `logger` only. No console.log in src/server.

## Design tokens (do not invent alternatives)

- Font: Bricolage Grotesque (headings, brand, numerals);
  system/Inter stack for dense table body text; JetBrains Mono for
  IDs, hashes, and scores.
- Primary #2563EB — INTERACTIVE ELEMENTS ONLY (buttons, links, focus).
  Never a verdict colour.
- Verdicts: Genuine #22C55E · Likely Genuine #06B6D4 · Unknown #F59E0B ·
  Unverified neutral-500 · Fake #EF4444
- Dark-first neutral dashboard; light mode supported and tested.
- Framer Motion for progress/timeline/streaming transitions only.
  No decorative animation. Respect prefers-reduced-motion.

## Definition of done

- pnpm typecheck && pnpm lint && pnpm test pass
- pnpm build && pnpm start works
- New env vars in src/lib/env.ts AND .env.example
- MASTER-PLAN.md updated if the design changed
- One conventional commit, no unrelated changes

## Never

- Never rewrite files outside the current task's scope.
- Never refactor a completed module unless correctness requires it.
- Never add LangGraph, Python, or a second backend server.
- Never invent registry URLs. Unknown source → check the legacy scrapers
  first; if still unknown, stub with a fixture, mark needs-source, and add
  a row to docs/SOURCES.md.
```

---

## 22. The prompts

### Prompt 0 — Foundation and legacy extraction

```
Two tasks: initialize the project, and mine the legacy folder for
requirements. No feature code.

── PART A: mine the legacy implementation ──

`University_Validation(20-07)` exists in this workspace. Read it ONLY to
extract business requirements. Do NOT copy its architecture, folder
structure, Python code, LangGraph workflow, or synchronous request flow.

Produce docs/LEGACY-NOTES.md containing:
  1. Every statutory body it supports, what each governs, and which scraper
     file implements it.
  2. FOR EACH SCRAPER in src/scrapers/*.py — the exact request details:
     base URL, HTTP method, query/form parameters, pagination mechanism,
     whether it needs JavaScript, and the response shape. This is the most
     valuable output of this prompt.
  3. The full _ABBREVIATIONS dictionary from src/name_resolver.py,
     transcribed as a TypeScript const.
  4. The categorisation rules from src/nodes.py (categorisation_node and
     final_assessment_node) — what made something Genuine / Fake / Unknown /
     New.
  5. DigiLocker field semantics from src/digilocker.py — specifically the
     difference between is_on_digilocker and is_in_nad.
  6. The duplicate-detection weights (NAME_WEIGHT, ADDRESS_WEIGHT) and how
     they were combined.
  7. Every field the old 3-table schema stored, so we can confirm no data
     loss against the new schema in MASTER-PLAN.md §9.2.

Then populate docs/SOURCES.md: one row per authority with the real source
URL and format recovered from the legacy scrapers, marked "recovered" or
"needs-source" where the legacy code was also incomplete.

── PART B: initialize the project ──

Next.js 15 (App Router, TS strict, Tailwind v4, pnpm), project name
"university-validator".

 1. tsconfig strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
    Path alias @/* → src/*.
 2. ESLint flat config + Prettier. Include a no-restricted-imports rule
    scaffold (rules filled in Prompt 8) and a rule banning console.log in
    src/server/**.
 3. Install the dependency set in MASTER-PLAN.md §4. Initialize shadcn/ui
    (neutral base, CSS variables). DO NOT install playwright at the root.
 4. Vitest: node env for src/server, jsdom for components. One passing test.
 5. src/lib/env.ts — Zod-validated server/client env schemas, fail fast at
    boot with a readable message. Cover EVERY variable in MASTER-PLAN.md §3.
    Copy that section verbatim into .env.example.
 6. src/lib/errors.ts — AppError taxonomy: ValidationError, NotFoundError,
    UpstreamError(provider, status), TimeoutError, RateLimitError,
    CircuitOpenError, BudgetExceededError, ConfigError. Each with a stable
    code, retryable flag, and safe publicMessage.
 7. src/lib/result.ts — Result<T,E> with ok/err/tryAsync.
 8. src/server/observability/logger.ts — pino, structured JSON, secret
    redaction, withContext({ runId, requestId }).
 9. vercel.json: fluid compute on, maxDuration 300 for /api/inngest and
    /api/validate.
10. CLAUDE.md at repo root — the exact content in MASTER-PLAN.md §21.
11. GitHub Actions CI: typecheck, lint, test, build.

No database, Redis, Inngest, or providers yet.
```

**Done when:** `pnpm dev` serves a placeholder; a missing env var fails with a clear message; `docs/LEGACY-NOTES.md` contains real registry URLs.

---

### Prompt 1 — Infrastructure (VPS)

```
Create infra/ at the repo root, implementing MASTER-PLAN.md Part II exactly.

1. infra/docker-compose.yml — §18.1 verbatim. browser-worker MUST set
   shm_size: 1gb and init: true. Pin image digests, not :latest.

2. infra/searxng/settings.yml — §18.2 verbatim. Critical:
   - search.formats: [html, json]   ← JSON is off by default
   - server.limiter: false          ← private instance
   - DISABLE google, google news, bing, bing news, startpage, yandex
   - ENABLE mojeek, duckduckgo, brave, marginalia, qwant
   - disable every image/video/music/social/package engine

3. infra/Caddyfile — §18.3 verbatim.

4. infra/browser-worker/ — Fastify + Playwright per §19.1:
   - pool of browsers (default 2). FRESH CONTEXT PER REQUEST, closed in a
     finally block. Do NOT pool or reuse contexts.
   - route interception blocking image/font/media/stylesheet
   - POST /render and GET /health with the §19.1 contracts
   - SSRF guard: resolve DNS, reject private/link-local ranges, reject
     non-http(s) schemes, hostname denylist
   - recycle every RECYCLE_AFTER_RENDERS (50) and on any crash
   - bounded queue (MAX_QUEUE_DEPTH 20) → 503 when full
   - bearer auth on all routes except /health
   - Dockerfile FROM mcr.microsoft.com/playwright, non-root user
   - Vitest tests against a local static fixture server

5. infra/README.md — provisioning runbook: VPS, Docker, three DNS A records,
   generate INFRA_TOKEN and SEARXNG_SECRET (openssl rand -hex 32), .env,
   docker compose up -d, curl verification for each vhost.

6. infra/verify.sh — asserts: SearXNG returns JSON with non-empty results AND
   an empty unresponsive_engines array; the browser worker renders a JS-heavy
   fixture; TEI returns a 384-dim vector; every endpoint 403s without the
   bearer token.

7. .github/workflows/infra.yml — lint compose, build the browser-worker image
   on changes under infra/.

Playwright must appear ONLY in infra/browser-worker/package.json.
```

**Done when:** `bash infra/verify.sh` passes against the deployed box.

---

### Prompt 2 — Database schema

```
Implement the database layer with Drizzle against standard Postgres.

1. src/server/db/client.ts — a factory exporting `db`
   (@neondatabase/serverless HTTP, for one-shot reads in route handlers) and
   `dbPooled` (postgres.js on DATABASE_POOLED_URL, for transactions in
   Inngest steps). Same Drizzle schema behind both. A non-Neon DATABASE_URL
   falls back to postgres.js for both, so production can be any PostgreSQL.

2. src/server/db/schema/ split by domain, matching MASTER-PLAN.md §9.2
   exactly. Key points:
   - institution_identities replaces flat aliases AND registry links.
     One row per (institution, source, external_id) storing name_as_source.
   - institution_aliases is a MATERIALIZED VIEW over institution_identities
     plus a manual-additions table.
   - embedding_spaces registry + one vec_<space> table per space. NO
     dimension or model name anywhere in application code.
   - scoring_policies, feature_flags, audit_log.
   - run_steps append-only (no updated_at; enforce in the repository).
   - validation_runs carries policy_id, prompt_version, snapshot_ids,
     embedding_space, code_version.
   pgEnum for: institution_type, verdict, run_state, step_status,
   evidence_kind, evidence_tier, source_code, snapshot_state, batch_state,
   identity_source, provider_state.
   timestamptz everywhere; jsonb not json.

3. Migration enabling pg_trgm, unaccent, vector, btree_gin and creating every
   index in §9.2 including the HNSW index on vec_e5small_384.

4. src/server/db/queries/ — typed modules, no business logic: institutions,
   identities, registry, runs, evidence, batches, policies, flags, audit.
   Cursor-based pagination helpers (never OFFSET on large tables).

5. scripts/seed.ts — seeds authorities (17 rows from §6), scoring_policies
   (10 rows from §11), embedding_spaces (e5small_384 active), feature_flags,
   ~20 well-known institutions, and 5 UGC fake-list fixtures.
   Cross-check field coverage against docs/LEGACY-NOTES.md item 7 — every
   field the old system stored must have a home.

6. Integration tests (Testcontainers Postgres or TEST_DATABASE_URL):
   migrations apply cleanly, trigram ordering is correct, the HNSW index is
   used (assert via EXPLAIN), cursor pagination is stable, the aliases view
   refreshes, a run_steps UPDATE is rejected.
```

**Done when:** `pnpm db:migrate && pnpm db:seed` works; EXPLAIN confirms index usage.

---

### Prompt 3 — Redis layer

```
Implement src/server/cache/ with Upstash Redis (REST client).

1. redis.ts — singleton, lazy init, in-memory no-op implementation when
   Upstash env vars are absent so tests and offline dev work.
2. keys.ts — typed key builders with a KEY_VERSION prefix:
   verdict:{name} 6h · inst:{id} 1h · search:{provider}:{hash} 7d ·
   page:{urlHash} 24h · llm:{stage}:{hash} 30d · embed:{textHash} 90d ·
   lock:validate:{name} 60s · cb:{provider} · quota:gcse:{date} ·
   flags:all 60s
3. cache.ts — cached<T>(key, ttl, loader) with stale-while-revalidate,
   single-flight via lock, size guard (skip >200KB), and per-layer hit/miss
   counters (L0/L1/L2 tracked separately).
4. locks.ts — withLock(key, ttlMs, fn) via SET NX PX with a fencing token
   and auto-extension.
5. ratelimit.ts — @upstash/ratelimit sliding windows per provider plus a
   global limiter for /api/validate.
6. circuit-breaker.ts — Redis-backed closed → open (5 failures/60s) → 120s →
   half-open. withBreaker(provider, fn) throws CircuitOpenError when open and
   records latency into provider_health asynchronously.
7. flags.ts — feature flags read from the DB, cached in Redis 60s, env only
   as defaults. isEnabled(flag) everywhere; no direct env reads for flags.

Unit tests against the in-memory impl; integration tests gated on env
presence. Prove single-flight with 50 concurrent misses calling the loader
exactly once.
```

---

### Prompt 4 — Registry ingestion pipeline

**The most important prompt in the project.** See §10.

```
Implement src/server/registry/. Validation must never touch raw registry
files. Use docs/LEGACY-NOTES.md (Prompt 0, item 2) for the real source URLs
and request shapes.

1. types.ts — RegistryConnector:
   { code, displayName, sector, cadence, fetch(ctx): AsyncIterable<RawRow>,
     parse(raw): EntryDraft, sourceUrls, validation: ValidationRules }

2. runner.ts — ingestRegistry(code):
   download → normalize → deduplicate → snapshot → diff → VALIDATE → publish
   - create a registry_snapshots row (state=running)
   - stream rows, normalize names, upsert into registry_entries under the
     new snapshot_id
   - compute a content hash; identical to previous → state=unchanged, stop
   - VALIDATE GATE (state=validating) before anything goes live:
       * row count within ±20% of the last published snapshot
       * required columns non-null above the connector's threshold
       * duplicate external_id rate below threshold
     Failing any check → state=rejected, previous snapshot STAYS published,
     write a validation_report jsonb naming exactly what failed.
   - passing → state=published, previous superseded, valid_to set
   - hard failure → state=failed, previous stays published
   - raw payload to Vercel Blob keyed by content hash
   Idempotent and resumable.

3. diff.ts — diffSnapshots(prev, next) → added/removed/changed, so the
   dashboard can show "AICTE 2026-07-01: +214, −38".

4. connectors/ — one per authority, each with fixture-based tests using a
   captured sample under tests/fixtures/registry/:
   ugc-recognized · ugc-fake · aicte · aishe · ini · nmc · pci · ncte ·
   coa · inc · bci · naac · nirf · cbse · cisce · nios · digilocker
   Respect robots.txt, ≥500ms between pages, use CRAWLER_USER_AGENT.
   Use the URLs recovered in docs/LEGACY-NOTES.md. If a source is still
   unknown, DO NOT INVENT IT — stub the connector to read a fixture, mark
   status "needs-source", and record what a human must supply in
   docs/SOURCES.md.

5. lookup.ts — lookupInRegistries(normalizedName, opts) querying PUBLISHED
   snapshots only. <150ms on 200k rows. This is what validation calls.

6. scripts/ingest.ts — pnpm ingest --code=AICTE [--dry-run], printing the diff.

Tests: each connector parses its fixture; the runner is idempotent; a
truncated download is REJECTED and the previous snapshot stays published;
diff accuracy.
```

**Done when:** a deliberately truncated fixture produces `rejected` and the previous snapshot is still serving.

---

### Prompt 5 — Matching and the identity graph

**No LLM anywhere in this module.** See §8.5 and §9.1.

```
Implement src/server/matching/.

1. normalize.ts — normalizeName(raw): lowercase, NFKD + unaccent, strip
   punctuation, collapse whitespace, "&"→"and", expand ordinals, remove
   honorifics (Sri/Shri/Smt/Dr/Prof) into a `stripped` field, canonicalize
   Indian place variants (Kolkata/Calcutta, Bengaluru/Bangalore,
   Mumbai/Bombay, Thiruvananthapuram/Trivandrum, …).
   Returns { normalized, tokens, coreTokens, stripped, state?, city? } where
   coreTokens drops generic words. Pure function, ≥60 unit tests.

2. abbreviations.ts — seed from the _ABBREVIATIONS dictionary transcribed in
   docs/LEGACY-NOTES.md, then extend to 120+ entries: IIT/NIT/IIIT/IIM/AIIMS/
   JNTU-H/-K/-A, OU, CBIT, VNR VJIET, MGIT, BITS, VIT, SRM, MANIT, MNNIT …
   Typed const data, not code branches. Pattern expansion ("IIT <city>" →
   "Indian Institute of Technology <city>") and reverse contraction.
   expandVariants(normalized): string[] (max 5, most likely first).

3. trigram.ts — findTrigramCandidates({ names, sources, limit }) running
   similarity() > 0.35 across institutions, institution_identities, and
   registry_entries in ONE UNION ALL query. Must use the GIN indexes —
   assert with EXPLAIN in the test.

4. embeddings.ts — EmbeddingProvider interface. Reads the ACTIVE ROW from
   embedding_spaces for model and dimension; NO hardcoded values.
   Implementations: TEI over EMBEDDINGS_URL, Gemini for dev, deterministic
   fake for tests. e5 models require the `query: ` / `passage: ` prefix
   convention — implement it. Redis-cached by text hash, batched (64),
   retried, circuit-broken.

5. identity.ts — the identity graph:
   - linkIdentity(institutionId, { source, externalId, nameAsSource, url,
     snapshotId, matchScore, matchMethod }) — upsert; NEVER overwrite a
     different source's name
   - mergeInstitutions(fromId, toId) — repoint identities, evidence, runs;
     write an audit_log row; refresh the aliases view
   - refreshAliasView()

6. resolver.ts — resolveInstitution(input):
   exact identity hit → return (method "identity")
   → expandVariants → trigram recall (50/source) → vector rerank
   → fusion: 0.45·trgm + 0.35·vector + 0.12·stateMatch + 0.08·addressTrgm
     (the legacy system used NAME 0.6 / ADDRESS 0.4 — this generalises it)
   → ≥0.90 accept | 0.70–0.90 accept + needsReview | <0.70 new entity
   Returns every candidate with its per-signal breakdown.
   Target p95 <400ms at 100k registry rows.

7. scripts/bench-matching.ts — seeds 50k synthetic rows, reports p50/p95.

Tests: a fixture of 100 messy real-world inputs (misspellings, abbreviations,
former names, transliterations) with expected matches — target ≥90% top-1.
Plus: two registry entries with different spellings link to ONE institution
without either name being lost.
```

---

### Prompt 6 — Fetch, extract, render client

```
Implement src/server/fetch/. Playwright never runs here — only an HTTP client
to the browser worker built in Prompt 1.

1. http.ts — undici with a shared keep-alive Agent (connections 64, HTTP/2),
   connect timeout 3s / total 12s, retry with jittered backoff on 429/5xx
   honoring Retry-After (max 3), per-hostname politeness interval via Redis,
   robots.txt fetch + 24h cache + mayFetch(url) guard honoring STRICT_ROBOTS,
   5MB size cap, content-type allowlist, SSRF guard (resolve DNS, reject
   private ranges), CRAWLER_USER_AGENT on every request.
   Returns { status, headers, body, finalUrl, timings, contentHash }.
   Circuit-broken with per-hostname health recording.

2. extract.ts — cheerio:
   extractPage(html, url) → { title, description, headings, mainText
   (readability-style, 8k cap), emails, phones, addresses, socialLinks,
   outboundLinks, jsonLd, metaTags }
   India-specific: phone → E.164 (+91), PIN code detection, state detection,
   "affiliated to X" / "approved by Y" phrase mining with the matched
   sentence retained as a snippet.
   needsJavaScript(html) heuristics: body text <200 chars, empty root div,
   SPA markers, meta refresh. This gates the expensive path.

3. render.ts — RenderProvider interface:
   render({ url, waitFor, screenshot, timeoutMs }) → RenderedPage
   - HttpBrowserWorker (default): POST to BROWSER_SERVICE_URL with the
     INFRA_TOKEN bearer header
   - NoopProvider: when BROWSER_SERVICE_URL is unset or USE_BROWSER is off,
     returns { rendered: false } so the pipeline degrades instead of failing
   Renders cached in Redis by URL hash 24h; HTML content-addressed to Blob.

Tests: undici MockAgent for timeouts, retries, Retry-After, robots deny, SSRF
rejection; extract.ts against 8 committed HTML fixtures of real Indian
college sites; NoopProvider degradation.
```

---

### Prompt 7 — Discovery

See §8.1.

```
Implement src/server/search/ and src/server/discovery/.
This is the ONLY part of the codebase permitted to perform open web search.

── src/server/search/ (raw transport) ──

1. types.ts — SearchProvider { name, search(query, opts), health(),
   quotaRemaining?() }. Wikidata is NOT a SearchProvider.

2. providers/
   - searxng.ts — one instance, SEARXNG_URL + INFRA_TOKEN bearer.
     GET {base}/search?q=..&format=json&language=en&safesearch=0
     Timeout 8s — SearXNG is deliberately slow, do NOT set 3s.
     Read `unresponsive_engines` from the response into provider_health.
     CRITICAL: "200 OK + zero results + non-empty unresponsive_engines" is a
     FAILURE for circuit-breaker and caching purposes. Never cache it as a
     valid miss — silent empties are the characteristic failure mode.
   - duckduckgo.ts — html.duckduckgo.com/html/?q=, cheerio-parsed, no key,
     max 1 req / 2s globally via a Redis lock.
   - google-cse.ts — CONDITIONAL, not a general fallback. Daily quota counter
     in Redis (limit 100, INCR-then-check). Only invoked via
     search(q, { reason: "no-official-site" }). Gated on USE_GOOGLE_CSE.
     Returns [] when exhausted.

3. factory.ts — chain from SEARCH_CHAIN, default "searxng,duckduckgo".
   google-cse is NOT in the default chain. Skips open breakers and exhausted
   quotas. Redis cache 7d, plus NEGATIVE caching 6h for genuine zero-result
   queries. Returns { results, providersUsed, cached, failovers, degraded }.
   searchMany() concurrency 3 — it is one box.

4. queries.ts — labeled templates with a priority field. Issue the top 3 by
   default (official site, approval status, fake warning); the rest only when
   post-pass confidence <0.6. Domain-priority scoring (*.gov.in / *.ac.in /
   *.edu.in / *.nic.in above aggregators) + aggregator blacklist.

5. health.ts — getSearchHealth(): breaker state, p50/p95, 24h success rate,
   per-upstream-engine failure counts from unresponsive_engines.

── src/server/discovery/ ──

6. types.ts — ResolvedIdentity { institutionId?, canonicalName, officialUrl?,
   type, state?, district?, confidence, source, candidates[] } and
   IdentityResolver { name, resolve(input) }.

7. resolvers/ — identity layer (budget 400ms, cache 24h), in order:
   cache.ts (L0) → institutions.ts (L1, via matching/resolver)
   → mirror.ts (L2, via registry/lookup — runs BEFORE any web access)
   → wikidata.ts (SPARQL, reads P856/P131/P571; implements IdentityResolver,
     NOT SearchProvider; cache 30d; gated on USE_WIKIDATA)

8. website.ts — official website layer (budget 2s, cache 7d):
   domainGuess: candidates from acronym / acronym+city / first-word+acronym
   across .ac.in .edu.in .org.in .in .com; HEAD up to 8 (concurrency 4, 2s);
   GET survivors; accept only if <title> fuzzy-matches above 0.6.
   Falls back to search results, then google-cse if still nothing credible.

9. service.ts — discover(input): identity layer, then website layer,
   short-circuiting once it holds a canonical name plus a verified official
   URL at confidence ≥0.7. Records every resolver attempt as a run_step.
   Hard budget: 6s, 3 web queries.

Tests: provider success/timeout/error; the "empty + unresponsive engines"
detection; negative caching; the 101st daily CSE call refused with no network
request; CSE not invoked when a site was already found; domainGuess rejecting
a title mismatch; discover() short-circuiting at the mirror with zero network.
```

**Done when:** `discover("IIT Bombay")` makes zero web requests against a populated mirror.

---

### Prompt 8 — Verification enrichers

See §8.2.

```
Implement src/server/verification/.

HARD RULE, enforced in CI: no file here may import from src/server/search or
src/server/discovery. Add the ESLint no-restricted-imports rule AND an
architecture test asserting it.

1. types.ts — the Enricher interface (§8.2).

2. applicability.ts — relevantSources(identity): SourceCode[]
   engineering → AICTE, UGC, NAAC · medical → NMC, UGC · dental → NMC, UGC
   pharmacy → PCI, AICTE, UGC · nursing → INC, UGC · teacher ed → NCTE, UGC
   architecture → COA, AICTE, UGC · law → BCI, UGC
   university → UGC, AISHE · school → CBSE, CISCE, NIOS, state board
   ALWAYS included: UGC_FAKE, AISHE, WIKIDATA, WEBSITE, NAD.
   Cross-check against the authority mapping in docs/LEGACY-NOTES.md item 1.
   Export it for scoring/ too, so a medical college is not penalised for
   absence from AICTE.

3. enrichers/mirror/*.ts — tier "mirror", thin wrappers over registry/lookup
   filtered by authority code. Evidence carries the snapshot date and source
   URL. Target <80ms.

4. enrichers/api/
   - wikidata.ts — inception, parent org, coordinates, alternate labels.
     Flagged identity-corroborating, NOT legitimacy-proving.
   - wikipedia.ts — REST summary + infobox parse.
   - website.ts — fetch/extract on identity.officialUrl; emits contact,
     affiliation-claim, and approval-claim evidence with matched sentences.
   - digilocker.ts — reads the NAD mirror; preserves the is_on_digilocker vs
     is_in_nad distinction from docs/LEGACY-NOTES.md item 5; live check only
     if the snapshot is >60 days old.

5. enrichers/live/*.ts — tier "live", one per sector regulator, using the
   request shapes recovered in docs/LEGACY-NOTES.md item 2. Each runs ONLY
   when relevantSources includes it AND no mirror entry exists. Gated on
   USE_LIVE_AUTHORITIES. Per-domain concurrency 2, polite delay. Degrades to
   a "check-unavailable" evidence item rather than failing the run.

6. service.ts — verify(identity, ctx):
   computes relevantSources; runs tiers in sequence (mirror → api → live),
   enrichers concurrently within a tier; short-circuits before the live tier
   if mirror + api evidence already exceeds the Genuine threshold; a
   UGC_FAKE mirror hit returns immediately with nothing else run.
   Every result becomes an evidence row with source, url, snapshot ref,
   content hash, observed_at, and a tier-derived quality score.
   Returns { evidence, sourcesAttempted, sourcesUnavailable }.

Tests: applicability for all 11 types; live enrichers not invoked when a
mirror entry exists; fake-list terminal short-circuit; a failing live
enricher degrades rather than throws; the architecture test proving no
search imports.
```

---

### Prompt 9 — Evidence store

```
Implement src/server/evidence/.

1. store.ts — recordEvidence(runId, items[]): normalizes, computes SHA-256
   content_hash, dedupes within a run by (kind, url, hash), uploads large
   payloads (raw HTML, screenshots) to Blob under evidence/{yyyy}/{mm}/{hash}
   and stores only blob_key. NEVER stores raw HTML in Postgres.

2. quality.ts — quality(evidence): 0–1 from tier (mirror 1.0, api 0.4–0.75,
   live 0.9), domain authority (gov.in > ac.in > edu.in > news > aggregator),
   directness (registry entry > page mentioning it), and recency.
   Kept SEPARATE from scoring weight — weight says how much this source type
   counts, quality says how good this observation is.

3. collector.ts — a per-run accumulator with typed add* methods.

4. project.ts — toLLMPayload(collector): compact normalized evidence JSON.
   Strips HTML entirely, caps at 24k characters, prioritizes by quality when
   truncating, assigns stable short refs (e1, e2 …) so the LLM can cite.
   Runtime guard: throws if the payload contains "<html" or "<!DOCTYPE".

5. getRunEvidence(runId) — grouped by kind with signed blob URLs, for the UI.

Tests: dedup by hash; blob offload threshold; toLLMPayload contains no HTML
and respects the cap while retaining the highest-quality items.
```

---

### Prompt 10 — LLM gateway

**Read the model notes below before implementing.** See §8.3.

```
Implement src/server/llm/ with the Vercel AI SDK. This is the ONLY module
that calls a model. Switching development → production must require ENV
CHANGES ONLY.

1. providers.ts — a provider registry:
   - "gemini": @ai-sdk/google, model from LLM_MODEL (dev: gemini-2.5-flash)
   - "openai-compatible": @ai-sdk/openai-compatible pointed at LLM_BASE_URL
     with LLM_API_KEY and LLM_MODEL (production: Qwen/Qwen3-VL-8B-Instruct
     on a self-hosted OpenShift route)
   Selected by LLM_PROVIDER. Adding a provider must not touch call sites.

   SSL: when LLM_VERIFY_SSL=false, pass a custom fetch built on an undici
   Agent with connect.rejectUnauthorized=false. This CANNOT be done with a
   config flag alone — corporate self-signed certs need the custom agent.
   Never disable verification when LLM_VERIFY_SSL is true or unset.

   Apply LLM_MAX_TOKENS, LLM_TEMPERATURE, and LLM_TIMEOUT_MS from env to
   every call.

2. gateway.ts — generateStructured<T>({ stage, schema, system, prompt,
   temperature, cacheTtl }):
   - generateObject with a Zod schema; never free-text parsing
   - Redis-cached by SHA-256 of {provider, model, system, prompt, schemaHash},
     TTL 30d
   - timeout from LLM_TIMEOUT_MS, 2 retries, circuit breaker
   - on schema-validation failure, ONE repair retry with an appended
     correction instruction, then a typed Result error — never throws raw
   - records every call into llm_calls (stage, model, tokens, latency, cost,
     cache hit)
   - per-run budget from LLM_MAX_RUN_COST_USD; exceeding returns
     BudgetExceededError
   - gated on USE_LLM_REASONING; when off, the pipeline proceeds rules-only
     with needsReview forced

3. schemas.ts —
   ExtractedFacts { officialName, aliases[], institutionType, establishedYear?,
     address{}, contacts{}, website?, affiliatedTo?, approvals[],
     accreditations[], socialLinks{}, conflicts[] } — every field carries
     sourceRefs: string[] pointing at evidence refs.
   ValidationJudgment { keyFindings[], contradictions[], missingEvidence[],
     reasoning (≤1200 chars), redFlags[] }
   NOTE: ValidationJudgment contains NO number. Scoring is arithmetic.
   Keep both schemas FLAT and SHALLOW — see the model notes.

4. prompts/extract.ts, prompts/reason.ts — versioned builders exporting
   { version, build(input) }. The version string is written into
   validation_runs.prompt_version.

5. scripts/llm-parity.ts — runs the same 30-case evidence fixture through
   BOTH providers and reports schema-compliance rate, agreement rate, and
   latency. Run this before switching production to Qwen.

Tests: mock provider; cache hit avoids the provider; repair path; budget
enforcement; the raw-HTML guard throws; LLM_VERIFY_SSL=false produces a
custom agent and true does not.
```

#### Model notes — read before implementing

**`Qwen/Qwen3-VL-8B-Instruct` is an 8-billion-parameter model.** At that size, strict JSON-schema adherence is meaningfully weaker than Gemini Flash. Three consequences:

1. **Keep schemas flat and shallow.** Deeply nested objects and long enums are where small models break. Prefer several small calls over one large one.
2. **The repair retry is essential, not optional.** Expect it to fire on a few percent of calls in production and near-zero on Gemini.
3. **Run `scripts/llm-parity.ts` before switching.** If Qwen's schema-compliance rate is below ~95% on the fixture set, split the extraction stage into two narrower calls rather than loosening the schema.

`LLM_TEMPERATURE=0.0` is already correct and should not be raised.

**It is a vision-language model, but we deliberately do not use vision.** Screenshots are stored as evidence blobs for audit, never sent to the model — the architecture forbids raw page content reaching the reasoning stage. Leave the door open, don't walk through it in v1.

**`LLM_MAX_TOKENS=2048`** is the _output_ budget and is comfortable for `ExtractedFacts`. It is unrelated to the 24k-character evidence payload cap, which is _input_. Confirm the deployed model's context window comfortably exceeds the payload before raising that cap.

---

### Prompt 11 — Scoring policies and explainability

See §11.

```
Implement src/server/scoring/.

1. policies.ts — loads scoring_policies rows, caches 5 min in Redis.
   policyFor(institutionType) → the active policy. NO weights in code.
   Include a migration seeding the 10 policies from §11. Sanity-check the
   weights against the legacy categorisation rules in docs/LEGACY-NOTES.md
   item 4 and note any deliberate divergence in a comment.

2. engine.ts — computeConfidence(evidence[], policy, context). PURE FUNCTION,
   no I/O:
   - terminal rules FIRST, short-circuiting: UGC fake-list hit → Fake 1.0;
     authority status withdrawn/closed → strong negative
   - contribution = weight × quality × exp(-ageDays / halfLife)
   - score = clamp(Σ contribution / policy.expected_max, 0, 1)
   - −0.10 per unresolved conflict
   Returns { score, breakdown[], terminalRule?, unresolvedConflicts[] }.

3. policy.ts — decide(score, breakdown, policy, context):
   - bands from policy.thresholds
   - HARD CONSTRAINT: Genuine requires ≥1 mirror-tier or live-tier authority
     hit. API-tier evidence alone caps at Likely Genuine (needsReview).
   - needsReview in the middle band or when conflicts exist
   - nextCheckAt from the freshness policy (§7)
   - insufficientEvidenceReasons[] — used by the UI and by revalidation to
     target only the missing work

4. explain.ts — the typed Explanation chain from §11, plus
   toSentences(explanation) for human-readable rendering. No LLM.

Tests: 30 table-driven scenarios asserting exact scores and verdicts (fake
list, UGC+AICTE, website only, stale evidence, conflicting affiliation,
medical college missing NMC, API-tier-only). Property test: adding evidence
never lowers the score except via the conflict penalty. Prove the
API-tier-only constraint blocks Genuine.
```

---

### Prompt 12 — Validation orchestrator

```
Implement src/server/services/validation.service.ts as PLAIN ASYNC FUNCTIONS
with injected dependencies. No Inngest, no Next.js imports.

Stages, each returning Result and each independently callable:

1. resolveFastPath(input) — L0/L1: normalize → Redis verdict → institutions
   with freshness check. <120ms. Returns { hit, verdict, source, stale }.
2. resolveFromMirror(input) — L2: matching/resolver → registry/lookup →
   collector → scoring. If score ≥ threshold or a terminal rule fires, this
   is the final answer with NO web access and NO LLM. <600ms.
3. discover(input) — delegates to discovery/service.
4. verify(identity) — delegates to verification/service.
5. extractFacts(collector) / judgeEvidence(facts, collector) — LLM stages.
6. finalize(input, identity, collector, facts, judgment):
   scoring → policy → upsert institution + identities + contacts → evidence →
   validation_run + run_steps → cache set → enqueue embedding backfill.
   Pins policy_id, prompt_version, snapshot_ids, embedding_space,
   code_version. Idempotent by (normalizedName, runId).

7. validate(input, opts) — walks the ladder, short-circuiting at the first
   confident answer. Accepts onProgress(step, status, meta) so Inngest and
   SSE both observe it, and maxTier so the fast API path can request
   "L2 only, do not go to the web".

State transitions follow §12; illegal transitions throw.
Every stage appends a run_steps row with duration, cache_hit, provider.

Tests: full pipeline with ALL dependencies faked. Assert: a fake-list input
never touches search or the LLM; an L1 hit performs exactly one DB query;
L3 respects its budget; finalize is idempotent when run twice with the same
runId; an illegal state transition throws.
```

---

### Prompt 13 — Inngest orchestration

```
Wire src/inngest/.

1. client.ts — Inngest client with the Realtime middleware and Zod-typed
   events: validation/requested, validation/completed, validation/failed,
   batch/created, batch/item.queued, registry/ingest.requested,
   revalidation/due, deadletter/retry.

2. channels.ts — validationChannel(runId) with topics progress, partial, done.

3. functions/validate-institution.ts
   - idempotency: event.data.normalizedName + dayBucket
   - concurrency: [{ key: "event.data.normalizedName", limit: 1 },
                   { scope: "fn", limit: 40 }]
   - retries 3, exponential backoff
   - each validation.service stage in its own step.run() so failures retry
     only that stage and successes memoize on replay
   - independent work parallel via Promise.all over step.run
   - step.realtime.publish() after each stage
   - terminal failure → dead_letters row + validation/failed

4. Flow control:
   search: throttle { limit: 6, period: "10s" }
   fetch-page: concurrency [{ key: "event.data.hostname", limit: 2 }]
   browser-render: concurrency [{ scope: "fn", limit: 2 }] matching
     BROWSER_POOL_SIZE — exceeding it just queues on the worker and wastes
     step time
   Each live enricher is its own function so one failing portal retries alone.
   Document the numbers in docs/RUNBOOK.md.

5. functions/ingest-registry.ts — trigger + cron per authority cadence read
   from the authorities table; each connector its own step.

6. app/api/inngest/route.ts — serve({ client, functions, streaming: true }),
   maxDuration 300.

Tests with InngestTestEngine: step memoization, retry on a failing step,
idempotency (two identical events → one run), progress publish ordering.
```

---

### Prompt 14 — API layer

```
Route handlers do bounded work only.

1. POST /api/validate { institutionName, universityName?, force?, mode? }
   - Zod validate, IP rate limit 30/min, short lock on the normalized name
   - validate({ maxTier: "L2" }) with a hard 1200ms budget
   - confident → 200 with the result and { resolvedAt: "sync", tier }
   - stale-but-present → 200 immediately + background refresh, stale: true
   - otherwise → send validation/requested, create the run row (state=queued),
     return 202 { runId, streamUrl, statusUrl }
   Always returns within ~1.5s.

2. GET /api/validate/[runId] — state, steps, partial evidence, final result.
3. GET /api/stream/[runId] — SSE forwarding the Realtime channel, 15s
   heartbeat, clean teardown. Plus a server action getRealtimeToken(runId)
   for the useRealtime hook, and a documented polling fallback.
4. GET /api/institutions — cursor-paginated, filterable (verdict, state, type,
   authority, needsReview, dateRange, confidence range), trigram search.
5. GET /api/institutions/[id] — evidence by kind, run history, explanation
   chain, identities, duplicate candidates.
6. POST /api/institutions/[id]/revalidate
7. POST /api/institutions/merge — via matching/identity.mergeInstitutions,
   audited.
8. GET /api/health — DB, Redis, SearXNG (incl. per-engine failures), browser
   worker, LLM, last published snapshot per authority.
9. GET /api/stats — verdict counts, validations/day, p50/p95 by tier, cache
   hit rate by layer, queue depth.

Shared ApiResponse<T> envelope, AppError → HTTP status mapping, request-id
logging. Tests with a faked service layer covering fast/async branching,
rate limiting, lock collapse, SSE framing.
```

---

### Prompt 15 — Design system and shell

```
Static only, no data fetching. Independent of Prompts 4–14.

Direction: a serious verification and compliance tool. Dense, legible,
information-first. Dark-first neutral dashboard. No gradients, no glass, no
decorative illustration.

1. Typography
   - Bricolage Grotesque via next/font/google for headings, brand, and
     large numerals:
       import { Bricolage_Grotesque } from "next/font/google";
       const bricolage = Bricolage_Grotesque({
         subsets: ["latin"],
         weight: ["200","300","400","500","600","700","800"],
         variable: "--font-display",
       });
   - A system/Inter stack for dense table body text (--font-sans).
     Bricolage is a display face; at 12–13px in a 100k-row table it costs
     legibility. Use it for headings and numbers, not table cells.
   - JetBrains Mono (--font-mono) for IDs, hashes, scores, snapshot dates.

2. Colour tokens (Tailwind v4 CSS variables)
   --primary   #2563EB   INTERACTIVE ONLY — buttons, links, focus rings.
                         NEVER a verdict colour.
   --accent    #06B6D4
   --success   #22C55E
   --warning   #F59E0B
   --danger    #EF4444
   Neutral gray scale as the base surface.

   Verdict mapping (the ONLY place these colours may be used):
     Genuine         → success  #22C55E
     Likely Genuine  → accent   #06B6D4
     Unknown         → warning  #F59E0B
     Unverified      → neutral-500
     Fake            → danger   #EF4444

   4px spacing grid, radii 4–6px. Dark mode is the default; light mode
   supported and tested.

3. Motion — Framer Motion, restrained:
   - allowed: RunTimeline step transitions, streaming evidence entry,
     progress bars, toast entry
   - not allowed: page transitions, decorative parallax, animated
     backgrounds, staggered card reveals
   - honour prefers-reduced-motion everywhere

4. Shell: left sidebar (Overview, Validate, Records, Batches, Sources,
   Settings), top bar with ⌘K search and a live system status pill,
   breadcrumbs.

5. Domain components, prop-driven, each with a fixture page under
   /dev/components:
   VerdictBadge (5 states × 3 sizes) · ConfidenceBar (stacked contribution
   bar with legend) · ExplanationChain (evidence → rule → weight → quality →
   contribution) · RunTimeline (stepper: name, status, duration, cache-hit,
   provider) · EvidenceTable (grouped by kind, tier badge, quality meter,
   payload drawer) · SourceHealthGrid (per authority: last published
   snapshot, row count, drift, next run) · IdentityGraph (institution → its
   identity rows per source) · EmptyState / ErrorState / LoadingSkeleton

6. Accessibility: keyboard navigable, visible focus rings, aria-live for
   progress, contrast ≥4.5:1 in both themes.
```

---

### Prompt 16 — Validate page

```
Wire /validate to the real API.

1. Form: institution name (required), university (optional), force toggle.
   RHF + Zod sharing the API schema. Recent searches in localStorage.
   Autocomplete from /api/institutions?q= debounced 200ms.

2. Submission:
   - 200 → render immediately with "answered from cache/registry in 47ms"
     and the tier reached
   - 202 → RunTimeline skeleton, subscribe via useRealtime (fallback SSE,
     then polling 1.5s), fill in steps as they complete; partial evidence
     appears as it arrives; the verdict card resolves last
   - clean unsubscribe on navigation

3. Result view: verdict card with ConfidenceBar and the ExplanationChain ·
   identity panel (each field showing its source on hover) · authority panel
   (one row per relevant source with found/not-found, snapshot date, deep
   link) · evidence tab · runs tab · actions (revalidate, copy JSON, export).

4. Error states: upstream degraded (name which providers were down and note
   that confidence was reduced), no evidence found, run failed with retry.

Playwright E2E against a mocked API: sync path, async streamed path,
failure path.
```

---

### Prompt 17 — Records, overview, sources, settings

```
1. /records — TanStack Table, server-side pagination/sort/filter, URL-synced
   state (nuqs), row expansion showing the explanation chain, bulk
   revalidate and CSV export, virtualized (smooth at 100k rows).

2. /records/[id] — full record: identity graph (one row per source with its
   own spelling), evidence timeline, run history with duration/tier charts,
   duplicate candidates with merge, manual verdict override requiring a
   reason (written to audit_log, fixed weight in scoring).

3. / — verdict distribution, validations/day (30d), p50/p95 by tier, cache
   hit rate by layer, cost split (LLM/browser/search), queue depth, recent
   runs, and an alerts strip: stale or rejected snapshots, open breakers,
   engines above 20% failure rate, dead letters awaiting retry.

4. /sources — per authority: last published snapshot, row count, drift vs
   previous, the validation report for any rejected snapshot, next scheduled
   run, manual "ingest now".

5. /settings — feature flag toggles (writes to feature_flags), scoring policy
   viewer (read-only weights per type), embedding space status, LLM provider
   status (which provider is live, model name, 24h cost).

Recharts, server-rendered where possible, TanStack Query with sensible
staleTime, overview polls every 15s.
```

---

### Prompt 18 — Batch processing

```
1. Upload: drag-and-drop CSV to Vercel Blob via a client upload token (never
   through a route body). PapaParse in a Web Worker for preview; validate
   headers (institution_name required; university_name, state, district
   optional); per-row Zod errors with a downloadable error report.

2. POST /api/batches — batches row + batch_items in one transaction, bulk
   insert in chunks of 1000, emit ONE batch/created event. Returns batchId
   immediately even for 50k rows.

3. functions/batch-process.ts:
   - fans out in chunks of 100 via step.sendEvent, never 50k events at once
   - per-batch concurrency key (default 20) so batches never starve
     interactive validations; lower priority and a distinct concurrency scope
   - DEDUPES identical normalized names within a batch — validate once, apply
     to all matching rows (the largest cost saver on real CSVs)
   - transactional counter updates, progress published to a Realtime channel
   - on completion, writes a result CSV to Blob

4. Batch detail page: live progress, throughput (items/min), ETA, virtualized
   per-item table, failed-items filter with retry, result CSV download
   (input columns + verdict, confidence, authorities matched, website,
   contacts, evidence count, run URL).

5. Cancellation sets batch state; queued items no-op on pickup.

Tests: a 5000-row synthetic CSV against a faked service — dedup savings,
concurrency ceiling respected, counter accuracy, cancellation, CSV shape.
```

---

### Prompt 19 — Cron and self-healing

```
All scheduled work as Inngest crons. Each: singleton concurrency, safe to
overrun, logs a summary, writes a job_runs audit row.

1. revalidate-stale — every 6h. Selects valid_until < now(), ordered
   Unknown > New > Likely > Genuine then oldest, capped at 500/run, low
   priority. Uses insufficientEvidenceReasons to request only the missing
   work.
2. ingest-registry — per-authority schedules from the authorities table,
   staggered per the §10 cadence table.
3. refresh-website-snapshots — daily, official sites >30 days old, only for
   institutions validated in the last 180 days.
4. retry-dead-letters — hourly, attempts <5, exponential backoff.
5. backfill-embeddings — every 15 min, 64 at a time, into the ACTIVE
   embedding space, with a per-run cap.
6. cache-warm — daily, top 1000 requested names from the last 30 days.
7. search-health-snapshot — every 5 min, per-engine failure rates into
   provider_health.
8. metrics-rollup — hourly into metrics_hourly so the overview reads one row
   per hour instead of scanning validation_runs.

Document every schedule in docs/RUNBOOK.md with expected duration and cost.
```

---

### Prompt 20 — Observability and hardening

```
1. OpenTelemetry: instrument route handlers, Inngest steps, DB queries, and
   every external call. Propagate runId and requestId through the pipeline
   via AsyncLocalStorage. OTLP export from env.

2. Metrics per §14, exposed at /api/metrics behind METRICS_TOKEN.

3. Sentry: client, server, edge. Scrub PII and secrets. Tag runId. Expected
   AppErrors (CircuitOpen, RateLimit) below warning level.

4. Security: CSP with nonces, HSTS, frame-deny, referrer-policy; SSRF guard
   verified in http.ts and the browser worker; input size caps; CSV row cap;
   METRICS_TOKEN on /api/metrics; dependency audit in CI.

5. Implement and document the degradation matrix from §13, with a
   DEGRADED_MODE banner driven by /api/health.

6. k6 load test: 200 concurrent validations mixing cached/mirror/cold,
   asserting the p95 targets in §7. Commit the script and results to
   docs/BENCHMARKS.md.
```

**Done when:** killing Redis, SearXNG, and the LLM one at a time each degrades gracefully with a correct banner and a still-valid verdict.

---

### Prompt 21 — Performance and deploy

```
Part A — optimize against measurements only. Record before/after for every
change in docs/BENCHMARKS.md. No change without a measurement.
- EXPLAIN ANALYZE every query; add missing indexes, remove unused; confirm
  the trigram and HNSW indexes are chosen; materialized view for overview
  stats; statement_timeout per query class
- eliminate N+1 with a DataLoader-style batcher for evidence and identities
- measure hit rates per layer, tune TTLs, add negative caching where missing
- trim API payloads, stream RSC on /records, ISR where safe
- bundle analysis: confirm playwright and cheerio are absent from client
  bundles
- tune Inngest concurrency/throttle against observed behaviour; document
  final values
- raise the L2 mirror-confidence threshold where accuracy allows; every
  avoided L3 saves ~5s. Measure the accuracy/cost tradeoff on the Prompt 5
  fixture set and record it.
- run scripts/llm-parity.ts and record Gemini vs Qwen schema compliance

Part B — production readiness:
- docs/RUNBOOK.md: architecture summary, every env var and its source, deploy
  procedure, adding a registry connector, adding a search provider, key
  rotation, alert handling, replaying a failed run, rolling back a rejected
  snapshot, switching the LLM provider, on-call decision tree
- Vercel: fluid compute, maxDuration per route, preview/production env split,
  Blob store, log drains. Inngest: signing key, app sync, failure-rate
  alerts. Neon: production branch, pooled URL, PITR, documented restore drill.
- pnpm bootstrap — migrations, seed authorities/policies/spaces, ingest every
  connector with a real source, backfill embeddings, warm cache. One command
  for a fresh environment.
- pnpm smoke — post-deploy gate hitting a deployed URL: health, a known
  genuine institution, a known fake-list institution, an unknown name, a
  10-row batch.
- README with screenshots, architecture diagram, quickstart.

Tag v1.0.0.
```

---

## 23. Common failure modes

Things Claude Code tends to get wrong on a project this size. Check for each after the relevant prompt.

| Symptom                                                      | Why it's wrong                                                  | Correction                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `playwright` appears in the root `package.json`              | Blows the Vercel bundle limit; the build may still pass locally | Move to `infra/browser-worker/` only. Add a CI check                                 |
| A scraper is called from a route handler                     | Route handlers must stay under ~1s                              | Move into an Inngest function; the handler returns 202                               |
| Scoring weights appear as constants in TypeScript            | Adding a regulator would need a deploy                          | Read from `scoring_policies`                                                         |
| `vector(384)` or `"e5-small"` appears in application code    | Blocks model upgrades                                           | Read from `embedding_spaces`                                                         |
| A registry URL is invented because the source was unknown    | Produces a connector that fails silently in production          | Check `docs/LEGACY-NOTES.md` first; else stub with a fixture and mark `needs-source` |
| `src/server/verification/` imports from `src/server/search/` | Collapses the §8 boundary                                       | The ESLint rule should catch it. If it didn't, the rule is misconfigured             |
| The LLM receives HTML                                        | Wastes tokens, leaks noise, breaks reproducibility              | The `toLLMPayload` guard should throw. Check the guard is actually called            |
| A run is marked `completed` while a step is still retrying   | State machine not enforced                                      | Legal-transition map in the repository, not in the caller                            |
| An empty SearXNG response is cached as a valid miss          | Silently degrades result quality for 7 days                     | Check `unresponsive_engines` before caching                                          |
| A snapshot with 40 rows replaces one with 40,000             | Corrupts the mirror                                             | The publish gate should have rejected it. Verify the ±20% check                      |
| Verdict colours used for buttons or links                    | Makes the UI unreadable at a glance                             | `--primary` for interactive, verdict colours for verdicts only                       |
| `Genuine` returned with only Wikidata + website evidence     | Wikipedia existing is not recognition                           | The §11 hard constraint should block it                                              |
| Claude Code refactors a completed module mid-prompt          | Breaks the build in a way that's hard to attribute              | Standing instruction 5. Revert and re-scope                                          |

---

## 24. Milestones and manual work

| After     | You have                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Prompt 0  | `docs/LEGACY-NOTES.md` with real registry URLs — the single most valuable artifact of the early build |
| Prompt 1  | SearXNG, browser worker, and embeddings live and verified                                             |
| Prompt 4  | A working registry mirror — _"is this a fake university?"_ answerable from the CLI in milliseconds    |
| Prompt 12 | A complete, tested validation pipeline, no UI                                                         |
| Prompt 14 | A usable JSON API                                                                                     |
| Prompt 16 | A demoable product                                                                                    |
| Prompt 19 | A self-maintaining system                                                                             |
| Prompt 21 | Production                                                                                            |

### The manual work only you can do

Prompt 0 recovers most registry sources from the legacy scrapers. For whatever remains marked `needs-source` in `docs/SOURCES.md`, budget a few hours between Prompts 4 and 12 to:

1. Open the authority's site and find the real bulk export (CSV / Excel / JSON endpoint or paginated table).
2. Record the URL, method, form fields, and format in `docs/SOURCES.md`.
3. Save one real response into `tests/fixtures/registry/`.
4. Run `pnpm ingest --code=X`.

Everything downstream is bounded by the quality of the mirror.

### Honest expectations

- **"Validation in seconds" is true for the ~90% of queries resolving at L0–L2** once the mirror is populated. It is not true for a genuinely unknown institution requiring live portal checks — that path is 20–50s and belongs in the background, streamed to the UI. Design the UX around that reality rather than fighting it.
- **"No rate limiting" is achieved by not making the requests.** The mirror plus caching does the work; Inngest throttle and concurrency handle the remainder. Treat every live-scraping path as a liability to minimise, not a feature.
- **Accuracy is bounded by name matching, not by the LLM.** Invest tuning time in the Prompt 5 fixture set. Every point of top-1 match accuracy is worth more than any prompt engineering.
- **The 8B production model will be the weakest link in the reasoning stage.** Run `scripts/llm-parity.ts` before switching, and keep the deterministic scoring engine as the thing that actually decides — which it already is.
- Add a **human review queue** for the 0.45–0.75 band early. It's a filter on `/records`, not a new subsystem, and reviewed verdicts become the data for improving the policy weights.
