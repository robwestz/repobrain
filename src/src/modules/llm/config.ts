/**
 * LLM config loader — reads llm-providers.json at startup (singleton).
 *
 * Inspired by DeepWiki's generator.json pattern: a JSON file declares all
 * providers, their models, and the env-var name that holds the API key.
 * At runtime we resolve which providers are "available" by checking whether
 * the required env var is actually set (or, for Ollama, whether OLLAMA_HOST
 * is set or the default base URL is present).
 *
 * All exported functions are pure / synchronous after the initial load so
 * that callers pay zero async overhead per request.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

export interface ModelConfig {
  temperature: number;
  maxTokens: number;
}

export interface ProviderConfig {
  models: Record<string, ModelConfig>;
  defaultModel: string;
  apiKeyEnv: string | null;
  embeddingModel?: string;
  baseUrl?: string;
}

export interface LLMConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
}

// ---------------------------------------------------------------------------
// Singleton load — happens once per process
// ---------------------------------------------------------------------------

let _config: LLMConfig | null = null;

/**
 * Load and cache the llm-providers.json configuration.
 * Falls back to a minimal hardcoded config if the file is missing or malformed,
 * preserving backward-compatibility with the original hardcoded behaviour.
 */
export function loadLLMConfig(): LLMConfig {
  if (_config) return _config;

  const configPath = path.resolve(
    process.cwd(),
    "src",
    "config",
    "llm-providers.json",
  );

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as LLMConfig;
      if (parsed.providers && parsed.defaultProvider) {
        _config = parsed;
        return _config;
      }
    }
  } catch {
    // Swallow — fall through to the default below
  }

  // ---- Fallback: mirrors the original hardcoded values ----
  _config = {
    defaultProvider: "openai",
    providers: {
      openai: {
        models: {
          "gpt-4o": { temperature: 0.7, maxTokens: 4096 },
        },
        defaultModel: "gpt-4o",
        embeddingModel: "text-embedding-3-small",
        apiKeyEnv: "OPENAI_API_KEY",
      },
      anthropic: {
        models: {
          "claude-sonnet-4-20250514": { temperature: 0.7, maxTokens: 4096 },
        },
        defaultModel: "claude-sonnet-4-20250514",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      },
    },
  };
  return _config;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns only the providers whose API key env var is set in the current
 * environment.  For Ollama (apiKeyEnv === null) we include it when either
 * OLLAMA_HOST is set or the provider's baseUrl is the default localhost one.
 */
export function getAvailableProviders(): string[] {
  const config = loadLLMConfig();
  return Object.entries(config.providers)
    .filter(([, pc]) => isProviderAvailable(pc))
    .map(([name]) => name);
}

function isProviderAvailable(pc: ProviderConfig): boolean {
  if (pc.apiKeyEnv === null) {
    // Ollama — available if OLLAMA_HOST is set or baseUrl is configured
    return !!(process.env.OLLAMA_HOST ?? pc.baseUrl);
  }
  return !!process.env[pc.apiKeyEnv];
}

/**
 * List the model names declared for a provider.
 * Returns an empty array for unknown providers.
 */
export function getModelsForProvider(provider: string): string[] {
  const config = loadLLMConfig();
  const pc = config.providers[provider];
  if (!pc) return [];
  return Object.keys(pc.models);
}

/**
 * Get the temperature/maxTokens config for a specific provider+model pair.
 * Falls back to the provider's default model config if the named model isn't found.
 * Throws if the provider itself doesn't exist.
 */
export function getModelConfig(provider: string, model: string): ModelConfig {
  const config = loadLLMConfig();
  const pc = config.providers[provider];
  if (!pc) {
    throw new Error(`LLM provider '${provider}' is not defined in config`);
  }
  if (pc.models[model]) return pc.models[model];
  // Fall back to default model config
  const defaultCfg = pc.models[pc.defaultModel];
  if (defaultCfg) return defaultCfg;
  throw new Error(
    `No model config found for '${provider}/${model}' and no default model fallback`,
  );
}

/**
 * Get the full provider config object for a provider.
 * Returns undefined if the provider isn't in the config file.
 */
export function getProviderConfig(provider: string): ProviderConfig | undefined {
  return loadLLMConfig().providers[provider];
}

/** Convenience: the configured default provider name */
export function getDefaultProvider(): string {
  return loadLLMConfig().defaultProvider;
}
