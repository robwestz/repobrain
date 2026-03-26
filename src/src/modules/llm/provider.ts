/**
 * LLM provider abstraction — supports OpenAI and Anthropic.
 *
 * DEFAULT_LLM_PROVIDER env var controls which backend is used (default: "openai").
 * Exposes lazy singletons so SDKs are only instantiated once per process.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LLMProvider = "openai" | "anthropic";

export function getProvider(): LLMProvider {
  const p = (process.env.DEFAULT_LLM_PROVIDER ?? "openai").toLowerCase();
  if (p === "anthropic" || p === "openai") return p;
  return "openai";
}

// --- Anthropic ---

let _anthropic: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

// --- OpenAI ---

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// --- Model config ---

export const LLM_MODEL: string =
  getProvider() === "openai"
    ? (process.env.OPENAI_MODEL ?? "gpt-4o")
    : (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514");

/**
 * Maximum tokens to generate in a single response.
 */
export const LLM_MAX_TOKENS = 4096;
