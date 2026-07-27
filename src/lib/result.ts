/**
 * Result<T, E> type for explicit error handling.
 * Inspired by Rust's Result and Haskell's Either.
 * Eliminates the need for try/catch in many scenarios.
 */

export type Result<T, E = Error> = { status: "ok"; data: T } | { status: "error"; error: E };

/**
 * Create a successful result.
 */
export function ok<T, E = Error>(data: T): Result<T, E> {
  return { status: "ok", data };
}

/**
 * Create an error result.
 */
export function err<T, E = Error>(error: E): Result<T, E> {
  return { status: "error", error };
}

/**
 * Check if a result is a success.
 */
export function isOk<T, E>(result: Result<T, E>): result is { status: "ok"; data: T } {
  return result.status === "ok";
}

/**
 * Check if a result is an error.
 */
export function isErr<T, E>(result: Result<T, E>): result is { status: "error"; error: E } {
  return result.status === "error";
}

/**
 * Wrap an async function that may throw and return it as a Result.
 * Useful for converting exception-based APIs to Result-based.
 *
 * @example
 * const result = await tryAsync(async () => {
 *   return await someAsyncFunction();
 * });
 * if (isOk(result)) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export async function tryAsync<T, E = Error>(
  fn: () => Promise<T>,
  errorHandler?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    if (errorHandler) {
      return err(errorHandler(error));
    }
    return err(error as E);
  }
}

/**
 * Map a Result's success value to another type.
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (isErr(result)) {
    return result;
  }
  return ok(fn(result.data));
}

/**
 * Map a Result's error value to another type.
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isOk(result)) {
    return result;
  }
  return err(fn(result.error));
}

/**
 * Chain/flatMap a Result.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>
): Result<U, E> {
  if (isErr(result)) {
    return result;
  }
  return fn(result.data);
}

/**
 * Get the value from a Result, or throw if it's an error.
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw result.error;
}

/**
 * Get the value from a Result, or return a default if it's an error.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Get the value from a Result, or compute a value from the error.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (isOk(result)) {
    return result.data;
  }
  return fn(result.error);
}
