/**
 * LLM provider abstraction — wraps the Anthropic Claude client.
 *
 * Exposes a lazy singleton so the SDK is only instantiated once per process.
 * Model is configurable via ANTHROPIC_MODEL env var so it can be swapped
 * without a code change.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Model ID to use for answer generation.
 * Override with ANTHROPIC_MODEL env var if needed.
 */
export const LLM_MODEL: string =
  process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

/**
 * Maximum tokens to generate in a single response.
 * 4096 is a reasonable upper bound for code Q&A answers.
 */
export const LLM_MAX_TOKENS = 4096;
