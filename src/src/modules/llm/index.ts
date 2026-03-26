/**
 * LLM orchestration — §09 interface contract:
 *
 *   generateAnswer(question, context, history) → AsyncGenerator<AnswerChunk>
 *
 * Responsibilities (this module only):
 *   - Build the prompt from retrieved context + history
 *   - Call the LLM API (OpenAI or Anthropic) with streaming
 *   - Parse citations from the completed response
 *   - Validate citations against the DB
 *   - Yield text tokens, validated citations, and warnings
 *
 * This module does NOT:
 *   - Run retrieval (caller's responsibility)
 *   - Persist messages (caller's responsibility)
 *   - Handle HTTP or SSE (caller's responsibility)
 */

import {
  getProvider,
  getAnthropicClient,
  getOpenAIClient,
  LLM_MODEL,
  LLM_MAX_TOKENS,
} from "./provider";
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
 */
export async function* generateAnswer(
  question: string,
  retrievalResult: RetrievalResult,
  history: HistoryMessage[],
  repoConnectionId: string,
): AsyncGenerator<AnswerChunk> {
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

  // Stream from the selected provider
  const provider = getProvider();

  if (provider === "openai") {
    fullText = yield* streamOpenAI(systemPrompt, messages);
  } else {
    fullText = yield* streamAnthropic(systemPrompt, messages);
  }

  // --- Post-stream: parse and validate all citations -----------------------

  const parsed = parseCitations(fullText);

  if (parsed.length > 0) {
    const validated = await validateCitations(parsed, repoConnectionId);
    const validCitations = toCitationObjects(validated);

    for (const citation of validCitations) {
      yield { type: "citation", citation };
    }

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

    if (!hasSufficientCitations(fullText, validCitations.length)) {
      yield {
        type: "warning",
        message:
          "Note: This answer has limited citations. The information above may not be fully grounded in the provided codebase context.",
      };
    }
  } else {
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

// ---------------------------------------------------------------------------
// Provider-specific streaming
// ---------------------------------------------------------------------------

async function* streamOpenAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): AsyncGenerator<AnswerChunk, string> {
  const client = getOpenAIClient();
  let fullText = "";

  const stream = await client.chat.completions.create({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      yield { type: "text", content: delta };
    }
  }

  return fullText;
}

async function* streamAnthropic(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): AsyncGenerator<AnswerChunk, string> {
  const client = getAnthropicClient();
  let fullText = "";

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

  return fullText;
}
