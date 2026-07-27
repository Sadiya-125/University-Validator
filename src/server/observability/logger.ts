import pino from "pino";
import { getServerEnv } from "@/lib/env";

// Lazy initialization to avoid issues during hot reloading
let loggerInstance: pino.Logger | null = null;

/**
 * Secret redaction patterns.
 * Redacts sensitive information from logs.
 */
const SECRET_PATTERNS = [
  /("DATABASE_URL"|"DATABASE_POOLED_URL"|"password"|"token"|"secret"|"key"|"api_key"|"apiKey")\s*:\s*"[^"]*"/gi,
  /Authorization\s*:\s*Bearer\s+\S+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
];

/**
 * Redact sensitive information from strings.
 */
function redactSecrets(str: string): string {
  let result = str;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, `$1: "[REDACTED]"`);
  }
  return result;
}

/**
 * Get or create the logger instance.
 */
export function getLogger(): pino.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const env = getServerEnv();

  const pinoConfig: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      env.APP_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: false,
              messageFormat: "{levelLabel} {msg}",
            },
          }
        : undefined,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({ pid: bindings.pid }),
    },
    hooks: {
      logMethod(args, method) {
        // Redact secrets from all log messages
        if (args.length > 0 && typeof args[0] === "string") {
          args[0] = redactSecrets(args[0]);
        }
        if (args.length > 0 && typeof args[0] === "object") {
          const redactedObj = JSON.parse(
            redactSecrets(JSON.stringify(args[0]))
          ) as Record<string, unknown>;
          args[0] = redactedObj;
        }
        return method.apply(this, args);
      },
    },
  };

  loggerInstance = pino(pinoConfig);
  return loggerInstance;
}

/**
 * Create a child logger with additional context.
 *
 * @example
 * const logger = withContext({ runId: "abc123", requestId: "def456" });
 * logger.info("Request started");
 */
export function withContext(
  context: Record<string, string | number | boolean>
): pino.Logger {
  return getLogger().child(context);
}

/**
 * Log at debug level.
 */
export function debug(
  message: string,
  data?: Record<string, unknown>,
  context?: Record<string, string | number | boolean>
): void {
  const logger = context ? withContext(context) : getLogger();
  logger.debug(data || {}, message);
}

/**
 * Log at info level.
 */
export function info(
  message: string,
  data?: Record<string, unknown>,
  context?: Record<string, string | number | boolean>
): void {
  const logger = context ? withContext(context) : getLogger();
  logger.info(data || {}, message);
}

/**
 * Log at warn level.
 */
export function warn(
  message: string,
  data?: Record<string, unknown>,
  context?: Record<string, string | number | boolean>
): void {
  const logger = context ? withContext(context) : getLogger();
  logger.warn(data || {}, message);
}

/**
 * Log at error level.
 */
export function error(
  message: string,
  error?: Error | unknown,
  context?: Record<string, string | number | boolean>
): void {
  const logger = context ? withContext(context) : getLogger();
  const errorData = error instanceof Error ? { err: error } : { error };
  logger.error(errorData, message);
}

/**
 * Export the logger type for use in other modules.
 */
export type Logger = pino.Logger;
