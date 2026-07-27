/**
 * Registry ingestion runner.
 * Orchestrates the complete workflow: download → normalize → deduplicate →
 * snapshot → diff → VALIDATE → publish.
 */

import {
  RegistryConnector,
  IngestionResult,
  ValidationRules,
  ValidationReport,
  ValidationCheck,
  RawRow,
} from './types';
import { diffSnapshots } from './diff';
import { db } from '@/server/db/client';
import { registrySnapshots, registryEntries } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

// Type for registry snapshots returned from DB
type RegistrySnapshot = {
  id: number;
  code: string;
  state: string;
  rowCount: number | null;
  publishedCount: number | null;
  validationReport: any | null;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
};

/**
 * Main ingestion entry point.
 * Idempotent and resumable: can be called multiple times safely.
 *
 * Returns IngestionResult describing the outcome.
 */
export async function ingestRegistry(
  connector: RegistryConnector,
  options?: { dryRun?: boolean }
): Promise<IngestionResult> {
  const startTime = Date.now();
  const dryRun = options?.dryRun ?? false;

  try {
    // Map connector code to enum value
    const authorityCode = mapConnectorCodeToEnum(connector.code);

    // Step 1: Create a running snapshot
    let snapshot = await db!
      .insert(registrySnapshots)
      .values({
        code: authorityCode,
        state: 'running',
        rowCount: 0,
      })
      .returning();

    if (!snapshot.length || !snapshot[0]) {
      throw new Error('Failed to create snapshot');
    }

    const snapshotId = snapshot[0]!.id;
    let rowCount = 0;
    const seenExternalIds = new Set<string>();

    // Step 2: Download, normalize, deduplicate, and insert rows
    const ctx = { signal: undefined };
    for await (const rawRow of connector.fetch(ctx)) {
      const entry = connector.parse(rawRow);
      if (!entry) continue;

      // Deduplication: skip duplicate external_ids in this batch
      if (seenExternalIds.has(entry.externalId)) {
        continue;
      }
      seenExternalIds.add(entry.externalId);

      // Extract type and status from entry data
      const type = extractInstitutionType(entry.rawData);
      const status = extractStatus(entry.rawData);

      // Insert into registry_entries
      if (!dryRun) {
        await db!
          .insert(registryEntries)
          .values({
            code: authorityCode,
            snapshotId: snapshotId,
            externalId: entry.externalId,
            canonicalName: entry.name,
            normalizedName: normalizeForLookup(entry.name),
            type: type,
            status: status,
            attributes: entry.rawData ?? {},
          });
      }

      rowCount++;
    }

    // Step 3: Check if identical to previous snapshot (based on row count for now)
    const previousSnapshot = await db!
      .select()
      .from(registrySnapshots)
      .where(and(eq(registrySnapshots.code as any, authorityCode), eq(registrySnapshots.state, 'published')))
      .orderBy(desc(registrySnapshots.createdAt))
      .limit(1);

    const prevSnapshot = previousSnapshot[0];
    const prevSnapshotId = prevSnapshot?.id;
    const prevRowCount = prevSnapshot?.rowCount ?? undefined;

    if (prevRowCount === rowCount && prevSnapshotId) {
      // Same row count: mark as unchanged
      if (!dryRun) {
        await db!.update(registrySnapshots).set({ state: 'unchanged' }).where(eq(registrySnapshots.id, snapshotId));
      }

      return {
        code: connector.code,
        snapshotId,
        state: 'unchanged',
        rowCount,
        previousRowCount: prevRowCount,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 4: VALIDATE
    if (!dryRun) {
      await db!.update(registrySnapshots).set({ state: 'validating' }).where(eq(registrySnapshots.id, snapshotId));
    }

    const validation = validateSnapshot(rowCount, prevRowCount, connector.validation);

    if (!validation.passed) {
      // Validation failed: mark as rejected, keep previous published
      if (!dryRun) {
        await db!
          .update(registrySnapshots)
          .set({
            state: 'rejected',
            errorMessage: validation.summary,
            validationReport: validation,
          })
          .where(eq(registrySnapshots.id, snapshotId));
      }

      return {
        code: connector.code,
        snapshotId,
        state: 'rejected',
        rowCount,
        previousRowCount: prevRowCount,
        validationReport: validation,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 5: Compute diff
    const diff = await diffSnapshots(prevSnapshotId ?? null, snapshotId);

    // Step 6: PUBLISH
    if (!dryRun) {
      // Mark current as published
      await db!
        .update(registrySnapshots)
        .set({
          state: 'published',
          rowCount: rowCount,
          completedAt: new Date(),
        })
        .where(eq(registrySnapshots.id, snapshotId));
    }

    return {
      code: connector.code,
      snapshotId,
      state: 'published',
      rowCount,
      previousRowCount: prevRowCount,
      added: diff.added,
      removed: diff.removed,
      changed: diff.changed,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    // Hard failure: mark as failed, keep previous published
    const errMsg = err instanceof Error ? err.message : String(err);

    return {
      code: connector.code,
      snapshotId: 0,
      state: 'failed',
      rowCount: 0,
      error: errMsg,
      durationMs: Date.now() - startTime,
    };
  }
}

// Valid source code enum values matching database schema
type SourceCodeValue =
  | 'UGC'
  | 'UGC_FAKE'
  | 'AICTE'
  | 'AISHE'
  | 'INI'
  | 'NMC'
  | 'PCI'
  | 'NCTE'
  | 'COA'
  | 'INC'
  | 'BCI'
  | 'NAAC'
  | 'NIRF'
  | 'CBSE'
  | 'CISCE'
  | 'NIOS'
  | 'WIKIDATA'
  | 'NAD'
  | 'WEBSITE'
  | 'MANUAL';

/**
 * Map connector code to source_code enum value.
 * e.g., 'ugc-recognized' -> 'UGC', 'aicte' -> 'AICTE'
 */
function mapConnectorCodeToEnum(code: string): SourceCodeValue {
  const mapping: Record<string, SourceCodeValue> = {
    'ugc-recognized': 'UGC',
    'ugc-colleges': 'UGC',
    'ugc-fake': 'UGC_FAKE',
    aicte: 'AICTE',
    aishe: 'AISHE',
    'aishe-universities': 'AISHE',
    'aishe-standalone': 'AISHE',
    'aishe-colleges': 'AISHE',
    ini: 'INI',
    nmc: 'NMC',
    pci: 'PCI',
    ncte: 'NCTE',
    coa: 'COA',
    inc: 'INC',
    bci: 'BCI',
    naac: 'NAAC',
    nirf: 'NIRF',
    cbse: 'CBSE',
    cisce: 'CISCE',
    nios: 'NIOS',
    digilocker: 'NAD',
  };

  const result = mapping[code];
  if (!result) {
    const uppercased = code.toUpperCase() as SourceCodeValue;
    // Verify it's a valid enum value
    const validValues: SourceCodeValue[] = ['UGC', 'UGC_FAKE', 'AICTE', 'AISHE', 'INI', 'NMC', 'PCI', 'NCTE', 'COA', 'INC', 'BCI', 'NAAC', 'NIRF', 'CBSE', 'CISCE', 'NIOS', 'WIKIDATA', 'NAD', 'WEBSITE', 'MANUAL'];
    if (validValues.includes(uppercased)) {
      return uppercased;
    }
    throw new Error(`Unknown connector code: ${code}`);
  }
  return result;
}

/**
 * Normalize a name for lookup/search.
 * Simple version: lowercase, remove extra spaces.
 */
function normalizeForLookup(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validate a snapshot against rules.
 * Returns ValidationReport with detailed check results.
 */
function validateSnapshot(rowCount: number, previousRowCount: number | undefined, rules: ValidationRules): ValidationReport {
  const checks: ValidationCheck[] = [];

  // Check 1: Row count variance (default ±20%)
  const variance = rules.rowCountVariance ?? 0.2;
  if (previousRowCount !== undefined) {
    const minRows = previousRowCount * (1 - variance);
    const maxRows = previousRowCount * (1 + variance);
    const passed = rowCount >= minRows && rowCount <= maxRows;

    checks.push({
      name: 'Row Count Variance',
      status: passed ? 'pass' : 'fail',
      actual: rowCount,
      threshold: `${minRows.toFixed(0)}-${maxRows.toFixed(0)}`,
      message: passed
        ? `Row count ${rowCount} within ±${(variance * 100).toFixed(0)}% of previous ${previousRowCount}`
        : `Row count ${rowCount} outside ±${(variance * 100).toFixed(0)}% range (${minRows.toFixed(0)}-${maxRows.toFixed(0)}) of previous ${previousRowCount}`,
    });
  } else {
    // First snapshot: always passes row count check
    checks.push({
      name: 'Row Count Variance',
      status: 'pass',
      actual: rowCount,
      threshold: 'N/A (first snapshot)',
      message: 'First snapshot: no previous row count to compare',
    });
  }

  // Determine overall pass/fail
  const passed = checks.every(c => c.status === 'pass');

  return {
    passed,
    checks,
    summary: passed
      ? `All validation checks passed (${rowCount} rows)`
      : `Validation failed: ${checks.filter(c => c.status === 'fail').map(c => c.name).join(', ')}`,
  };
}

/**
 * Extract institution type from entry raw data.
 * For UGC: returns mapped standard values (Central University, State University, etc.)
 * For AICTE/AISHE: returns raw type values as-is (Government, Private-Self Financing, State Private University, Technical/Polytechnic, etc.)
 */
function extractInstitutionType(rawData: Record<string, unknown>): string | null {
  if (!rawData) return null;

  // Try various field names - check standaloneType for AISHE Standalone
  let type =
    rawData.standaloneType ||
    rawData.institutionType ||
    rawData.type ||
    rawData.institution_type ||
    rawData.institutiontype;

  if (!type || typeof type !== 'string') {
    return null;
  }

  const trimmedType = type.trim();
  if (trimmedType.length === 0) {
    return null;
  }

  // For UGC types (central, state, private, deemed), map to standard values
  const lowerType = trimmedType.toLowerCase();
  const ugcMapping: Record<string, string> = {
    'central': 'Central University',
    'state': 'State University',
    'private': 'Private University',
    'deemed': 'Deemed University',
    'deemed to be universities': 'Deemed University',
    'deemed university': 'Deemed University',
  };

  if (ugcMapping[lowerType]) {
    return ugcMapping[lowerType];
  }

  // For AICTE and AISHE, return the raw type value as-is
  // Examples:
  // - AICTE: "Government", "Private-Self Financing"
  // - AISHE Universities: "State Private University", "Central University"
  // - AISHE Standalone: "Technical/Polytechnic", "Autonomous College"
  // - AISHE Colleges: "Affiliated College", "Autonomous College"
  return trimmedType;
}

/**
 * Extract status from entry raw data.
 * Looks for status, approval_status, validationStatus fields.
 */
function extractStatus(rawData: Record<string, unknown>): string | null {
  if (!rawData) return null;

  // Try various field names
  const status =
    rawData.status ||
    rawData.approval_status ||
    rawData.approvalStatus ||
    rawData.validationStatus ||
    rawData.validation_status;

  if (status && typeof status === 'string') {
    return status.trim() || null;
  }

  return null;
}
