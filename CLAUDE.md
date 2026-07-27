# Claude Code Instructions

This document is read by Claude Code at the start of each session to understand the project structure and requirements.

## Project Overview

**University Validation Platform** — A production-grade, AI-powered SaaS application that verifies the authenticity and recognition status of educational institutions across India.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Neon Postgres · Drizzle · Inngest · Upstash Redis · Vercel

**Key Files:**
- `MASTER-PLAN.md` — Complete architecture, infrastructure, and build plan (22 prompts)
- `docs/LEGACY-NOTES.md` — Requirements extracted from the working Python implementation
- `docs/SOURCES.md` — Real registry URLs and API specifications for each statutory body

## Critical Rules

### 1. Environment & Path Aliases

- Use `@/*` path alias (maps to `src/*`), not relative imports
- TypeScript strict mode enabled: `strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true`
- Validate all environment variables at boot via `src/lib/env.ts`

### 2. Dependencies

**NEVER add to root `package.json`:**
- `playwright` or `playwright-core` — lives only in `infra/browser-worker/package.json`
- `@sparticuz/chromium`

If Claude Code accidentally adds these, that is a bug.

**shadcn/ui:** Initialized with neutral base and CSS variables (Tailwind v4)

### 3. Error Handling

All errors inherit from `AppError` (defined in `src/lib/errors.ts`):
- `ValidationError` (400)
- `NotFoundError` (404)
- `UpstreamError` (502/503)
- `TimeoutError` (504)
- `RateLimitError` (429)
- `CircuitOpenError` (503)
- `BudgetExceededError` (402)
- `ConfigError` (500)

Use `Result<T, E>` type (from `src/lib/result.ts`) for explicit error handling instead of try/catch.

### 4. Logging

- Use `src/server/observability/logger.ts` (pino-based)
- Structure: `getLogger()`, `withContext()`, `info()`, `error()`, `warn()`, `debug()`
- Automatic secret redaction
- Only allowed in `src/server/**`; ban `console.log` in server code via ESLint

### 5. Legacy Implementation

Reference only `University_Validation(20-07)` to extract **business requirements**, never to copy architecture:
- ✅ Scraper API specs, request shapes, pagination
- ✅ Statutory body list and field mappings
- ✅ Categorization logic (Genuine/Fake/Unknown/New)
- ✅ Abbreviation dictionary
- ✅ DigiLocker field semantics
- ✅ Duplicate detection weights
- ❌ Python code structure
- ❌ LangGraph workflow
- ❌ FastAPI patterns
- ❌ 3-table schema (use new schema in MASTER-PLAN.md §9.2)

### 6. Build & Deployment

- `pnpm` package manager (not npm or yarn)
- TypeScript strict checking before commit
- ESLint + Prettier formatting required
- Vitest for unit tests (node env for `src/server`, jsdom for components)
- GitHub Actions CI: typecheck, lint, test, build

### 7. Infrastructure

- All infrastructure files live under `infra/`
- Docker Compose manages: Caddy, SearXNG, Valkey, browser-worker, TEI
- Browser worker: Fastify + Playwright pool (NOT pooled contexts — fresh per request)
- SearXNG: Custom `settings.yml` with Mojeek, DuckDuckGo, Brave, Marginalia, Qwant enabled
- No `playwright` in root; only in `infra/browser-worker`

### 8. Prompts & Session Procedure

Each of the 22 prompts in Part III of MASTER-PLAN.md:
1. Assumes prior context (MASTER-PLAN.md + CLAUDE.md read at session start)
2. Is self-contained (don't skip ahead)
3. Has explicit completion criteria

**Session procedure:**
```
/clear
Read MASTER-PLAN.md and CLAUDE.md
Paste the prompt from §22
Follow the prompt exactly
Commit staged changes at the end
```

### 9. Code Style

- **TypeScript:** Strict, no `any`, no `unknown` without assertion
- **Imports:** Use `@/*` path alias exclusively
- **Errors:** Always inherit from `AppError`
- **Async:** Use `async/await`, not callbacks
- **Retries:** Use `tryAsync()` from `src/lib/result.ts`
- **Logging:** Use pino logger, never `console.log` in server code
- **Testing:** Vitest with 100% coverage for business logic, fixtures for integration tests

### 10. Common Patterns

**Result-based error handling:**
```typescript
import { tryAsync, isOk, isErr } from "@/lib/result";

const result = await tryAsync(() => someAsyncFunction());
if (isOk(result)) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

**Environment access:**
```typescript
import { getServerEnv } from "@/lib/env";

const env = getServerEnv(); // Validates and returns all env vars
console.log(env.DATABASE_URL);
```

**Logging with context:**
```typescript
import { withContext } from "@/server/observability/logger";

const logger = withContext({ requestId: "abc123", runId: "xyz789" });
logger.info("Validation started");
```

### 11. Database

- Neon Postgres in dev (with pooler for concurrent connections)
- Drizzle ORM (no migrations outside code)
- Single connection pool in production (use `DATABASE_POOLED_URL`)

### 12. Feature Flags & Configuration

Runtime feature flags live in the database, with env defaults:
- `USE_GOOGLE_CSE`
- `USE_BROWSER`
- `USE_LLM_REASONING`
- `USE_LIVE_AUTHORITIES`
- `USE_VECTOR_SEARCH`
- `USE_WIKIDATA`
- `STRICT_ROBOTS`
- `READ_ONLY_MODE`

### 13. Git Workflow

- Create commits for each completed task
- Commit message format: Describe the "why", not the "what"
- Example: "Add Result type to replace try/catch patterns"
- Include `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` trailer

---

## Where to Start

If you're beginning work on this project:

1. Read `MASTER-PLAN.md` (Parts 0–II for overview)
2. Read this document (`CLAUDE.md`)
3. Review `docs/LEGACY-NOTES.md` for business requirements
4. Follow Prompt 0 from MASTER-PLAN.md §22 (repo foundation)
5. Continue sequentially through Prompts 1–21

Each prompt is self-contained and builds on prior work.

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| `playwright` added to root | Remove from root `package.json`; add only to `infra/browser-worker/package.json` |
| Environment vars not validated | Ensure `getServerEnv()` is called early in app bootstrap |
| `console.log` in server code | Use logger from `src/server/observability/logger.ts` |
| Relative imports instead of `@/*` | Update to use path alias (e.g., `import { x } from "@/lib/x"`) |
| Legacy code patterns copied | Reference legacy only for API specs, not architecture |
| Missing error context | Wrap errors in `AppError` subclasses with context data |

---

**Generated:** 2025-07-25
**Version:** 1.0
**Maintained By:** Claude Code + Manual Review
