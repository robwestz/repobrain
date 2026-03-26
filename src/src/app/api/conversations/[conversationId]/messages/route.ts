/**
 * POST /api/conversations/:conversationId/messages
 *
 * Accepts a user question and returns a Server-Sent Events stream with the
 * LLM's grounded, cited answer.
 *
 * Request body:
 *   { content: string; filePath?: string }
 *
 * SSE event stream:
 *   data: { type: "token",    content: string }      — streamed text tokens
 *   data: { type: "citation", citation: Citation }   — validated citations
 *   data: { type: "done",     messageId: string }    — assistant message saved
 *   data: { type: "error",    error: string }        — fatal error
 *
 * The user message is persisted before generation starts.
 * The assistant message is persisted after the stream completes.
 * Citations are validated against actual file records (§11 acceptance criteria).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/src/lib/auth";
import { getConversation, askQuestion, maybeSetTitle } from "@/src/modules/chat/service";
import { insertMessage, touchConversation } from "@/src/modules/chat/queries";
import { createSseStream } from "@/src/modules/llm/stream";
import { findWorkspaceByIdAndUser } from "@/src/modules/workspace/queries";
import type { Citation, RetrievalTrace } from "@/src/types/domain";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  // --- Auth ---
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  // --- Load conversation + verify ownership ---
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const workspace = await findWorkspaceByIdAndUser(conversation.workspaceId, session.userId);
  if (!workspace) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // --- Parse body ---
  let body: { content?: unknown; filePath?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json({ error: "content is required and must be a non-empty string" }, { status: 400 });
  }

  const question = body.content.trim();
  const filePath: string | undefined =
    typeof body.filePath === "string" && body.filePath.trim()
      ? body.filePath.trim()
      : undefined;

  // --- Snapshot history BEFORE inserting the new user message ---
  // This ensures the current question isn't included in the history context.
  // Cast role to the union type — Drizzle returns varchar as string.
  const historySnapshot = conversation.messages.map((m) => ({
    ...m,
    role: m.role as "user" | "assistant",
  }));

  // --- Persist user message ---
  await insertMessage({ conversationId, role: "user", content: question });

  // --- Auto-title on first message ---
  await maybeSetTitle(conversationId, conversation.title, question);

  // --- Set up SSE stream ---
  const { stream, emit, close } = createSseStream();

  // Run the generation pipeline in a background microtask so we can return
  // the SSE Response immediately
  void (async () => {
    const tokenBuffer: string[] = [];
    const citations: Citation[] = [];
    let retrievalTrace: RetrievalTrace | null = null;

    try {
      for await (const chunk of askQuestion(
        conversationId,
        question,
        historySnapshot,
        filePath,
      )) {
        if (chunk.type === "text") {
          const token = chunk.content;
          tokenBuffer.push(token);
          emit({ type: "token", content: token });
        } else if (chunk.type === "citation" && chunk.citation) {
          citations.push(chunk.citation);
          emit({ type: "citation", citation: chunk.citation });
        } else if (chunk.type === "warning" && chunk.message) {
          // Warnings are appended to the text (displayed in the UI as a note)
          const warningText = `\n\n> ⚠️ ${chunk.message}`;
          tokenBuffer.push(warningText);
          emit({ type: "token", content: warningText });
        }

        // Capture retrieval trace from first chunk metadata
        if (chunk._retrievalTrace && !retrievalTrace) {
          retrievalTrace = chunk._retrievalTrace;
        }
      }

      // --- Persist assistant message with citations and retrieval trace ---
      const assistantContent = tokenBuffer.join("");
      const saved = await insertMessage({
        conversationId,
        role: "assistant",
        content: assistantContent,
        citations,
        retrievalTrace,
      });

      await touchConversation(conversationId);

      emit({ type: "done", messageId: saved.id });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("[chat/messages] generation error:", err);
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
      // Prevent buffering by proxies / edge functions
      "X-Accel-Buffering": "no",
    },
  });
}
