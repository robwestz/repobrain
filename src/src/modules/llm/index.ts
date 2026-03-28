/**
 * LLM orchestration:
 *   generateAnswer(question, context, history) → AsyncGenerator<AnswerChunk>
 */

import {
  getProvider,
  getModel,
  getActiveModelConfig,
  getAnthropicClient,
  getOpenAIClient,
  getOllamaClient,
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
import { logger } from "../../lib/logger";

export type AnswerChunk =
  | { type: "text"; content: string }
  | { type: "citation"; citation: Citation }
  | { type: "warning"; message: string };

export async function* generateAnswer(
  question: string,
  retrievalResult: RetrievalResult,
  history: HistoryMessage[],
  repoConnectionId: string,
): AsyncGenerator<AnswerChunk> {
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

  let fullText = "";
  const provider = getProvider();
  const model = getModel(provider);
  const modelCfg = getActiveModelConfig(provider, model);

  const llmStart = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === "anthropic") {
    ({ text: fullText, inputTokens, outputTokens } = yield* streamAnthropic(systemPrompt, messages, model, modelCfg.maxTokens));
  } else if (provider === "ollama") {
    ({ text: fullText, inputTokens, outputTokens } = yield* streamOllama(systemPrompt, messages, model, modelCfg.maxTokens));
  } else {
    ({ text: fullText, inputTokens, outputTokens } = yield* streamOpenAI(systemPrompt, messages, model, modelCfg.maxTokens));
  }

  const llmDurationMs = Date.now() - llmStart;
  logger.info({ event: "llm_call", provider, model, inputTokens, outputTokens, durationMs: llmDurationMs, repoId: repoConnectionId });

  const parsed = parseCitations(fullText);

  if (parsed.length > 0) {
    const validated = await validateCitations(parsed, repoConnectionId);
    const validCitations = toCitationObjects(validated);
    for (const citation of validCitations) yield { type: "citation", citation };
    const invalid = validated.filter((v) => !v.valid);
    if (invalid.length > 0) {
      const reasons = invalid.map((v) => `"${v.filePath}:L${v.startLine}-L${v.endLine}" — ${v.invalidReason ?? "unknown reason"}`).join("; ");
      yield { type: "warning", message: `${invalid.length} citation(s) could not be verified and may be inaccurate: ${reasons}` };
    }
    if (!hasSufficientCitations(fullText, validCitations.length)) {
      yield { type: "warning", message: "Note: This answer has limited citations. The information above may not be fully grounded in the provided codebase context." };
    }
  } else {
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    if (wordCount > 30) {
      yield { type: "warning", message: "Note: No code citations were found in this answer. The response may not be grounded in the repository. Consider rephrasing your question." };
    }
  }
}

interface StreamResult { text: string; inputTokens: number; outputTokens: number; }

async function* streamOpenAI(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
  maxTokens: number,
): AsyncGenerator<AnswerChunk, StreamResult> {
  const client = getOpenAIClient();
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = await client.chat.completions.create({
    model, max_tokens: maxTokens, stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) { fullText += delta; yield { type: "text", content: delta }; }
    if (chunk.usage) { inputTokens = chunk.usage.prompt_tokens ?? 0; outputTokens = chunk.usage.completion_tokens ?? 0; }
  }
  return { text: fullText, inputTokens, outputTokens };
}

async function* streamAnthropic(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
  maxTokens: number,
): AsyncGenerator<AnswerChunk, StreamResult> {
  const client = getAnthropicClient();
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = client.messages.stream({ model, max_tokens: maxTokens, system: systemPrompt, messages });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const token = event.delta.text;
      fullText += token;
      yield { type: "text", content: token };
    }
    if (event.type === "message_delta" && event.usage) outputTokens = event.usage.output_tokens ?? 0;
    if (event.type === "message_start" && event.message.usage) inputTokens = event.message.usage.input_tokens ?? 0;
  }
  return { text: fullText, inputTokens, outputTokens };
}

async function* streamOllama(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
  maxTokens: number,
): AsyncGenerator<AnswerChunk, StreamResult> {
  const client = getOllamaClient();
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = await client.chat.completions.create({
    model, max_tokens: maxTokens, stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) { fullText += delta; yield { type: "text", content: delta }; }
    if (chunk.usage) { inputTokens = chunk.usage.prompt_tokens ?? 0; outputTokens = chunk.usage.completion_tokens ?? 0; }
  }
  return { text: fullText, inputTokens, outputTokens };
}
