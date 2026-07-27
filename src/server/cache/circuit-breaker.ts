/**
 * Circuit breaker pattern for resilience.
 * Tracks provider failures and opens circuit after threshold (5 failures/60s).
 * Half-open state allows periodic probe requests.
 *
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Failing fast (120s cooldown)
 * - HALF_OPEN: Testing if service recovered
 */

import { getRedis } from "./redis";
import { CacheKeys } from "./keys";
import { CircuitOpenError } from "@/lib/errors";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  openedAt?: number;
  lastSuccessAt?: number;
  p50Ms?: number;
  p95Ms?: number;
}

/**
 * Default configuration for circuit breaker.
 */
export const CircuitBreakerConfig = {
  FAILURE_THRESHOLD: 5, // Failures before opening
  FAILURE_WINDOW_MS: 60000, // Time window for counting failures (60s)
  OPEN_TIMEOUT_MS: 120000, // Time circuit stays open (120s)
  HALF_OPEN_MAX_REQUESTS: 3, // Max requests allowed in half-open state
} as const;

/**
 * Execute a function through a circuit breaker.
 * Records latency and failures, manages state transitions.
 *
 * @param provider Provider name (e.g., "searxng", "aicte_api")
 * @param fn Function to execute
 * @param options Configuration overrides
 * @returns Result from fn
 * @throws CircuitOpenError if circuit is open
 */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: () => Promise<T>,
  options?: Partial<Record<keyof typeof CircuitBreakerConfig, number>>
): Promise<T> {
  const config = { ...CircuitBreakerConfig, ...options };
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    // Get current state
    const state = await getCircuitBreakerState(provider);

    // Check if open
    if (state.state === "open") {
      // Check if we should transition to half-open
      if (state.openedAt && Date.now() - state.openedAt > config.OPEN_TIMEOUT_MS) {
        // Transition to half-open
        await updateCircuitBreakerState(provider, "half_open", 0);
      } else {
        throw new CircuitOpenError(provider, { state: "open", openedAt: state.openedAt });
      }
    }

    // In half-open state, limit requests
    if (state.state === "half_open" && state.failures >= config.HALF_OPEN_MAX_REQUESTS) {
      throw new CircuitOpenError(provider, { state: "half_open", maxRequests: config.HALF_OPEN_MAX_REQUESTS });
    }

    // Execute function with timing
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      // Success: reset failures, close circuit if in half-open
      await recordSuccess(provider, duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Failure: increment counter, possibly open circuit
      await recordFailure(provider, duration, config);

      throw error;
    }
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      throw error;
    }
    // Other errors: re-throw without recording
    throw error;
  }
}

/**
 * Get current circuit breaker state.
 */
async function getCircuitBreakerState(provider: string): Promise<CircuitBreakerStatus> {
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    const data = await redis.hgetall(cbKey);

    if (!data || Object.keys(data).length === 0) {
      return {
        state: "closed",
        failures: 0,
      };
    }

    return {
      state: (data.state as CircuitState) || "closed",
      failures: parseInt(String(data.failures)) || 0,
      openedAt: data.openedAt ? parseInt(String(data.openedAt)) : undefined,
      lastSuccessAt: data.lastSuccessAt ? parseInt(String(data.lastSuccessAt)) : undefined,
      p50Ms: data.p50Ms ? parseFloat(String(data.p50Ms)) : undefined,
      p95Ms: data.p95Ms ? parseFloat(String(data.p95Ms)) : undefined,
    };
  } catch (error) {
    console.error(`Failed to get circuit breaker state for ${provider}:`, error);
    return { state: "closed", failures: 0 };
  }
}

/**
 * Record a successful call.
 */
async function recordSuccess(provider: string, durationMs: number) {
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    await (redis.hset as any)(cbKey, "state", "closed");
    await (redis.hset as any)(cbKey, "failures", "0");
    await (redis.hset as any)(cbKey, "lastSuccessAt", String(Date.now()));

    // Update latency percentiles (simple moving average for now)
    const current = await redis.hget(cbKey, "p50Ms");
    if (current) {
      const avg = (parseFloat(String(current)) + durationMs) / 2;
      await (redis.hset as any)(cbKey, "p50Ms", String(avg));
    } else {
      await (redis.hset as any)(cbKey, "p50Ms", String(durationMs));
    }

    // Set TTL
    await redis.expire(cbKey, 3600); // Keep for 1 hour
  } catch (error) {
    console.error(`Failed to record success for ${provider}:`, error);
  }
}

/**
 * Record a failed call.
 */
async function recordFailure(
  provider: string,
  durationMs: number,
  config: Record<keyof typeof CircuitBreakerConfig, number>
) {
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    const state = await getCircuitBreakerState(provider);
    const newFailures = state.failures + 1;

    await (redis.hset as any)(cbKey, "failures", String(newFailures));

    // Check if we should open
    if (newFailures >= config.FAILURE_THRESHOLD) {
      await (redis.hset as any)(cbKey, "state", "open");
      await (redis.hset as any)(cbKey, "openedAt", String(Date.now()));
    }

    // Update latency percentiles
    const current = await redis.hget(cbKey, "p95Ms");
    if (current) {
      const avg = (parseFloat(String(current)) + durationMs) / 2;
      await (redis.hset as any)(cbKey, "p95Ms", String(avg));
    } else {
      await (redis.hset as any)(cbKey, "p95Ms", String(durationMs));
    }

    // Set TTL
    await redis.expire(cbKey, 3600);
  } catch (error) {
    console.error(`Failed to record failure for ${provider}:`, error);
  }
}

/**
 * Manually update circuit breaker state (for testing or manual recovery).
 */
export async function updateCircuitBreakerState(
  provider: string,
  state: CircuitState,
  failures: number = 0
) {
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    await (redis.hset as any)(cbKey, "state", state);
    await (redis.hset as any)(cbKey, "failures", String(failures));

    if (state === "open") {
      await (redis.hset as any)(cbKey, "openedAt", String(Date.now()));
    }

    await redis.expire(cbKey, 3600);
  } catch (error) {
    console.error(`Failed to update circuit breaker state for ${provider}:`, error);
  }
}

/**
 * Reset circuit breaker (close and clear failures).
 */
export async function resetCircuitBreaker(provider: string) {
  const redis = getRedis();
  const cbKey = CacheKeys.circuitBreaker(provider);

  try {
    await redis.del(cbKey);
  } catch (error) {
    console.error(`Failed to reset circuit breaker for ${provider}:`, error);
  }
}

/**
 * Get circuit breaker health for monitoring.
 */
export async function getCircuitBreakerHealth(provider: string): Promise<CircuitBreakerStatus> {
  return getCircuitBreakerState(provider);
}

/**
 * List all circuit breakers and their states.
 */
export async function getAllCircuitBreakerStates(providers: string[]): Promise<Map<string, CircuitBreakerStatus>> {
  const states = new Map<string, CircuitBreakerStatus>();

  for (const provider of providers) {
    states.set(provider, await getCircuitBreakerState(provider));
  }

  return states;
}
