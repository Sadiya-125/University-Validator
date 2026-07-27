# Infrastructure Setup & Operations

This directory contains the self-hosted infrastructure for the University Validation Platform: SearXNG, browser-worker, embeddings service, and reverse proxy.

## Quick Start

### 1. Provision a VPS

- **Recommended:** Hetzner CX22 (€3.79/month) or equivalent (2 vCPU, 4GB RAM, 40GB SSD)
- **Requirements:**
  - Ubuntu 22.04 LTS or newer
  - Docker + Docker Compose
  - SSH access (key-based auth, no passwords)
  - UFW firewall (allow 22, 80, 443 only)

### 2. Prepare DNS

Create three A records pointing to your VPS IP:
```
search.your-domain.tld     A  <VPS_IP>
browser.your-domain.tld    A  <VPS_IP>
embed.your-domain.tld      A  <VPS_IP>
```

### 3. SSH Into VPS & Clone Infrastructure

```bash
ssh root@<VPS_IP>

# Create working directory
mkdir -p /opt/uv-infra
cd /opt/uv-infra

# Copy infrastructure files
scp -r infra/* root@<VPS_IP>:/opt/uv-infra/

# Create environment file
cat > .env << EOF
DOMAIN=your-domain.tld
INFRA_TOKEN=$(openssl rand -hex 32)
SEARXNG_SECRET=$(openssl rand -hex 32)
EOF

chmod 600 .env
```

### 4. Build & Start Services

```bash
cd /opt/uv-infra

# Build browser-worker image
docker compose build browser-worker

# Start all services
docker compose up -d

# Check status
docker compose logs -f
```

### 5. Verify Installation

Verify that all services are healthy and responding to requests:
```bash
# Test SearXNG JSON endpoint
curl -H "Authorization: Bearer $INFRA_TOKEN" \
  "https://search.your-domain.tld/search?q=test&format=json" \
  | jq '.results | length'

# Test browser worker health
curl -H "Authorization: Bearer $INFRA_TOKEN" \
  "https://browser.your-domain.tld/health" \
  | jq .

# Test embeddings endpoint
curl -H "Authorization: Bearer $INFRA_TOKEN" \
  -X POST https://embed.your-domain.tld/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs":"test"}' \
  | jq '.embeddings[0] | length'
```

## File Structure

```
infra/
├── docker-compose.yml       Main service orchestration
├── Caddyfile               Reverse proxy configuration
├── searxng/
│   └── settings.yml        SearXNG configuration
├── browser-worker/
│   ├── src/
│   │   ├── index.ts        Fastify server + routes
│   │   ├── pool.ts         Browser pool management
│   │   ├── types.ts        TypeScript types
│   │   └── ssrf.ts         SSRF protection
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
└── README.md              (this file)
```

## Environment Variables

### Application (.env in /opt/uv-infra)

```bash
DOMAIN=your-domain.tld              # Domain name
INFRA_TOKEN=<random-64-hex>         # Bearer token for all endpoints
SEARXNG_SECRET=<random-64-hex>      # SearXNG encryption key
```

### VPS UFW Firewall Setup

```bash
# SSH into VPS
ssh root@<VPS_IP>

# Allow SSH (port 22), HTTP (80), HTTPS (443)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Verify
ufw status
```

## Services

### Caddy (Reverse Proxy)

Handles TLS termination, routing, and bearer token authentication.

**Endpoints:**
- `https://search.{$DOMAIN}/` → SearXNG (port 8080)
- `https://browser.{$DOMAIN}/` → Browser Worker (port 3000)
- `https://embed.{$DOMAIN}/` → TEI (port 3000)

All endpoints require `Authorization: Bearer $INFRA_TOKEN` header.

**Healthcheck:** None (Caddy self-reports via logs)

### SearXNG

Metasearch engine. Aggregates results from:
- Mojeek (own index, high DC tolerance)
- DuckDuckGo (Bing-derived, medium DC tolerance)
- Brave (own index, medium-high DC tolerance)
- Marginalia (own index, high DC tolerance)
- Qwant (partial own index, medium DC tolerance)

**Disabled engines:** Google, Bing, Startpage, Yandex (datacenter-IP blocked)

**Healthcheck:** Every 30 seconds (internal)

**Configuration:** `searxng/settings.yml`

### Valkey (Redis-compatible)

In-memory cache for SearXNG and distributed rate limiting.

**Size:** 128MB LRU eviction policy
**Healthcheck:** Every 30 seconds

### Browser Worker

Fastify service managing a pool of Playwright browser instances.

**Pool size:** 2 browsers (configurable in docker-compose.yml)
**Recycle:** Every 50 renders or on crash
**Context handling:** Fresh context per request (never pooled or reused)
**Resource blocking:** Images, fonts, stylesheets, media (reduces render time ~50%)

