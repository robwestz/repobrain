/**
 * POST /api/workspaces/[workspaceId]/repos/[repoId]/deep-research
 *
 * Runs a multi-iteration deep research session over the repository and streams
 * progress back to the client as Server-Sent Events.
 *
 * Request body:
 *   { question: string; maxIterations?: number }
 *
 * SSE event stream:
 *   data: { type: "iteration", iteration: ResearchIteration }  — each completed iteration
 *   data: { type: "done" }                                     — research complete
 *   data: { type: "error", error: string }                     — fatal error
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { findWorkspaceByIdAndUser, findRepoConnectionById } from "@/src/modules/workspace/queries";
import { deepResearch } from "@/src/modules/chat/deep-research";
import { enforceRateLimit } from "@/src/lib/rate-limit";

const MAX_QUESTION_LENGTH = 2000;
const DEFAULT_MAX_ITERATIONS = 3;

const DEEP_RESEARCH_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 3,
  keyPrefix: "deep-research",
} as const;

type RouteContext = {
  params: Promise<{ workspaceId: string; repoId: string }>;
};

export async function POST(req: NextRequest, { params }: RouteContext) {
  // --- Auth ---
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Rate limit ---
  const rateLimitResponse = await enforceRateLimit(session.userId, DEEP_RESEARCH_RATE_LIMIT);
  if (rateLimitResponse) return rateLimitResponse;

  const { workspaceId, repoId } = await params;

  // --- Verify workspace ownership ---
  const workspace = await findWorkspaceByIdAndUser(workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // --- Verify repo connection ---
  const repoConnection = await findRepoConnectionById(repoId);
  if (!repoConnection || repoConnection.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repoConnection.status !== "ready") {
    return NextResponse.json(
      { error: "Repository is not fully indexed yet. Please wait for indexing to complete." },
      { status: 422 },
    );
  }

  // --- Parse body ---
  let body: { question?: unknown; maxIterations?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.question || typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json(
      { error: "question is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const question = body.question.trim();
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `question must be ${MAX_QUESTION_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const maxIterations =
    typeof body.maxIterations === "number" &&
    Number.isInteger(body.maxIterations) &&
    body.maxIterations >= 2 &&
    body.maxIterations <= 5
      ? body.maxIterations
      : DEFAULT_MAX_ITERATIONS;

  // --- SSE stream ---
  const encoder = new TextEncoder();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      streamController = ctrl;
    },
  });

  function emit(event: Record<string, unknown>): void {
    try {
      streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Stream already closed
    }
  }

  function close(): void {
    try {
      streamController.close();
    } catch {
      // Already closed
    }
  }

  // Run deep research in a background microtask
  void (async () => {
    try {
      for await (const iteration of deepResearch(question, repoConnection.id, maxIterations)) {
        emit({ type: "iteration", iteration });
      }
      emit({ type: "done" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Deep research failed";
      const { logger } = await import("@/src/lib/logger");
      logger.error({ err }, "deep-research: generation error");
      emit({ type: "error", error: errorMessage });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
