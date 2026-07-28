# University Validation Platform

A production-grade, AI-powered SaaS application that verifies the authenticity and recognition status of educational institutions across India. Enter an institution name, get a validated, explainable, and auditable verdict. Batch-process thousands. Revalidate on a schedule.

**Status:** Alpha
**License:** Private

---

## Quick Links

- **[MASTER-PLAN.md](./MASTER-PLAN.md)** — Complete architecture, infrastructure, and 22-prompt build plan
- **[CLAUDE.md](./CLAUDE.md)** — AI assistant guidelines and critical rules
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Deep dive into system design
- **[docs/SOURCES.md](./docs/SOURCES.md)** — Registry data sources and API specs
- **[docs/CONNECTOR_PROGRESS.md](./docs/CONNECTOR_PROGRESS.md)** — Implementation status of each registry connector

---

## What It Does

The platform validates institutions by cross-referencing 16+ statutory bodies across India:

- **Higher Education:** UGC (recognized & fake), AICTE, AISHE, INIs (IITs/NITs/IIITs), DigiLocker NAD
- **Professional:** NMC (medical), PCI (pharmacy), NCTE (teacher), COA (architecture), INC (nursing)
- **Accreditation:** NAAC, NIRF
- **School Education:** CBSE, CISCE, NIOS
- **Legal:** BCI (law colleges)

**Validation Flow:**
1. User enters institution name
2. System queries 16+ registries in parallel
3. AI model analyzes evidence and generates a confidence score
4. Returns categorization: **Genuine** | **Fake** | **Unknown** | **New**
5. Evidence is auditable and explainable

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn/ui |
| **Backend** | Inngest (workflow) · Node.js · Express (browser worker) |
| **Database** | Neon (PostgreSQL) · Drizzle ORM |
| **Cache** | Upstash Redis (REST API) · In-memory fallback |
| **Search** | SearXNG (self-hosted) |
| **Browser** | Playwright (JavaScript-heavy scraping) · Self-hosted browser worker |
| **AI/ML** | Gemini API (dev) · Qwen7B (production) · TEI embeddings (self-hosted) |
| **Infrastructure** | Vercel (app) · Hetzner CX22 VPS (search/browser/embeddings) · Docker Compose |
| **Observability** | Pino (logging) · Sentry (optional error tracking) |
| **Validation** | Zod (runtime type validation) |
| **Testing** | Vitest · Testcontainers |

---

## Getting Started

### Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- **Docker** (for local services and VPS setup)
- **PostgreSQL CLI** (`psql`)
- Environment variables from external services (see §1 of MASTER-PLAN.md)

### Local Development Setup

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd university-validator
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   You must have:
   - Neon PostgreSQL credentials (database + pooled connection strings)
   - Upstash Redis REST URL + token
   - Inngest event + signing keys
   - Gemini API key (for development)
   - Bearer token for self-hosted services (or leave blank for local testing)

3. **Initialize the database**
   ```bash
   pnpm run db:generate   # Create Drizzle migrations
   pnpm run db:migrate    # Apply to database
   pnpm run init-db       # Seed initial data
   ```

4. **Start the development server**
   ```bash
   pnpm dev
   ```
   Open http://localhost:3000 in your browser.

5. **Watch logs**
   ```bash
   # In a separate terminal, watch Inngest events
   pnpm run inngest dev
   ```

### Running Tests

```bash
# All tests (units + integration)
pnpm run test

# Unit tests only
pnpm run test:all --run

# Watch mode
pnpm run test --watch

# Coverage
pnpm run test --coverage
```

Test files use `vitest` with:
- **Server code** (`src/server/**`) runs in Node environment
- **Components** run in jsdom environment

---

## Project Structure

