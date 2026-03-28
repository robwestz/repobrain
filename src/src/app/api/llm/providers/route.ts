/**
 * GET /api/llm/providers
 *
 * Public endpoint — no auth required.
 * Returns the list of available LLM providers and their models,
 * filtered to only those whose API keys are present in the environment.
 *
 * Response shape:
 * {
 *   defaultProvider: string,
 *   providers: {
 *     [providerName]: {
 *       models: string[],
 *       defaultModel: string,
 *       isDefault: boolean
 *     }
 *   }
 * }
 */

import { NextResponse } from "next/server";
import { loadLLMConfig, getAvailableProviders, getModelsForProvider } from "@/src/modules/llm/config";

export async function GET() {
  const config = loadLLMConfig();
  const available = getAvailableProviders();

  const providers: Record<
    string,
    { models: string[]; defaultModel: string; isDefault: boolean }
  > = {};

  for (const name of available) {
    const pc = config.providers[name];
    if (!pc) continue;
    providers[name] = {
      models: getModelsForProvider(name),
      defaultModel: pc.defaultModel,
      isDefault: name === config.defaultProvider,
    };
  }

  return NextResponse.json({
    defaultProvider: config.defaultProvider,
    providers,
  });
}
