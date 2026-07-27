/**
 * Cache layer exports.
 * Includes Redis client, caching, locking, rate limiting, circuit breaker, and flags.
 */

export { getRedis, redis, resetRedis } from "./redis";
export { CacheKeys, CacheTTL } from "./keys";
export { cached, invalidateCache, invalidateCacheBatch, getCacheMetrics, resetCacheMetrics } from "./cache";
export { withLock, tryAcquireLock, releaseLock, extendLock, withBatchLocks } from "./locks";
export {
  checkRateLimit,
  enforceRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  ProviderLimits,
} from "./ratelimit";
export {
  withCircuitBreaker,
  updateCircuitBreakerState,
  resetCircuitBreaker,
  getCircuitBreakerHealth,
  getAllCircuitBreakerStates,
  CircuitBreakerConfig,
  type CircuitState,
  type CircuitBreakerStatus,
} from "./circuit-breaker";
export {
  isEnabled,
  setFlag,
  getAllFlags,
  invalidateFlagsCache,
  initializeFlags,
  resetFlags,
  type FeatureFlagKey,
} from "./flags";