**Endpoints:**
- `POST /render` — Render URL with optional screenshot
  ```json
  {
    "url": "https://example.com",
    "waitFor": "#content",      // Optional CSS selector
    "screenshot": true,          // Optional
    "timeoutMs": 20000           // Optional
  }
  ```
  Returns: HTML, final URL, timings, console errors, optional screenshot

- `GET /health` — Pool status (no auth required)

**Configuration:**
- `PORT`: 3000
- `BROWSER_POOL_SIZE`: 2 (adjust based on CPU cores)
- `MAX_RENDER_MS`: 20000 (20s timeout per request)
- `RECYCLE_AFTER_RENDERS`: 50
- `MAX_QUEUE_DEPTH`: 20 (return 503 if exceeded)
- `shm_size: 1gb` — **CRITICAL** (Chromium crashes on 64MB default)
- `init: true` — **CRITICAL** (reaps zombie processes)

**Healthcheck:** Every 30 seconds

### TEI (Text Embeddings Inference)

Generates vector embeddings using `intfloat/multilingual-e5-small` model.

**Model:** intfloat/multilingual-e5-small (384-dim, multilingual)
**Memory:** 1.5GB
**Healthcheck:** Every 30 seconds

**Endpoint:**
```bash
curl -X POST https://embed.your-domain.tld/embed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INFRA_TOKEN" \
  -d '{"inputs": ["Hello world"]}'
```

## Monitoring & Troubleshooting

### Check Service Status

```bash
# SSH into VPS
docker compose ps
docker compose logs -f <service_name>
```

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| SearXNG returns empty results | JSON output disabled or engines failing | Check `searxng/settings.yml` has `search.formats: [html, json]`; check `unresponsive_engines` |
| Browser worker OOM | Too many contexts; memory leak | Ensure `shm_size: 1gb` and `init: true` in docker-compose.yml; lower `BROWSER_POOL_SIZE` |
| Caddy cannot issue cert | DNS not pointing to VPS | Verify A records resolve to VPS IP with `nslookup search.your-domain.tld` |
| 503 Service Unavailable | Queue full or service crashed | Check `docker compose ps`; review service logs |

### Restart Services

```bash
# Restart specific service
docker compose restart searxng

# Restart all
docker compose restart

# Full rebuild (rarely needed)
docker compose down
docker compose up -d --build
```

### View Logs

```bash
# Tail recent logs
docker compose logs -f caddy

# Last 100 lines
docker compose logs --tail 100 searxng

# Specific service + timestamps
docker compose logs -t browser-worker
```

### Update SearXNG Configuration

```bash
# Edit settings
nano searxng/settings.yml

# Reload SearXNG (no downtime)
docker compose exec searxng kill -HUP 1

# Or restart if needed
docker compose restart searxng
```

## Maintenance

### Image Updates

```bash
# Check for updates
docker pull caddy:2-alpine
docker pull searxng/searxng:latest
docker pull ghcr.io/huggingface/text-embeddings-inference:cpu-latest

# Rebuild if new digest
docker compose pull
docker compose up -d --build

# Verify services are healthy after updates
docker compose ps
docker compose logs -f
```

### Backup

Persistence is minimal:
- Caddy TLS certs: `caddy_data:/data`
- Valkey cache: Not critical (auto-recovers)
- TEI model: Large; pulls on startup

No persistent data (no database backups needed for infrastructure services).

### Certificate Renewal

Caddy auto-renews Let's Encrypt certificates 30 days before expiry.

**Manual renewal:**
```bash
docker compose exec caddy caddy reload
```

## Production Checklist

- [ ] VPS firewall: UFW allowing 22, 80, 443 only
- [ ] SSH key auth enabled (no password auth)
- [ ] DNS A records created and verified (nslookup)
- [ ] TLS certificates working (curl -I https://search.your-domain.tld)
- [ ] All services healthy: `docker compose ps` and manual endpoint testing
- [ ] INFRA_TOKEN is random (openssl rand -hex 32)
- [ ] docker-compose.yml: browser-worker has `shm_size: 1gb` and `init: true`
- [ ] SearXNG: `search.formats: [html, json]` in settings.yml
- [ ] SearXNG: Problematic engines disabled (google, bing, yandex)
- [ ] Browser-worker: Max queue monitored (`docker compose logs browser-worker`)
- [ ] TEI model downloaded and cached
- [ ] Logs rotated (json-file driver config in place)
- [ ] Monitoring configured (optional: Sentry, OpenTelemetry)

## Support

For issues, refer to:
- **SearXNG:** https://docs.searxng.org
- **Playwright:** https://playwright.dev
- **Caddy:** https://caddyserver.com/docs
- **TEI:** https://huggingface.co/docs/text-embeddings-inference
