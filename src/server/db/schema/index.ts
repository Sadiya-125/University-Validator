/**
 * Database schema export.
 * Re-exports all tables and enums for use in Drizzle ORM.
 */

// Tables
export { institutions, institutionIdentities, institutionContacts, institutionLinks } from "./canonical";
export { authorities, registrySnapshots, registryEntries } from "./registry";
export { validationRuns, runSteps, evidence, llmCalls } from "./evidence";
export { embeddingSpaces } from "./embeddings";
export { scoringPolicies, featureFlags } from "./policy";
export { batches, batchItems, deadLetters, providerHealth, metricsHourly, auditLog } from "./operations";

// Enums (from enums.ts - single source of truth)
export * from "./enums";

// Re-export enum-creating functions from modules that define their own enums for backward compatibility
export { sourceCodeEnum, snapshotStateEnum } from "./registry";
export { institutionTypeEnum, verdictEnum, identitySourceEnum, contactKindEnum, linkPlatformEnum } from "./canonical";
export {
  validationRunStateEnum,
  stepStatusEnum,
  evidenceKindEnum,
  evidenceTierEnum,
} from "./evidence";
export { batchStateEnum, providerStateEnum } from "./operations";
