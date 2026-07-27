/**
 * Registry ingestion module.
 * Orchestrates fetching, parsing, validating, and publishing institution registries.
 *
 * Main exports:
 * - ingestRegistry: Main ingestion function
 * - lookupInRegistries: Query published registries
 * - CONNECTORS: All available connectors
 */

// Core functions
export { ingestRegistry } from './runner';
export { diffSnapshots } from './diff';
export { lookupInRegistries, lookupByExternalId, getRegistryStats } from './lookup';

// Types
export type {
  RegistryConnector,
  RawRow,
  EntryDraft,
  FetchContext,
  IngestionResult,
  ValidationRules,
  ValidationReport,
  ValidationCheck,
  SnapshotDiff,
} from './types';

// Connectors
export { CONNECTORS, getConnector, ALL_CODES } from './connectors';
