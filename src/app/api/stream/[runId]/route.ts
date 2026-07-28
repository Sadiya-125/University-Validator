/**
 * GET /api/stream/[runId]
 *
 * Server-Sent Events stream for real-time validation progress.
 *
 * Events:
 * - progress: Step-by-step progress (step name, status, metadata)
 * - partial: Partial results as stages complete
 * - done: Final completion with verdict and score
 * - error: Validation error
 *
 * Example client:
 * ```javascript
 * const eventSource = new EventSource(`/api/stream/${runId}`);
 * eventSource.addEventListener('progress', (e) => {
 *   console.log('Progress:', JSON.parse(e.data));
 * });
 * eventSource.addEventListener('done', (e) => {
 *   console.log('Result:', JSON.parse(e.data));
 *   eventSource.close();
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { ReadableStream } from "stream/web";

/**
 * Mock stream data (in production, use Inngest Realtime API)
 */
const streamConnections = new Map<
  string,
  ReadableStreamDefaultController<Uint8Array>
>();

/**
 * GET /api/stream/[runId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  // Validate runId
  if (!runId || typeof runId !== "string" || runId.length < 10) {
    return NextResponse.json(
      {
        error: "Invalid runId format",
        code: "INVALID_RUN_ID",
      },
      { status: 400 }
    );
  }

  // Create readable stream for SSE
  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "connection",
            message: "Connected to validation stream",
            runId,
          })}\n\n`
        )
      );

      // Store controller for later use (in production, integrate with Inngest Realtime)
      streamConnections.set(runId, controller as any);

      // Simulate progress updates for demo (in production, consume from Inngest Realtime)
      const intervals = [
        {
          delay: 100,
          event: "progress",
          data: { step: "fastPath", status: "start" },
        },
        {
          delay: 200,
          event: "progress",
          data: { step: "fastPath", status: "complete", duration: 50, cacheHit: false },
        },
        {
          delay: 600,
          event: "progress",
          data: { step: "mirror", status: "complete", duration: 300 },
        },
        {
          delay: 900,
          event: "partial",
          data: {
            stage: "mirror",
            verdict: "likely_genuine",
            score: 0.75,
            timestamp: new Date().toISOString(),
          },
        },
        {
          delay: 1500,
          event: "progress",
          data: { step: "discovery", status: "complete", duration: 400 },
        },
        {
          delay: 2500,
          event: "done",
          data: {
            verdict: "likely_genuine",
            score: 0.82,
            confidence: 0.79,
            validationRunId: runId,
            duration: 2500,
            tierReachedAt: "discovery",
            breakdown: {
              evidenceCount: 6,
              tierDistribution: { mirror: 3, api: 3 },
            },
          },
        },
      ];

      // Schedule demo events
      intervals.forEach(({ delay, event, data }) => {
        setTimeout(() => {
          if (streamConnections.has(runId)) {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );

            // Close stream after done event
            if (event === "done") {
              setTimeout(() => {
                controller.close();
                streamConnections.delete(runId);
              }, 100);
            }
          }
        }, delay);
      });

      // Handle disconnection
      request.signal.addEventListener("abort", () => {
        controller.close();
        streamConnections.delete(runId);
      });
    },

    cancel() {
      streamConnections.delete(runId);
    },
  });

  return new NextResponse(readable as any, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Publish progress update to stream
 * (To be called from validation functions)
 */
export function publishStreamUpdate(
  runId: string,
  event: "progress" | "partial" | "done" | "error",
  data: unknown
) {
  const controller = streamConnections.get(runId);
  if (controller) {
    const encoder = new TextEncoder();
    controller.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  }
}

/**
 * Close stream connection
 */
export function closeStream(runId: string) {
  const controller = streamConnections.get(runId);
  if (controller) {
    controller.close();
    streamConnections.delete(runId);
  }
}

/**
 * OPTIONS /api/stream/[runId]
 */
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
