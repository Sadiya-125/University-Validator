/**
 * Registry connector and validation types.
 * Defines the interface for authority-specific registry connectors.
 */

export type InstitutionSector = 'higher-education' | 'medical' | 'engineering' | 'teacher-ed' | 'pharmacy' | 'nursing' | 'architecture' | 'school' | 'research';

export type CadenceType = 'monthly' | 'quarterly' | 'annually' | 'on-demand';

/**
 * Raw row from a registry source (before normalization).
 * Each connector parses its source into this minimal form.
 */
export interface RawRow {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Normalized entry ready for database upsert.
 * The runner normalizes raw rows into this form.
 */
export interface EntryDraft {
  externalId: string;
  name: string;
  city?: string;
  state?: string;
  affiliatedUniversity?: string;
  website?: string;
  email?: string;
  phoneNumber?: string;
  rawData: Record<string, unknown>;
}

/**
 * Validation rules for a registry snapshot.
 * Gates whether a new snapshot can be published.
 */
export interface ValidationRules {
  /** Acceptable row count variance from previous snapshot (default: ±20%) */
  rowCountVariance?: number;

  /** Minimum non-null rate for required columns (default: 0.95 = 95%) */
  requiredColumnsThreshold?: number;

  /** Maximum acceptable duplicate external_id rate (default: 0.01 = 1%) */
  duplicateExternalIdThreshold?: number;

  /** Required columns that must be present (e.g., ['externalId', 'name']) */
  requiredColumns?: string[];
}

/**
 * Registry connector interface.
 * Each authority (UGC, AICTE, NMC, etc.) implements this interface.
 */
export interface RegistryConnector {
  /** Authority code: 'ugc-recognized', 'aicte', 'nmc', etc. */
  code: string;

  /** Display name: 'University Grants Commission', 'AICTE', etc. */
  displayName: string;

  /** Sector(s) this registry covers */
  sector: InstitutionSector[];

  /** How often this registry updates */
  cadence: CadenceType;

  /**
   * Fetch raw rows from the registry source.
   * Respects robots.txt and rate limiting (≥500ms between pages).
   * Should use CRAWLER_USER_AGENT header.
   * Returns AsyncIterable to support streaming large datasets.
   */
  fetch(ctx: FetchContext): AsyncIterable<RawRow>;

  /**
   * Parse a raw row into an EntryDraft.
   * Normalizes institution name, extracts identifiers, etc.
   */
  parse(raw: RawRow): EntryDraft | null;

  /** Source URLs from which this registry fetches (for user reference) */
  sourceUrls: string[];

  /** Validation rules for this registry */
  validation: ValidationRules;
}

/**
 * Context passed to connector's fetch() method.
 * Provides access to cache, HTTP client, logging, etc.
 */
export interface FetchContext {
  /** Signal for cancellation (e.g., timeout, user abort) */
  signal?: AbortSignal;

  /** Logger for debug/info/warn/error */
  logger?: {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, err?: Error, meta?: Record<string, unknown>): void;
  };
}

/**
 * Ingestion result summary.
 * Returned after ingestRegistry completes.
 */
export interface IngestionResult {
  code: string;
  snapshotId: number;
  state: 'unchanged' | 'validating' | 'published' | 'rejected' | 'failed';
  rowCount: number;
  previousRowCount?: number;
  added?: number;
  removed?: number;
  changed?: number;
  validationReport?: ValidationReport;
  error?: string;
  durationMs: number;
}

/**
 * Detailed validation failure report.
 * Explains exactly why validation failed.
 */
export interface ValidationReport {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  status: 'pass' | 'fail';
  actual: number | string;
  threshold: number | string;
  message: string;
}

/**
 * Diff between two snapshots.
 * Used to display changes in the dashboard and API.
 */
export interface SnapshotDiff {
  added: number;
  removed: number;
  changed: number;
  timestamp: Date;
  previousId?: number;
  nextId: number;
}
