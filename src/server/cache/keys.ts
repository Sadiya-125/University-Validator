/**
 * Typed cache key builders with KEY_VERSION prefix.
 * All keys follow the pattern: v<VERSION>:<category>:<key>
 *
 * Categories:
 * - verdict: validation verdicts (6h TTL)
 * - inst: institution data (1h TTL)
 * - search: search results by provider (7d TTL)
 * - page: rendered pages (24h TTL)
 * - llm: LLM call results (30d TTL)
 * - embed: text embeddings (90d TTL)
 * - lock: distributed locks (60s TTL)
 * - cb: circuit breaker state
 * - quota: API quota counters
 * - flags: feature flags (60s TTL)
 */

const KEY_VERSION = 1;

export const CacheKeys = {
  /**
   * Verdict cache: institution validation result
   * Key: verdict:6f0a8c6d (hashed institution name)
   * TTL: 6 hours (stale-while-revalidate kicks in after 5h)
   */
  verdict: (nameHash: string) => `v${KEY_VERSION}:verdict:${nameHash}`,

  /**
   * Institution cache: canonical institution data
   * Key: inst:12345 (institution ID)
   * TTL: 1 hour
   */
  institution: (id: number) => `v${KEY_VERSION}:inst:${id}`,

  /**
   * Institution by slug: slug -> ID mapping
   * Key: inst-slug:iit-bombay
   * TTL: 24 hours
   */
  institutionSlug: (slug: string) => `v${KEY_VERSION}:inst-slug:${slug}`,

  /**
   * Search results: cached from provider
   * Key: search:searxng:abc123def (provider:queryHash)
   * TTL: 7 days for positive results, 6 hours for negative
   */
  searchResult: (provider: string, queryHash: string) => `v${KEY_VERSION}:search:${provider}:${queryHash}`,

  /**
   * Rendered page: cached HTML from browser worker
   * Key: page:abc123def456 (urlHash)
   * TTL: 24 hours
   */
  renderedPage: (urlHash: string) => `v${KEY_VERSION}:page:${urlHash}`,

  /**
   * LLM call result: cached completion
   * Key: llm:reasoning:abc123def (stage:promptHash)
   * TTL: 30 days
   */
  llmResult: (stage: string, promptHash: string) => `v${KEY_VERSION}:llm:${stage}:${promptHash}`,

  /**
   * Text embedding: cached vector
   * Key: embed:abc123def (textHash)
   * TTL: 90 days
   */
  embedding: (textHash: string) => `v${KEY_VERSION}:embed:${textHash}`,

  /**
   * Distributed lock (single-flight pattern)
   * Key: lock:validate:IIT Bombay (lockType:identifier)
   * TTL: 60 seconds (auto-extends during operation)
   */
  lock: (type: string, identifier: string) => `v${KEY_VERSION}:lock:${type}:${identifier}`,

  /**
   * Circuit breaker state
   * Key: cb:searxng (provider)
   * Stores: { state: "closed|open|half_open", failures: N, openedAt: timestamp }
   */
  circuitBreaker: (provider: string) => `v${KEY_VERSION}:cb:${provider}`,

  /**
   * API quota counter (daily)
   * Key: quota:gcse:2026-07-25 (provider:date)
   * TTL: 24 hours
   */
  quota: (provider: string, date: string) => `v${KEY_VERSION}:quota:${provider}:${date}`,

  /**
   * Feature flags (all flags cached together)
   * Key: flags:all
   * TTL: 60 seconds
   * Value: JSON object of all flag key-value pairs
   */
  featureFlags: () => `v${KEY_VERSION}:flags:all`,

  /**
   * Request tracing context (for async logging)
   * Key: trace:abc-123-def (requestId)
   * TTL: 5 minutes (expires when request completes)
   */
  traceContext: (requestId: string) => `v${KEY_VERSION}:trace:${requestId}`,

  /**
   * Provider health stats
   * Key: health:searxng (provider)
   * Stores: { state: ..., failures: N, p50: X, p95: Y }
   */
  providerHealth: (provider: string) => `v${KEY_VERSION}:health:${provider}`,

  /**
   * Rate limit counter (sliding window)
   * Key: ratelimit:api-validate:192.168.1.1 (scope:identifier)
   * TTL: varies by limit window
   */
  rateLimit: (scope: string, identifier: string) => `v${KEY_VERSION}:ratelimit:${scope}:${identifier}`,

  /**
   * Identity graph cache (transitive relationships)
   * Key: identity:12345 (institutionId)
   * TTL: 1 hour
   * Value: all aliases and linked identities
   */
  identity: (institutionId: number) => `v${KEY_VERSION}:identity:${institutionId}`,

  /**
   * Registry snapshot metadata (latest published snapshot per authority)
   * Key: snapshot:UGC (authorityCode)
   * TTL: 5 minutes (republishes when new snapshot available)
   */
  registrySnapshot: (authorityCode: string) => `v${KEY_VERSION}:snapshot:${authorityCode}`,
} as const;

/**
 * TTL constants (in seconds).
 */
export const CacheTTL = {
  VERDICT: 6 * 60 * 60, // 6 hours, stale-while-revalidate kicks in at 5h
  INSTITUTION: 1 * 60 * 60, // 1 hour
  INSTITUTION_SLUG: 24 * 60 * 60, // 24 hours
  SEARCH_POSITIVE: 7 * 24 * 60 * 60, // 7 days
  SEARCH_NEGATIVE: 6 * 60 * 60, // 6 hours (don't cache empty results long)
  RENDERED_PAGE: 24 * 60 * 60, // 24 hours
  LLM_RESULT: 30 * 24 * 60 * 60, // 30 days
  EMBEDDING: 90 * 24 * 60 * 60, // 90 days
  LOCK: 60, // 60 seconds
  QUOTA: 24 * 60 * 60, // 24 hours (daily reset)
  FEATURE_FLAGS: 60, // 60 seconds
  TRACE_CONTEXT: 5 * 60, // 5 minutes
  PROVIDER_HEALTH: 5 * 60, // 5 minutes
  IDENTITY: 1 * 60 * 60, // 1 hour
  REGISTRY_SNAPSHOT: 5 * 60, // 5 minutes
} as const;

export type CacheKeyType = typeof CacheKeys[keyof typeof CacheKeys];
