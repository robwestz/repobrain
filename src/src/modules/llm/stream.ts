/**
 * Server-Sent Events (SSE) streaming helpers.
 *
 * Provides a simple abstraction over the Web Streams API that:
 *   - Creates a ReadableStream the API route can return as a Response
 *   - Lets the background generation task emit ChatStreamEvents
 *   - Handles safe close/error cases
 *
 * Usage in an API route:
 *
 *   const { stream, emit, close } = createSseStream();
 *   doWorkAsync(emit).finally(close);           // background task
 *   return new Response(stream, { headers });   // return to client
 */

import type { ChatStreamEvent } from "../../types/api";

const encoder = new TextEncoder();

/**
 * Encode a single ChatStreamEvent as a valid SSE data frame.
 * Format: "data: <json>\n\n"
 */
export function encodeSseEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export interface SseStream {
  /** The ReadableStream to return from the API route */
  stream: ReadableStream<Uint8Array>;
  /** Emit one event to the client */
  emit: (event: ChatStreamEvent) => void;
  /** Close the stream (called after generation completes or errors) */
  close: () => void;
}

/**
 * Create a new SSE stream with emit/close controls.
 *
 * The returned `stream` is a ReadableStream<Uint8Array> that the Next.js
 * API route returns directly:
 *
 *   return new Response(stream, {
 *     headers: {
 *       "Content-Type": "text/event-stream",
 *       "Cache-Control": "no-cache",
 *       Connection: "keep-alive",
 *     },
 *   });
 */
export function createSseStream(): SseStream {
  // controller is set synchronously when the stream is constructed
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    cancel() {
      // Client disconnected — nothing to clean up here,
      // the background task will handle its own cancellation.
    },
  });

  const emit = (event: ChatStreamEvent): void => {
    try {
      controller.enqueue(encoder.encode(encodeSseEvent(event)));
    } catch {
      // Stream already closed (e.g. client disconnected) — ignore
    }
  };

  const close = (): void => {
    try {
      controller.close();
    } catch {
      // Already closed — ignore
    }
  };

  return { stream, emit, close };
}
