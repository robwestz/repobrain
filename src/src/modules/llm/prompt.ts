/**
 * Prompt construction for the LLM layer.
 *
 * Builds the system prompt (static citation instructions) and assembles the
 * per-request messages array from retrieved context and conversation history.
 *
 * Citation format enforced: [file:path/to/file.ts:L15-L30]
 * This format is referenced in §06 of the master package and is the only
 * format parsed by citations.ts.
 */

import { formatContextForPrompt } from "../retrieval/context";
import type { ContextWindow } from "../../types/retrieval";

/** Minimal message shape needed for prompt history — avoids coupling to Drizzle row types */
export interface HistoryMessage {
  role: string;
  content: string;
}

// ---------------------------------------------------------------------------
// System prompt (fixed across all requests)
// ---------------------------------------------------------------------------

export const CITATION_SYSTEM_PROMPT = `You are RepoBrain, an expert codebase intelligence assistant. You answer questions about software repositories by analysing the actual source code that has been retrieved for you.

## Citation Format

When you reference specific code, you MUST cite it using this exact format:
  [file:path/to/file.ts:L15-L30]

Replace each part with the actual values from the provided context:
- path/to/file.ts → the relative file path shown in the context header
- 15 → the start line number (from the context header)
- 30 → the end line number (from the context header)

## Rules

1. Every factual claim about the codebase MUST have at least one citation.
2. ONLY cite files and line ranges that appear in the provided "Relevant Code" section. Never invent file paths or line numbers.
3. If you cannot find evidence for a claim in the provided context, say "I don't have enough context to answer this specifically."
4. Never give generic programming advice — always ground your answer in the actual code shown.
5. When a question mentions a function, class, variable, or module name, look it up in the context before answering.
6. If the question cannot be answered from the provided context, say so explicitly rather than guessing.
7. Keep answers focused and relevant to the user's question.

## Good citation example

"The authentication middleware is defined in [file:src/middleware/auth.ts:L12-L45] and calls the session validation helper from [file:src/lib/session.ts:L8-L22]."`;

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export interface BuiltPrompt {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Build the full prompt payload to send to Claude.
 *
 * Structure:
 *   system: CITATION_SYSTEM_PROMPT
 *   messages:
 *     [recent history...]
 *     user: {context}\n\n## Question\n{question}
 *
 * History is capped at the last 10 messages (5 turns) to stay within the
 * context budget. The current user question is always the last message.
 */
export function buildPrompt(
  question: string,
  contextWindow: ContextWindow,
  history: HistoryMessage[],
): BuiltPrompt {
  const contextText = formatContextForPrompt(contextWindow);

  // Build trimmed conversation history (exclude system messages, cap at 10)
  const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const relevantHistory = history.slice(-10);

  for (const msg of relevantHistory) {
    if (msg.role === "user" || msg.role === "assistant") {
      historyMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // The user message for this turn contains the full context + question
  const userMessage = [
    contextText,
    "",
    "## Question",
    question,
  ].join("\n");

  return {
    systemPrompt: CITATION_SYSTEM_PROMPT,
    messages: [
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
  };
}
