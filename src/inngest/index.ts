/**
 * Inngest orchestration module
 *
 * Exports:
 * - inngest: Client for sending events
 * - validateInstitution: Main validation orchestrator function
 * - ingestRegistry: Registry ingestion function
 * - validationChannel: Channel for publishing progress
 */

export { inngest, requestValidation, completeValidation, failValidation } from "./client";
export type {
  ValidationRequestedEvent,
  ValidationCompletedEvent,
  ValidationFailedEvent,
  BatchCreatedEvent,
  BatchItemQueuedEvent,
  RegistryIngestRequestedEvent,
  RevalidationDueEvent,
  DeadLetterRetryEvent,
} from "./client";

export { validationChannel, ValidationChannel, ServerProgressPublisher } from "./channels";
export type { ProgressUpdate, PartialResult, FinalResult } from "./channels";

export { validateInstitution, validateInstitutionRetry } from "./functions/validate-institution";
export { ingestRegistry, scheduleRegistryIngest } from "./functions/ingest-registry";
export { batchProcess } from "./functions/batch-process";
