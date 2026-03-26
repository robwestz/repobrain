/**
 * LLM orchestration — §09 interface contract:
 *
 *   generateAnswer(question, context, history) → AsyncGenerator<AnswerChunk>
 *
 * Responsibilities (this module only):
 *   - Build the prompt from retrieved context + history
 *   - Call the Anthropic Claude API with streaming
 *   - Parse citations from the completed response
 *   - Validate citations against the DB
 *   - Yield text tokens, validated citations, and warnings
 *
 * This module does NOT:
 *   - Run retrieval (caller's responsibility)
 *   - Persist messages (caller's responsibility)
 *   - Handle HTTP or SSE (caller's responsibility)
 */

import { getAnthropicClient, LLM_MODEL, LLM_MAX_TOKENS } from "./provider";
import { buildPrompt, type HistoryMessage } from "./prompt";
import {
  parseCitations,
  validateCitations,
  toCitationObjects,
  hasSufficientCitations,
} from "./citations";
import type { RetrievalResult } from "../../types/retrieval";
import type { Citation } from "../../types/domain";
import type { ContextWindow } from "../../types/retrieval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnswerChunk =
  | { type: "text"; content: string }
  | { type: "citation"; citation: Citation }
  | { type: "warning"; message: string };

// ---------------------------------------------------------------------------
// generateAnswer
// ---------------------------------------------------------------------------

/**
 * Generate a grounded, cited answer for a user question.
 *
 * Yields:
 *   { type: "text", content }     — streamed response tokens (many)
 *   { type: "citation", citation } — validated citation objects (0-N, emitted after stream ends)
 *   { type: "warning", message }  — invalid citations or low-density warning (0-N)
 *
 * @param question          The user's question
 * @param retrievalResult   Output of retrieve() — ranked chunks + repo summary
 * @param history           Recent conversation messages for context (caller trims to last N)
 * @param repoConnectionId  Used to validate citations against DB file records
 */
export async function* generateAnswer(
  question: string,
  retrievalResult: RetrievalResult,
  history: HistoryMessage[],
  repoConnectionId: string,
): AsyncGenerator<AnswerChunk> {
  const client = getAnthropicClient();

  // Build a ContextWindow from the RetrievalResult for prompt formatting
  const contextWindow: ContextWindow = {
    repoSummary: retrievalResult.repoSummary,
    contextChunks: retrievalResult.chunks.map((c) => ({
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      content: c.content,
      symbolName: c.symbolName,
      language: c.language,
      score: c.score,
    })),
    totalTokens: retrievalResult.totalTokens,
  };

  const { systemPrompt, messages } = buildPrompt(question, contextWindow, history);

  // Accumulate full text for post-stream citation extraction
  let fullText = "";

  // Stream the response from Claude
  const stream = client.messages.stream({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const token = event.delta.text;
      fullText += token;
      yield { type: "text", content: token };
    }
  }

  // --- Post-stream: parse and validate all citations -----------------------

  const parsed = parseCitations(fullText);

  if (parsed.length > 0) {
    const validated = await validateCitations(parsed, repoConnectionId);
    const validCitations = toCitationObjects(validated);

    // Emit validated citations
    for (const citation of validCitations) {
      yield { type: "citation", citation };
    }

    // Flag invalid citations — never silent per §11 acceptance criteria
    const invalid = validated.filter((v) => !v.valid);
    if (invalid.length > 0) {
      const reasons = invalid
        .map((v) => `"${v.filePath}:L${v.startLine}-L${v.endLine}" — ${v.invalidReason ?? "unknown reason"}`)
        .join("; ");
      yield {
        type: "warning",
        message: `${invalid.length} citation(s) could not be verified and may be inaccurate: ${reasons}`,
      };
    }

    // Check citation density — warn if too sparse
    if (!hasSufficientCitations(fullText, validCitations.length)) {
      yield {
        type: "warning",
        message:
          "Note: This answer has limited citations. The information above may not be fully grounded in the provided codebase context.",
      };
    }
  } else {
    // No citations at all in a non-trivial response
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    if (wordCount > 30) {
      yield {
        type: "warning",
        message:
          "Note: No code citations were found in this answer. The response may not be grounded in the repository. Consider rephrasing your question.",
      };
    }
  }
}
