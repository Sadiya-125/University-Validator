# University Validation Platform — Operations Runbook

**Last Updated:** 2026-07-28

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Scheduled Jobs (Crons)](#scheduled-jobs-crons)
3. [Batch Processing](#batch-processing)
4. [Manual Operations](#manual-operations)
5. [Troubleshooting](#troubleshooting)
6. [Cost Optimization](#cost-optimization)

---

## Architecture Overview

### Core Components

- **Next.js 16** API routes + React 19 UI (Vercel Deployment)
- **PostgreSQL** (Neon) - canonical institutions, registries, validation runs
- **Redis** (Upstash) - caching, session state, rate limits
- **Inngest** - event orchestration and scheduled jobs
- **Searxng** - self-hosted web search fallback
- **Vercel Blob** - CSV uploads and result storage

### Data Flow

```
User Input → /api/validate → [Fast Path (cache/registry)]
                              ↓ (if needed)
                           [Inngest Queue]
                              ↓
                         validate-institution
                              ↓
                         enrichInstitution
                              ↓
                         Database & Results
```

---

## Scheduled Jobs (Crons)

All cron jobs run on Inngest with singleton concurrency (only one execution at a time).

### 1. **Revalidate Stale** — Every 6 hours

**When:** 0 */6 * * * (00:00, 06:00, 12:00, 18:00 UTC)
**Expected Duration:** 15-45 minutes
**Cost:** ~$2-5 per run (depends on queue depth)

**What it does:**
- Selects institutions where `valid_until < now()`
- Prioritizes by verdict riskiness: Unknown > New > Likely > Genuine
- Caps at 500 per run to avoid overwhelming the queue
- Uses low priority to not starve interactive validations
- Logs summary to audit log

**Monitoring:**
```bash
# Check last run
curl https://app.inngest.com/api/jobs?name=cron-revalidate-stale

# Query stale institutions
SELECT COUNT(*), verdict
FROM institutions
WHERE valid_until < now()
GROUP BY verdict;
```

**If it fails:**
- Logs are sent to Sentry (check dashboard for errors)
- Dead letters are created for items that can't be retried
- Next run will try again in 6 hours
- Manual retry: `curl -X POST /api/crons/revalidate-stale`

---

### 2. **Ingest Registry** — Per-authority schedules

**When:** Staggered per authority (see table below)
**Expected Duration:** 30-180 minutes (depends on registry size)
**Cost:** ~$10-30 per run

| Authority | Schedule | Typical Size | Last Run |
|-----------|----------|--------------|----------|
| AISHE | Daily @ 3 AM | 45k rows | 2 hours ago |
| UGC | Daily @ 4 AM | 38k rows | 3 hours ago |
| AICTE | Twice daily @ 3 AM, 3 PM | 16k rows | 1 hour ago |
| NAD | Weekly @ 2 AM Sun | 22k rows | 5 days ago |
| NAAC | Monthly @ 2 AM 1st | 18k rows | 26 days ago |

**To manually ingest an authority:**
```bash
curl -X POST /api/crons/ingest-registry \
  -H "Content-Type: application/json" \
  -d '{"authority": "UGC", "force": true}'
```

---

### 3. **Refresh Website Snapshots** — Daily @ 1 AM

**Expected Duration:** 20-60 minutes
**Cost:** ~$1-3 per run

**What it does:**
- Finds institutions validated in last 180 days
- Where official website snapshot is >30 days old
- Refreshes via Playwright to check if site is still alive
- Updates `lastValidatedAt` and `validUntil`

---

### 4. **Retry Dead Letters** — Hourly

**When:** 0 * * * *
**Expected Duration:** 5-15 minutes
**Cost:** <$0.50 per run

**What it does:**
- Finds events in `dead_letters` with `attempts < 5`
- Orders by last attempt (oldest first)
- Applies exponential backoff: 1h, 2h, 4h, 8h, 24h
- After 5 attempts, requires manual intervention

**To check dead letters:**
```sql
SELECT kind, COUNT(*) as count, MAX(last_attempt_at)
FROM dead_letters
WHERE resolved_at IS NULL
GROUP BY kind;
```

---

### 5. **Backfill Embeddings** — Every 15 minutes

**When:** 0,15,30,45 * * * *
**Expected Duration:** 3-8 minutes
**Cost:** ~$0.20 per run

**What it does:**
- Embeds institution names using the active embedding space (e5-small-384)
- Processes 64 at a time from institutions without embeddings
- Per-run cap to avoid hogging GPU resources

---

### 6. **Cache Warm** — Daily @ 2 AM

**Expected Duration:** 10-30 minutes
**Cost:** ~$1-2 per run

**What it does:**
- Gets top 1000 requested names from last 30 days
- Runs fast-path validation on each (max 120s budget)
- Populates Redis and registry cache
- Improves hit rates for popular queries

---

### 7. **Search Health Snapshot** — Every 5 minutes

**When:** */5 * * * *
**Expected Duration:** <1 minute
**Cost:** <$0.10 per run

**What it does:**
- Samples failure rates per search engine (Searxng)
- Writes to `provider_health` table
- If failure rate > 20%, marks provider as degraded
- Used by `/api/health` to report system status

---

### 8. **Metrics Rollup** — Hourly

**When:** 0 * * * *
**Expected Duration:** 5 minutes
**Cost:** <$0.10 per run

**What it does:**
- Aggregates `validation_runs` into `metrics_hourly`
- Computes: count, avg/p50/p95 response times, verdict distribution
- Allows `/api/stats` to return year of data without table scans

**Query:**
```sql
SELECT * FROM metrics_hourly ORDER BY hour_bucket DESC LIMIT 24;
```

---

## Batch Processing

### CSV Upload Flow

1. **User uploads CSV** to `/batches`
   - Vercel Blob client-side upload (never through request body)
   - Max 50k rows, max 100 MB
   - Required header: `institution_name`
   - Optional: `university_name`, `state`, `district`

2. **API creates batch record**
   ```bash
   POST /api/batches
   Content-Type: application/json

   {
     "name": "AICTE Export Q3 2026",
     "items": [
       { "institution_name": "IIT Delhi", "state": "Delhi" },
       { "institution_name": "Delhi College of Engineering" }
     ]
   }
   ```
   Returns: `{ batchId, total, message }`

3. **Inngest batch-process takes over**
   - Deduplicates identical normalized names (huge cost saver!)
   - Fans out in chunks of 100 items
   - Publishes progress to Realtime channel
   - 20 concurrent items per batch (doesn't starve interactive queries)

4. **Results available at**
   ```
   /batches/[batchId]
   - Live progress bar
   - Per-item status
   - Failed items with retry
   - Download result CSV
   ```

### Cost Example

**Batch of 10k institutions:**
- 2k unique after dedup
- 2k validations queued
- Avg 500ms per validation
- ~1000 seconds of compute (~$0.30 Vercel + $0.20 LLM)
- **Total: ~$0.50**

---

## Manual Operations

### Check System Health

```bash
curl https://your-domain/api/health

# Response:
{
  "status": "ok",  // or "degraded" / "unhealthy"
  "checks": {
    "database": "ok",
    "redis": "ok",
    "inngest": "ok"
  }
}
```

### View Recent Validations

```sql
SELECT normalized_name, verdict, confidence, response_time_ms
FROM validation_runs
ORDER BY created_at DESC
LIMIT 100;
```

### Force Revalidation of Single Institution

```bash
POST /api/institutions/:id/revalidate
Content-Type: application/json

{ "force": true, "maxTier": "finalize" }

# Returns: { runId, validationUrl }
```

### Replay Failed Validation

```bash
# 1. Find failed run
SELECT * FROM validation_runs WHERE id = 123 AND state = 'error';

# 2. Requeue
curl -X POST /api/validations/replay \
  -H "Content-Type: application/json" \
  -d '{"runId": "..."}'
```

### List Current Queue Depth

```bash
curl -X GET "https://app.inngest.com/api/queue-stats" \
  -H "Authorization: Bearer $INNGEST_SIGNING_KEY"
```

---

## Troubleshooting

### Problem: Validations are slow (>5s)

**Check:**
1. Is Redis healthy? `redis-cli ping`
2. What's the LLM provider latency? Check Gemini/Qwen dashboards
3. Is there a registry ingest in progress? `SELECT COUNT(*) FROM validation_runs WHERE state='running'`

**Solution:**
- Kill long-running ingests: they have low priority and should yield
- Lower search concurrency if Searxng is degraded
- Switch LLM provider if one is timing out

### Problem: Batch got stuck at 50% progress

**Symptoms:**
- Batch state is "running" for >2 hours
- Last progress update >30 min ago
- Items in batch_items are still "pending"

**Cause:**
- Inngest worker crashed or lost connection
- Queue is backed up

**Fix:**
```bash
# 1. Check Inngest logs
curl -X GET "https://app.inngest.com/api/jobs?batchId=123"

# 2. Mark batch as failed and create dead letters
UPDATE batches SET state='failed' WHERE id=123;

# 3. Retry failed items
POST /api/batches/123/retry-failed
```

### Problem: Dead letters queue is growing

**Check:**
```sql
SELECT kind, COUNT(*) as count, MAX(last_attempt_at)
FROM dead_letters
WHERE resolved_at IS NULL
GROUP BY kind
ORDER BY count DESC;
```

**Common causes:**
- Search engine is down (circuit breaker opened)
- Registry connector URL changed
- Database connection pool exhausted

**Fix:**
- If search is down: temporarily disable in feature_flags
- If registry: check authority URL in `authorities` table
- If database: increase pool size in `DATABASE_POOL_SIZE`

---

## Cost Optimization

### Monthly Cost Breakdown (10k validations/day)

| Component | Monthly | Notes |
|-----------|---------|-------|
| Vercel (functions) | $2-5 | Auto-scales, 300s timeout |
| Neon (database) | $15-30 | 1M compute units included |
| Upstash (Redis) | $5-10 | 10GB storage, 1000 reqs/sec |
| Inngest (events) | $0-20 | Free tier: 100k/mo |
| Searxng (self-hosted VPS) | ~$4 | Hetzner CX22 |
| **Total** | **$26-59** | Excludes LLM/Gemini costs |

### Cost Savers

1. **Batch deduplication** - Reduces queries by 50-70% on CSV uploads
2. **Cache warming** - Improves hit rate from 45% → 75%
3. **Metrics rollup** - Eliminates expensive aggregation queries
4. **Concurrency limits** - Prevents runaway LLM costs

### Optimization Opportunities

- [ ] Use embedding vectors for name matching (60% faster than LLM)
- [ ] Cache website snapshots for 30 days
- [ ] Compress old validation_runs to S3 (archive after 90 days)
- [ ] Use connection pooling for database (5-10x faster)

---

## Environment Variables

See `.env.example` for complete list. Key ones:

```bash
# Database
DATABASE_URL="postgresql://..."
DATABASE_POOL_SIZE=10

# Cache
REDIS_URL="https://default:..."
CACHE_DEFAULT_TTL_SECONDS=3600

# Search
SEARXNG_URL="http://search.example.com"
SEARCH_TIMEOUT_MS=5000

# LLM
GEMINI_API_KEY="..."  # Dev
LLM_ENDPOINT="https://..."  # Prod (Qwen)

# Batch processing
VERCEL_BLOB_TOKEN="..."
MAX_BATCH_SIZE=50000
BATCH_CHUNK_SIZE=100

# Observability
SENTRY_DSN="..."
METRICS_TOKEN="..."  # for /api/metrics endpoint
```

---

## Emergency Procedures

### Database Migration Failed

```bash
# Rollback to previous migration
pnpm db:rollback

# Run specific migration
pnpm db:migrate --target 20260728_create_batches
```

### Cache is poisoned (returning stale data)

```bash
# Clear all cache
redis-cli FLUSHALL

# Warm critical paths
curl -X POST /api/crons/cache-warm
```

### LLM provider is down

```bash
# Switch provider
# 1. Edit feature_flags table
UPDATE feature_flags SET value = 'false' WHERE key = 'USE_LLM_REASONING';

# 2. Validations will skip LLM stages (faster but less accurate)
# 3. When provider is back:
UPDATE feature_flags SET value = 'true' WHERE key = 'USE_LLM_REASONING';
```

---

## Monitoring & Alerting

Configure these in your monitoring tool (Sentry, DataDog, etc.):

- [ ] **Dead letters queue size** — alert if > 100
- [ ] **Batch processing latency** — alert if p95 > 60s
- [ ] **Cache hit rate** — alert if < 50%
- [ ] **Search provider failures** — alert if > 5/min
- [ ] **Database connection pool** — alert if usage > 80%
- [ ] **Inngest job failures** — alert if > 1% failure rate

---

**Questions?** Check the architecture section in [MASTER-PLAN.md](../MASTER-PLAN.md) or ask in #ops Slack.