```
university-validator/
├── src/
│   ├── app/                    # Next.js 15 app router
│   ├── components/             # React components (client-side)
│   ├── lib/
│   │   ├── env.ts              # Zod-validated environment vars
│   │   ├── errors.ts           # Custom error hierarchy
│   │   ├── result.ts           # Result<T, E> for explicit error handling
│   │   └── db.ts               # Database client
│   ├── server/
│   │   ├── api/                # API routes (tRPC/REST endpoints)
│   │   ├── registry/           # Registry connectors
│   │   │   ├── verification/   # Connector implementations (UGC, AICTE, DigiLocker, etc.)
│   │   │   └── ingestion.ts    # Batch ingestion pipeline
│   │   ├── matching/           # Matching & deduplication logic
│   │   ├── scoring/            # Confidence score calculation
│   │   ├── workflow/           # Inngest event handlers
│   │   └── observability/      # Logging & observability
│   └── db/
│       ├── schema.ts           # Drizzle ORM schema
│       └── migrations/         # Drizzle migrations
├── infra/
│   ├── docker-compose.yml      # Local services (SearXNG, browser, embeddings)
│   ├── browser-worker/         # Playwright-based browser service
│   ├── searxng/                # SearXNG configuration
│   └── caddyfile               # Reverse proxy config
├── scripts/
│   ├── init-db.ts              # Database initialization
│   ├── seed.ts                 # Seed test data
│   ├── ingest.ts               # Manual batch ingestion
│   └── test-digilocker.ts      # Test DigiLocker connector
├── docs/                       # Documentation
│   ├── SOURCES.md              # Registry URLs and API specs
│   ├── ARCHITECTURE.md         # Detailed system design
│   ├── LEGACY-NOTES.md         # Requirements from Python implementation
│   ├── IMPLEMENTATION_GUIDE.md # Step-by-step connector guide
│   ├── TESTING.md              # Testing strategies
│   └── CONNECTOR_PROGRESS.md   # Current implementation status
├── tests/                      # Test fixtures and integration tests
│   └── *.test.ts               # Test files (Vitest)
├── MASTER-PLAN.md              # Complete architecture & 22-prompt build guide
├── CLAUDE.md                   # AI assistant rules & project metadata
├── AGENTS.md                   # Agent descriptions for multi-agent workflows
├── tsconfig.json               # TypeScript strict mode enabled
├── vitest.config.ts            # Test runner config
├── next.config.ts              # Next.js config
└── package.json                # Dependencies & scripts
```

---

## Architecture Overview

### Core Concepts

**Resolution Ladder** — Attempts to match institutions in this order:
1. Direct database hit (cached)
2. Fuzzy match in latest registries
3. Abbreviation expansion (80+ entries)
4. AI-powered semantic search
5. Unknown (flag for manual review)

**Pipeline Stages** — Each validation request flows through:
1. **Discovery** — Search institution across registries (SearXNG)
2. **Fetching** — Retrieve verified registry data from statutory bodies
3. **Matching** — Deduplicate and cross-reference results
4. **Scoring** — Compute confidence and categorize
5. **Caching** — Store results with TTL
6. **Audit Trail** — Log every decision for explainability

**Workflow State Machine** — Inngest orchestrates:
- Retry logic with exponential backoff
- Timeout handling (LLM: 30s, network: 15s)
- Cost ceiling enforcement (LLM budget: $0.05/validation)
- Circuit breaker for failing services
- Batch processing with rate limiting

### Data Model

**Core Tables:**
- `institutions` — Master registry of unique institutions
- `registry_entries` — Individual matches from each statutory body
- `validations` — Audit trail of every validation request + evidence
- `embedding_spaces` — Metadata for semantic search models
- `feature_flags` — Runtime feature toggles

See [MASTER-PLAN.md §9](./MASTER-PLAN.md) for full schema.

### Registry Connectors

Each statutory body has a connector implementing the `RegistryConnector` interface:

```typescript
interface RegistryConnector {
  name: string;
  authorities: string[];           // Which bodies this covers (e.g., ["UGC"])
  fetch(query: string): Promise<RegistryMatch[]>;
  search(query: string): Promise<RegistryMatch[]>;
}
```

**Current Status:**
- ✅ DigiLocker NAD (REST API)
- ⚠️ UGC (browser + DataTables API) — fixture-based
- ⚠️ AICTE (PHP API) — fixture-based
- ⚠️ NMC, PCI, NCTE, COA, INC (browser) — fixture-based
- ⚠️ CBSE, CISCE, NIOS (static/API) — fixture-based
- ⚠️ INI (aggregated) — fixture-based
- ❌ NAAC, NIRF, BCI — source documentation pending

