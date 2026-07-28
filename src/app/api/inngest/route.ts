/**
 * Inngest webhook handler
 *
 * This is the endpoint where Inngest sends events, step results, and function runs.
 * Typically hosted at /api/inngest
 */

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { validateInstitution, validateInstitutionRetry } from "@/inngest/functions/validate-institution";
import { ingestRegistry, scheduleRegistryIngest } from "@/inngest/functions/ingest-registry";

/**
 * Export Inngest handler for Next.js
 * Automatically handles webhook verification and function execution
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [validateInstitution, validateInstitutionRetry, ingestRegistry, scheduleRegistryIngest],
});
