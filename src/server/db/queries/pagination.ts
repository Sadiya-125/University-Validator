/**
 * Cursor-based pagination helpers.
 * Never OFFSET on large tables — use cursor-based pagination for stability.
 */

import { sql, gte, lt } from "drizzle-orm";

export interface CursorPageOptions {
  limit?: number;
  cursor?: string | null;
  direction?: "forward" | "backward";
}

export interface CursorPageResult<T> {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

/**
 * Parse a cursor (base64-encoded ID).
 */
export function parseCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const id = parseInt(decoded, 10);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

/**
 * Encode a cursor (ID to base64).
 */
export function encodeCursor(id: number): string {
  return Buffer.from(String(id), "utf-8").toString("base64");
}

/**
 * Build a cursor-based pagination condition.
 * For forward: id > cursor
 * For backward: id < cursor (remember to reverse results)
 */
export function buildCursorCondition(
  idColumn: any,
  options: CursorPageOptions
): any | null {
  const cursorId = parseCursor(options.cursor);
  if (!cursorId) return null;

  if (options.direction === "backward") {
    return lt(idColumn, cursorId);
  }
  // forward (default)
  return gte(idColumn, cursorId);
}

/**
 * Example usage:
 *
 * const { items, nextCursor, hasMore } = await cursorPaginate({
 *   table: institutions,
 *   idColumn: institutions.id,
 *   baseQuery: db.select().from(institutions).where(...),
 *   limit: 20,
 *   cursor: req.query.cursor,
 * });
 */