See [docs/CONNECTOR_PROGRESS.md](./docs/CONNECTOR_PROGRESS.md) for details.

---

## Key Features

### 1. **Batch Validation**
- Upload CSV with 1000s of institution names
- Process asynchronously via Inngest
- Download results with audit trail
- Webhook notifications on completion

### 2. **Revalidation Scheduler**
- Automatic revalidation on configurable cadence
- Detects new registrations, deletions, status changes
- Tracks confidence score changes over time

### 3. **Explainable Decisions**
- Every verdict includes evidence: which registries matched, confidence score breakdown
- Audit log shows why the system reached its conclusion
- No "black box" — full chain of reasoning visible

### 4. **Real-time Search**
- As-you-type suggestions via SearXNG + embeddings
- Powered by semantic search (TEI embeddings)
- Respects rate limits and caching

### 5. **Cost Control**
- Per-validation LLM budget ceiling ($0.05 default)
- Circuit breaker stops cascading failures
- Graceful degradation when services unavailable

### 6. **Observability**
- Structured logging (Pino) with automatic secret redaction
- Sentry for production error tracking (optional)
- Distributed tracing ready (OpenTelemetry endpoint supported)

---

## Environment Variables

See [.env.example](./.env.example) for all required and optional variables. Key categories:

| Category | Required | Purpose |
|----------|----------|---------|
| **Application** | APP_ENV, LOG_LEVEL, NEXT_PUBLIC_APP_URL | App config |
| **Database** | DATABASE_URL, DATABASE_POOLED_URL | Neon PostgreSQL (use pooled for Vercel) |
| **Cache** | UPSTASH_REDIS_REST_URL, _TOKEN | Redis (leave blank for in-memory fallback) |
| **Workflow** | INNGEST_EVENT_KEY, _SIGNING_KEY | Event processing |
| **Infrastructure** | INFRA_TOKEN, SEARXNG_URL, BROWSER_SERVICE_URL, EMBEDDINGS_URL | Self-hosted services |
| **AI/LLM** | LLM_PROVIDER, GEMINI_API_KEY, LLM_MODEL | AI model selection & keys |
| **Storage** | BLOB_READ_WRITE_TOKEN | Vercel Blob (file uploads) |

---

## Running Connectors Directly

Test a single registry connector:

```bash
# Test DigiLocker
pnpm exec tsx scripts/test-digilocker.ts "Indian Institute of Technology Bombay"

# Test another institution
pnpm exec tsx scripts/test-digilocker.ts "Delhi University"
```

---

## Batch Ingestion

Ingest a CSV file of institutions into the database:

```bash
pnpm run ingest ./data/institutions.csv
```

CSV format: `institution_name,state,city,category` (with header).

---

## Deployment

### Vercel (Frontend + API)

1. Connect GitHub repo to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy on push to main

**Note:** Function timeout must be ≥ 300 seconds for long-running validations.

### Self-Hosted Infrastructure (VPS)

Deploy SearXNG, browser worker, and embeddings on your VPS:

```bash
# On the VPS
cd infra
docker-compose up -d

# Verify services
bash verify.sh
```

See [MASTER-PLAN.md §17–18](./MASTER-PLAN.md) for VPS sizing and configuration.

---

## Development Workflow

### Branch Strategy

- `main` — Production-ready
- `develop` — Integration branch
- `feature/*` — Feature branches (PR required)
- `bugfix/*` — Bug fixes

### Before Committing

```bash
# Type check
pnpm run build

# Lint & format
pnpm run lint

# Tests
pnpm run test

# All three together
pnpm run lint && pnpm run test && pnpm run build
```

### Database Migrations

```bash
# After modifying src/db/schema.ts:
pnpm run db:generate       # Creates new migration
pnpm run db:migrate        # Applies migrations

# Rollback (careful in production)
# Edit the most recent migration file and re-run db:migrate
```

---

## Critical Rules

⚠️ **Do not:**
- Add `playwright` to root `package.json` — it belongs only in `infra/browser-worker/`
- Use relative imports — use `@/*` path aliases (e.g., `@/server/registry/...`)
- Call `console.log` in server code — use `getLogger()` from `src/server/observability/logger`
- Commit `.env.local` — keep it local only
- Modify error classes without updating `src/lib/errors.ts`

