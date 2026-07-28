/**
 * Inngest channels for real-time progress publishing
 *
 * validationChannel(runId) provides:
 * - progress: Step-by-step progress (stage name, status, metadata)
 * - partial: Partial results as stages complete
 * - done: Final completion signal with verdict and score
 */

import { z } from "zod";

/**
 * Progress update schema
 */
const ProgressUpdateSchema = z.object({
  step: z.string(),
  status: z.enum(["start", "complete", "error"]),
  duration: z.number().min(0).optional(),
  cacheHit: z.boolean().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Partial result schema
 */
const PartialResultSchema = z.object({
  stage: z.enum(["fast", "mirror", "discovery", "verify", "extract", "judge"]),
  verdict: z.string().optional(),
  score: z.number().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.date(),
});

/**
 * Final result schema
 */
const FinalResultSchema = z.object({
  verdict: z.enum(["genuine", "likely_genuine", "likely_fake", "fake", "needs_review", "insufficient_evidence"]),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  validationRunId: z.string().min(1),
  duration: z.number().min(0),
  tierReachedAt: z.enum(["fast", "mirror", "discovery", "verify", "extract", "judge", "finalize"]),
  breakdown: z.record(z.string(), z.unknown()),
});

export type ProgressUpdate = z.infer<typeof ProgressUpdateSchema>;
export type PartialResult = z.infer<typeof PartialResultSchema>;
export type FinalResult = z.infer<typeof FinalResultSchema>;

/**
 * Validation channel class for publishing to topics
 */
export class ValidationChannel {
  private runId: string;
  private baseChannelId: string;

  constructor(runId: string) {
    this.runId = runId;
    this.baseChannelId = `validation:${runId}`;
  }

  /**
   * Get the full channel ID for a topic
   */
  private getChannelId(topic: "progress" | "partial" | "done"): string {
    return `${this.baseChannelId}:${topic}`;
  }

  /**
   * Publish progress update
   */
  async publishProgress(update: ProgressUpdate): Promise<void> {
    // This would publish to the Inngest Realtime API
    // Implementation depends on Inngest SDK version and setup
    if (typeof window === "undefined") {
      // Server-side only
      console.debug(`[progress:${this.runId}]`, update);
    }
  }

  /**
   * Publish partial result
   */
  async publishPartial(result: PartialResult): Promise<void> {
    if (typeof window === "undefined") {
      console.debug(`[partial:${this.runId}]`, result);
    }
  }

  /**
   * Publish final result
   */
  async publishDone(result: FinalResult): Promise<void> {
    if (typeof window === "undefined") {
      console.debug(`[done:${this.runId}]`, result);
    }
  }

  /**
   * Get the progress topic name
   */
  static progressTopic(runId: string): string {
    return `validation:${runId}:progress`;
  }

  /**
   * Get the partial results topic name
   */
  static partialTopic(runId: string): string {
    return `validation:${runId}:partial`;
  }

  /**
   * Get the done topic name
   */
  static doneTopic(runId: string): string {
    return `validation:${runId}:done`;
  }
}

/**
 * Factory function to create a validation channel
 */
export function validationChannel(runId: string): ValidationChannel {
  return new ValidationChannel(runId);
}

/**
 * Server-side publisher for use in API routes and server functions
 */
export class ServerProgressPublisher {
  static async publishProgress(
    runId: string,
    update: ProgressUpdate
  ): Promise<void> {
    // Publish to Inngest Realtime
    const channel = ValidationChannel.progressTopic(runId);
    console.debug(`Publishing to ${channel}:`, update);
  }

  static async publishPartial(
    runId: string,
    result: PartialResult
  ): Promise<void> {
    const channel = ValidationChannel.partialTopic(runId);
    console.debug(`Publishing to ${channel}:`, result);
  }

  static async publishDone(
    runId: string,
    result: FinalResult
  ): Promise<void> {
    const channel = ValidationChannel.doneTopic(runId);
    console.debug(`Publishing to ${channel}:`, result);
  }
}
