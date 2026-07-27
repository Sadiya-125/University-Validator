/**
 * Snapshot diffing utilities.
 * Computes added/removed/changed rows between two registry snapshots.
 */

import { SnapshotDiff } from './types';
import { db } from '@/server/db/client';
import { registryEntries } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Compute the diff between two snapshots.
 * Returns counts of added, removed, and changed rows.
 *
 * Strategy:
 * - Previous snapshot: fetch all external_ids
 * - Current snapshot: fetch all external_ids
 * - Compare: identify added, removed entries
 */
export async function diffSnapshots(
  previousSnapshotId: number | null,
  currentSnapshotId: number
): Promise<SnapshotDiff> {
  const now = new Date();

  if (!previousSnapshotId) {
    // First snapshot: all rows are added
    const current = await db!
      .select({ externalId: registryEntries.externalId })
      .from(registryEntries)
      .where(eq(registryEntries.snapshotId, currentSnapshotId));

    return {
      added: current.length,
      removed: 0,
      changed: 0,
      timestamp: now,
      nextId: currentSnapshotId,
    };
  }

  // Fetch both snapshots
  const [previous, current] = await Promise.all([
    db!
      .select({ externalId: registryEntries.externalId })
      .from(registryEntries)
      .where(eq(registryEntries.snapshotId, previousSnapshotId)),

    db!
      .select({ externalId: registryEntries.externalId })
      .from(registryEntries)
      .where(eq(registryEntries.snapshotId, currentSnapshotId)),
  ]);

  // Build lookup sets
  const prevSet = new Set(previous.map(r => r.externalId));
  const currSet = new Set(current.map(r => r.externalId));

  // Count changes
  let added = 0;
  let removed = 0;

  for (const id of currSet) {
    if (!prevSet.has(id)) {
      added++;
    }
  }

  for (const id of prevSet) {
    if (!currSet.has(id)) {
      removed++;
    }
  }

  return {
    added,
    removed,
    changed: 0, // For now, we don't track fine-grained changes
    timestamp: now,
    previousId: previousSnapshotId,
    nextId: currentSnapshotId,
  };
}