✅ **Do:**
- Validate all external input via Zod schemas
- Use `Result<T, E>` for explicit error handling in business logic
- Inherit custom errors from `AppError`
- Structure logs with context using `logger.withContext()`
- Reference the legacy Python codebase only for **business requirements**, not architecture

---

## Testing Strategy

- **Unit tests** — Individual functions, no external calls (use mocks)
- **Integration tests** — Database + services, use Testcontainers for PostgreSQL
- **E2E tests** — Full workflows (future: Playwright)

Place tests near the code they test:
```
src/server/matching/normalize.ts
src/server/matching/normalize.test.ts
```

Run with:
```bash
pnpm run test
```

See [docs/TESTING.md](./docs/TESTING.md) for detailed strategy.

---

## Troubleshooting

### Environment Variables Missing
```
Error: Invalid or missing environment variables:
APP_ENV: Invalid option: expected one of "development"|"preview"|"production"
```
→ Copy `.env.example` to `.env.local` and fill in all required variables.

### Database Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
→ Check that Neon/PostgreSQL is running and credentials are correct in `DATABASE_URL`.

### Inngest Not Found
```
Error: Cannot find module '@inngest/middleware'
```
→ Run `pnpm install` to ensure all dependencies are installed.

### DigiLocker Test Fails
```
Error: Failed to fetch from NAD
```
→ Check that `NEXT_PUBLIC_APP_URL` is set and matches your environment.

For more help, see:
- [MASTER-PLAN.md §23](./MASTER-PLAN.md) — Common failure modes
- [docs/TESTING.md](./docs/TESTING.md) — Testing troubleshooting
- [docs/CONNECTOR_PROGRESS.md](./docs/CONNECTOR_PROGRESS.md) — Which connectors are working

---

## Contributing

1. Read [CLAUDE.md](./CLAUDE.md) for AI assistant rules
2. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for design principles
3. Pick a task from [MASTER-PLAN.md §22–24](./MASTER-PLAN.md) or open an issue
4. Create a feature branch: `git checkout -b feature/your-feature`
5. Commit with clear messages (see [.gitmessage](./docs/GITMESSAGE) if available)
6. Push and open a PR

All PRs must:
- Pass linting: `pnpm run lint`
- Pass tests: `pnpm run test`
- Pass type check: `pnpm run build`

---

## Key Documentation Files

| File | Purpose |
|------|---------|
| [MASTER-PLAN.md](./MASTER-PLAN.md) | 22-prompt build guide + architecture (126 KB) |
| [CLAUDE.md](./CLAUDE.md) | AI rules, dependencies, error handling |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Deep dive into system design |
| [docs/SOURCES.md](./docs/SOURCES.md) | Registry URLs, APIs, scraping methods |
| [docs/CONNECTOR_PROGRESS.md](./docs/CONNECTOR_PROGRESS.md) | Which connectors work, which need fixtures |
| [docs/LEGACY-NOTES.md](./docs/LEGACY-NOTES.md) | Requirements from Python implementation |
| [docs/IMPLEMENTATION_GUIDE.md](./docs/IMPLEMENTATION_GUIDE.md) | How to build new connectors |
| [docs/TESTING.md](./docs/TESTING.md) | Testing strategy & examples |

---

## License & Disclaimer

**Private Project** — Confidential. Do not distribute.

This platform is an **alpha release**. Registry connectors use fixtures for testing; production deployment requires real integration with statutory bodies' APIs.

---

## Support

For issues, questions, or feedback:
1. Check [docs/TESTING.md](./docs/TESTING.md) for testing issues
2. Check [MASTER-PLAN.md §23](./MASTER-PLAN.md) for common failure modes
3. Review [docs/CONNECTOR_PROGRESS.md](./docs/CONNECTOR_PROGRESS.md) for connector status
4. Open an issue with:
   - Environment (Node version, OS)
   - Steps to reproduce
   - Error message + logs
   - Which connector/feature is affected

---

**Last updated:** July 2026
**Version:** 0.1.0 (Alpha)
