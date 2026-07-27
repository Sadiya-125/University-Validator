/**
 * Application error taxonomy.
 * All user-facing and system errors inherit from AppError.
 * Each error has a stable code, retryable flag, and safe public message.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "TIMEOUT_ERROR"
  | "RATE_LIMIT_ERROR"
  | "CIRCUIT_OPEN"
  | "BUDGET_EXCEEDED"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  code: ErrorCode;
  statusCode: number;
  message: string;
  publicMessage: string;
  retryable: boolean;
  cause?: Error | unknown | null;
  context?: Record<string, unknown> | null;
}

/**
 * Base application error class.
 * All application errors should inherit from this.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly publicMessage: string;
  readonly retryable: boolean;
  readonly context?: Record<string, unknown> | null;
  readonly cause?: Error | unknown | null;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.publicMessage = options.publicMessage;
    this.retryable = options.retryable;
    this.context = options.context;
    this.cause = options.cause;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Validation failed on user input or request data.
 * HTTP: 400 Bad Request
 * Retryable: No
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown> | null) {
    super({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message,
      publicMessage: "The provided data is invalid. Please check and try again.",
      retryable: false,
      context,
    });
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Requested resource not found.
 * HTTP: 404 Not Found
 * Retryable: No
 */
export class NotFoundError extends AppError {
  constructor(resource: string, context?: Record<string, unknown> | null) {
    super({
      code: "NOT_FOUND",
      statusCode: 404,
      message: `${resource} not found`,
      publicMessage: `The requested ${resource} could not be found.`,
      retryable: false,
      context,
    });
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error from an upstream service or API.
 * HTTP: 502 Bad Gateway (default) or 503 Service Unavailable
 * Retryable: Yes (for 5xx)
 */
export class UpstreamError extends AppError {
  readonly provider: string;
  readonly upstreamStatus?: number;

  constructor(
    provider: string,
    message: string,
    options?: {
      statusCode?: number;
      upstreamStatus?: number;
      context?: Record<string, unknown> | null;
      cause?: Error | unknown | null;
    }
  ) {
    const statusCode = options?.statusCode ?? (options?.upstreamStatus ?? 500) >= 500 ? 502 : 503;
    const retryable = (options?.upstreamStatus ?? 500) >= 500;

    super({
      code: "UPSTREAM_ERROR",
      statusCode,
      message: `${provider}: ${message}`,
      publicMessage: `${provider} is temporarily unavailable. Please try again in a moment.`,
      retryable,
      context: {
        provider,
        upstreamStatus: options?.upstreamStatus,
        ...options?.context,
      },
      cause: options?.cause,
    });
    this.name = "UpstreamError";
    this.provider = provider;
    this.upstreamStatus = options?.upstreamStatus;
    Object.setPrototypeOf(this, UpstreamError.prototype);
  }
}

/**
 * Request timeout (to upstream, database, etc).
 * HTTP: 504 Gateway Timeout
 * Retryable: Yes
 */
export class TimeoutError extends AppError {
  readonly timeoutMs: number;

  constructor(service: string, timeoutMs: number, context?: Record<string, unknown> | null) {
    super({
      code: "TIMEOUT_ERROR",
      statusCode: 504,
      message: `${service} request timed out after ${timeoutMs}ms`,
      publicMessage: `${service} is not responding. Please try again.`,
      retryable: true,
      context: { service, timeoutMs, ...context },
    });
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Rate limit exceeded (429 Too Many Requests).
 * HTTP: 429 Too Many Requests
 * Retryable: Yes (with backoff)
 */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(provider: string, retryAfterSeconds?: number, context?: Record<string, unknown> | null) {
    super({
      code: "RATE_LIMIT_ERROR",
      statusCode: 429,
      message: `Rate limit exceeded for ${provider}`,
      publicMessage: `Too many requests. Please try again in a moment.`,
      retryable: true,
      context: { provider, retryAfterSeconds, ...context },
    });
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds ?? 60;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Circuit breaker is open (too many recent failures).
 * HTTP: 503 Service Unavailable
 * Retryable: Yes (after cooldown)
 */
export class CircuitOpenError extends AppError {
  readonly service: string;

  constructor(service: string, context?: Record<string, unknown> | null) {
    super({
      code: "CIRCUIT_OPEN",
      statusCode: 503,
      message: `Circuit breaker open for ${service}`,
      publicMessage: `${service} is temporarily unavailable due to repeated failures. Please try again later.`,
      retryable: true,
      context: { service, ...context },
    });
    this.name = "CircuitOpenError";
    this.service = service;
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}

/**
 * Budget ceiling exceeded (LLM token budget, compute budget, etc).
 * HTTP: 402 Payment Required (per HTTP spec for quota exceeded)
 * Retryable: No (until quota resets)
 */
export class BudgetExceededError extends AppError {
  readonly budgetType: string;
  readonly used: number;
  readonly limit: number;

  constructor(
    budgetType: string,
    used: number,
    limit: number,
    context?: Record<string, unknown> | null
  ) {
    super({
      code: "BUDGET_EXCEEDED",
      statusCode: 402,
      message: `${budgetType} budget exceeded: ${used}/${limit}`,
      publicMessage: `${budgetType} quota has been exceeded. Please try again later or upgrade your plan.`,
      retryable: false,
      context: { budgetType, used, limit, ...context },
    });
    this.name = "BudgetExceededError";
    this.budgetType = budgetType;
    this.used = used;
    this.limit = limit;
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

/**
 * Invalid configuration (missing env var, misconfigured service, etc).
 * HTTP: 500 Internal Server Error
 * Retryable: No (config must be fixed manually)
 */
export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown> | null) {
    super({
      code: "CONFIG_ERROR",
      statusCode: 500,
      message: `Configuration error: ${message}`,
      publicMessage: "An internal configuration error occurred. Please contact support.",
      retryable: false,
      context,
    });
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Unexpected internal error.
 * HTTP: 500 Internal Server Error
 * Retryable: Depends on context
 */
export class InternalError extends AppError {
  constructor(message: string, options?: { retryable?: boolean; context?: Record<string, unknown> | null }) {
    super({
      code: "INTERNAL_ERROR",
      statusCode: 500,
      message,
      publicMessage: "An internal error occurred. Please try again or contact support.",
      retryable: options?.retryable ?? false,
      context: options?.context,
    });
    this.name = "InternalError";
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

/**
 * Type guard: check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalize any error to an AppError.
 * If already an AppError, returns as-is.
 * If unknown, wraps in InternalError.
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return new InternalError(`Unexpected error: ${message}`, {
    context: { originalError: message, stack },
  });
}
