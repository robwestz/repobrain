/**
 * LLM provider abstraction — supports OpenAI, Anthropic, and Ollama.
 *
 * Provider/model selection priority (highest to lowest):
 *   1. DEFAULT_LLM_PROVIDER / OPENAI_MODEL / ANTHROPIC_MODEL / OLLAMA_MODEL env vars
 *   2. llm-providers.json config file defaults
 *   3. Hard-coded fallback values (backward compat)
 *
 * Ollama reuses the OpenAI-compatible SDK pointed at a custom baseURL —
 * no additional npm packages required.
 *
 * All SDK clients are lazy singletons — instantiated at most once per
 * provider per process.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  loadLLMConfig,
  getProviderConfig,
  getDefaultProvider,
  getModelConfig,
  getAvailableProviders,
  getModelsForProvider,
  type ModelConfig,
} from "./config";

// ---------------------------------------------------------------------------
// Provider type
// ---------------------------------------------------------------------------

export type LLMProvider = "openai" | "anthropic" | "ollama";

// ---------------------------------------------------------------------------
// Active provider / model resolution
// ---------------------------------------------------------------------------

export function getProvider(): LLMProvider {
  const envProvider = process.env.DEFAULT_LLM_PROVIDER?.toLowerCase();
  if (
    envProvider === "anthropic" ||
    envProvider === "openai" ||
    envProvider === "ollama"
  ) {
    return envProvider;
  }
  const configDefault = getDefaultProvider();
  if (
    configDefault === "anthropic" ||
    configDefault === "openai" ||
    configDefault === "ollama"
  ) {
    return configDefault as LLMProvider;
  }
  return "openai";
}

export function getModel(provider?: LLMProvider): string {
  const p = provider ?? getProvider();
  const pc = getProviderConfig(p);
  if (p === "openai") return process.env.OPENAI_MODEL ?? pc?.defaultModel ?? "gpt-4o";
  if (p === "anthropic") return process.env.ANTHROPIC_MODEL ?? pc?.defaultModel ?? "claude-sonnet-4-20250514";
  if (p === "ollama") return process.env.OLLAMA_MODEL ?? pc?.defaultModel ?? "llama3.1";
  return pc?.defaultModel ?? "gpt-4o";
}

export function getActiveModelConfig(provider?: LLMProvider, model?: string): ModelConfig {
  const p = provider ?? getProvider();
  const m = model ?? getModel(p);
  try {
    return getModelConfig(p, m);
  } catch {
    return { temperature: 0.7, maxTokens: 4096 };
  }
}

/** @deprecated Use getModel() instead */
export const LLM_MODEL: string = getModel();

/** @deprecated Use getActiveModelConfig().maxTokens instead */
export const LLM_MAX_TOKENS: number = getActiveModelConfig().maxTokens;

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;

export function getOpenAIClient(accessToken?: string): OpenAI {
  if (accessToken) {
    // Per-user OAuth token — don't cache as singleton
    return new OpenAI({ apiKey: accessToken });
  }
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error(
        "OPENAI_API_KEY environment variable is not set and no user OAuth token provided",
      );
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Ollama client — OpenAI-compatible, custom baseURL
// ---------------------------------------------------------------------------

let _ollama: OpenAI | null = null;

export function getOllamaClient(): OpenAI {
  if (!_ollama) {
    const pc = getProviderConfig("ollama");
    const ollamaHost = process.env.OLLAMA_HOST ?? pc?.baseUrl ?? "http://localhost:11434";
    _ollama = new OpenAI({
      apiKey: "ollama",
      baseURL: `${ollamaHost.replace(/\/$/, "")}/v1`,
    });
  }
  return _ollama;
}

export { loadLLMConfig, getAvailableProviders, getModelsForProvider };
