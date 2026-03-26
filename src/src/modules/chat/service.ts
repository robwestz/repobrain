/**
 * Chat service — §09 interface contract:
 *
 *   askQuestion(conversationId, question) → AsyncGenerator<AnswerChunk>
 *   getConversation(conversationId) → Promise<ConversationWithMessages | null>
 *   listConversations(workspaceId) → Promise<Conversation[]>
 *
 * This module orchestrates retrieval → LLM generation.
 * It does NOT store messages — the API route handles persistence so it can
 * interleave SSE streaming with database writes at the right moments.
 */

import { retrieve } from "../retrieval/index";
import { generateAnswer, type AnswerChunk } from "../llm/index";
import type { HistoryMessage } from "../llm/prompt";
import {
  findConversationById,
  findConversationsByWorkspace,
  findMessagesByConversation,
  insertConversation,
  updateConversationTitle,
} from "./queries";
import type { RetrievalTrace } from "../../types/domain";

// ---------------------------------------------------------------------------
// Re-exported chunk type with retrieval metadata
// ---------------------------------------------------------------------------

export type ChatAnswerChunk = AnswerChunk & {
  /** Retrieval trace attached to the first chunk of each response */
  _retrievalTrace?: RetrievalTrace;
  /** Repo connection ID (so the API route doesn't need to re-fetch) */
  _repoConnectionId?: string;
};

// ---------------------------------------------------------------------------
// Conversation management
// ---------------------------------------------------------------------------

export async function createConversation(
  workspaceId: string,
  repoConnectionId: string,
  title?: string | null,
) {
  return insertConversation({ workspaceId, repoConnectionId, title });
}

export async function listConversations(workspaceId: string) {
  return findConversationsByWorkspace(workspaceId);
}

export async function getConversation(conversationId: string) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) return null;
  const msgs = await findMessagesByConversation(conversationId);
  return { ...conversation, messages: msgs };
}

// ---------------------------------------------------------------------------
// Ask question
// ---------------------------------------------------------------------------

/**
 * Orchestrate retrieval → LLM generation for a user question.
 *
 * The caller (API route) is responsible for:
 *   1. Inserting the user message in DB BEFORE calling this
 *   2. Collecting yielded chunks for SSE streaming
 *   3. Assembling the full assistant text and saving it to DB after done
 *
 * @param conversationId  The conversation to answer in
 * @param question        The user's question text
 * @param history         Messages loaded BEFORE the current user message
 *                        (so the current question is not duplicated in the prompt)
 * @param filePath        Optional: scope retrieval to a specific file
 */
export async function* askQuestion(
  conversationId: string,
  question: string,
  history: Array<{ role: string; content: string }>,
  filePath?: string,
): AsyncGenerator<ChatAnswerChunk> {
  const conversation = await findConversationById(conversationId);
  if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

  const { repoConnectionId } = conversation;

  // Run multi-strategy retrieval
  const retrievalStart = Date.now();
  const retrievalResult = await retrieve(question, repoConnectionId, {
    maxResults: 15,
    fileFilter: filePath,
  });

  const retrievalTrace: RetrievalTrace = {
    query: question,
    expandedQueries: retrievalResult.expandedQueries,
    chunksRetrieved: retrievalResult.totalCandidates,
    chunksAfterReranking: retrievalResult.chunks.length,
    totalTokens: retrievalResult.totalTokens,
    durationMs: Date.now() - retrievalStart,
  };

  // Map history to HistoryMessage (role + content only)
  const historyMessages: HistoryMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  // Stream LLM answer — attach metadata to the first chunk
  let firstChunk = true;
  for await (const chunk of generateAnswer(question, retrievalResult, historyMessages, repoConnectionId)) {
    if (firstChunk) {
      yield {
        ...chunk,
        _retrievalTrace: retrievalTrace,
        _repoConnectionId: repoConnectionId,
      };
      firstChunk = false;
    } else {
      yield chunk;
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Derive a display title from the first user question.
 * Truncated to 80 chars with an ellipsis if needed.
 */
export function generateTitle(question: string): string {
  const clean = question.trim().replace(/\s+/g, " ");
  return clean.length > 80 ? clean.slice(0, 77) + "…" : clean;
}

/**
 * Set the conversation title if it hasn't been set yet.
 * Called after the first user message is created.
 */
export async function maybeSetTitle(
  conversationId: string,
  currentTitle: string | null,
  question: string,
) {
  if (!currentTitle) {
    await updateConversationTitle(conversationId, generateTitle(question));
  }
}
