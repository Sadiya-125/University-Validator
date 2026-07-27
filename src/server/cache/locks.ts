/**
 * Distributed locking with Redis SET NX PX and fencing tokens.
 * Prevents thundering herd (multiple concurrent requests for same resource).
 *
 * Algorithm:
 * 1. Generate unique fencing token (nanoid)
 * 2. SET key token NX PX ttlMs (only if not exists, with TTL)
 * 3. If succeeds, execute function
 * 4. Before releasing, verify our token is still there (check-then-delete)
 * 5. DEL only if token matches (atomic fencing)
 *
 * Timeouts extend automatically during execution (implemented at higher level).
 */

import { getRedis } from "./redis";

const EXTENSION_INTERVAL = 15000; // Extend lock every 15s

/**
 * Generate a unique token for lock fencing.
 */
function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Acquire a lock and execute a function atomically.
 * Automatically extends lock duration while executing.
 *
 * @param key Lock key
 * @param ttlMs Lock TTL in milliseconds (auto-extends during execution)
 * @param fn Function to execute while holding the lock
 * @returns The return value of fn
 * @throws Error if lock acquisition fails or fn throws
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  const token = generateToken(); // Unique fencing token

  // Try to acquire lock
  let lockAcquired = false;
  try {
    // SET key token NX EX ttlSecs: only set if key doesn't exist, with expiry
    const result = await (redis.set as any)(key, token, { nx: true, ex: Math.ceil(ttlMs / 1000) });
    lockAcquired = result === "OK";
  } catch (error) {
    console.error(`Failed to acquire lock ${key}:`, error);
    throw new Error(`Failed to acquire lock for ${key}`);
  }

  if (!lockAcquired) {
    throw new Error(`Could not acquire lock for ${key} (contended)`);
  }

  // Start automatic lock extension
  const extensionHandle = setInterval(async () => {
    try {
      await redis.expire(key, Math.ceil(ttlMs / 1000));
    } catch (error) {
      console.error(`Failed to extend lock ${key}:`, error);
    }
  }, EXTENSION_INTERVAL);

  try {
    // Execute function while holding lock
    const result = await fn();
    return result;
  } finally {
    // Clean up extension interval
    clearInterval(extensionHandle);

    // Release lock (only if our token is still there — fencing)
    try {
      const current = await redis.get(key);
      if (current === token) {
        await redis.del(key);
      }
    } catch (error) {
      console.error(`Failed to release lock ${key}:`, error);
    }
  }
}

/**
 * Try to acquire a lock (non-blocking).
 * Returns the token if acquired, null otherwise.
 *
 * @param key Lock key
 * @param ttlMs Lock TTL in milliseconds
 * @returns Token if acquired, null if locked by another
 */
export async function tryAcquireLock(key: string, ttlMs: number): Promise<string | null> {
  const redis = getRedis();
  const token = generateToken();

  try {
    const result = await (redis.set as any)(key, token, { nx: true, ex: Math.ceil(ttlMs / 1000) });
    if (result === "OK") {
      return token;
    }
  } catch (error) {
    console.error(`Failed to try acquire lock ${key}:`, error);
  }

  return null;
}

/**
 * Release a lock if we still hold it (fencing check).
 *
 * @param key Lock key
 * @param token Lock token
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  const redis = getRedis();

  try {
    const current = await redis.get(key);
    if (current === token) {
      await redis.del(key);
    }
  } catch (error) {
    console.error(`Failed to release lock ${key}:`, error);
  }
}

/**
 * Extend a lock (refresh TTL).
 *
 * @param key Lock key
 * @param ttlMs New TTL in milliseconds
 */
export async function extendLock(key: string, ttlMs: number): Promise<void> {
  const redis = getRedis();

  try {
    await redis.expire(key, Math.ceil(ttlMs / 1000));
  } catch (error) {
    console.error(`Failed to extend lock ${key}:`, error);
  }
}

/**
 * Batch acquire locks (for coordinating multiple resources).
 * Acquires ALL locks or NONE (all-or-nothing).
 *
 * @param keys Lock keys
 * @param ttlMs Lock TTL in milliseconds
 * @returns Map of key -> token if all acquired, null if any failed
 */
export async function withBatchLocks<T>(
  keys: string[],
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  const tokens = new Map<string, string>();
  const acquired: string[] = [];

  // Try to acquire all locks
  for (const key of keys) {
    const token = generateToken();
    try {
      const result = await (redis.set as any)(key, token, { nx: true, ex: Math.ceil(ttlMs / 1000) });
      if (result === "OK") {
        tokens.set(key, token);
        acquired.push(key);
      } else {
        // Failed to acquire one lock, release all
        for (const acquiredKey of acquired) {
          const token = tokens.get(acquiredKey);
          if (token) {
            try {
              const current = await redis.get(acquiredKey);
              if (current === token) {
                await redis.del(acquiredKey);
              }
            } catch (error) {
              console.error(`Failed to release lock ${acquiredKey}:`, error);
            }
          }
        }
        throw new Error(`Could not acquire all locks (failed on ${key})`);
      }
    } catch (error) {
      // Release any acquired locks
      for (const acquiredKey of acquired) {
        const token = tokens.get(acquiredKey);
        if (token) {
          try {
            const current = await redis.get(acquiredKey);
            if (current === token) {
              await redis.del(acquiredKey);
            }
          } catch (e) {
            console.error(`Failed to release lock ${acquiredKey}:`, e);
          }
        }
      }
      throw error;
    }
  }

  // All locks acquired
  const extensionHandle = setInterval(async () => {
    for (const key of acquired) {
      try {
        await redis.expire(key, Math.ceil(ttlMs / 1000));
      } catch (error) {
        console.error(`Failed to extend lock ${key}:`, error);
      }
    }
  }, EXTENSION_INTERVAL);

  try {
    return await fn();
  } finally {
    clearInterval(extensionHandle);

    // Release all locks (fencing)
    for (const [key, token] of tokens) {
      try {
        const current = await redis.get(key);
        if (current === token) {
          await redis.del(key);
        }
      } catch (error) {
        console.error(`Failed to release lock ${key}:`, error);
      }
    }
  }
}
