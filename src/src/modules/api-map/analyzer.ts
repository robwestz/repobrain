/**
 * API Surface Map — Endpoint Analyzer / Enricher
 *
 * Enriches detected endpoints with:
 *   1. Related endpoint grouping (same resource path)
 *   2. LLM-generated one-line descriptions (batched)
 *   3. DB/external call detection
 */

import type { DetectedEndpoint } from "./detector";
import { getProvider, getOpenAIClient, getAnthropicClient, LLM_MODEL } from "@/src/modules/llm/provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichedEndpoint extends DetectedEndpoint {
  relatedEndpointIds: string[];
  dbTablesAccessed: string[];
  externalApiCalls: string[];
}

export type ApiMapResult = {
  endpoints: EnrichedEndpoint[];
  framework: string;
  totalEndpoints: number;
  groupedByResource: Record<string, EnrichedEndpoint[]>;
  cached: boolean;
};

// ---------------------------------------------------------------------------
// Resource grouping helpers
// ---------------------------------------------------------------------------

/**
 * Extract the "resource" from a path for grouping purposes.
 * /api/workspaces/:id/repos → "/api/workspaces"
 * /api/auth/login           → "/api/auth"
 * /users/:id                → "/users"
 */
function extractResource(path: string): string {
  const parts = path.split("/").filter(Boolean);
  // Strip dynamic segments and take up to the first non-param segment
  const staticParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith(":") || part.startsWith("[")) break;
    staticParts.push(part);
    // Stop after 2 meaningful segments to avoid over-splitting
    if (staticParts.length >= 2) break;
  }
  return "/" + staticParts.join("/");
}

/**
 * Detect table/collection names accessed in handler code.
 * Looks for Drizzle/Prisma/TypeORM/Mongoose patterns.
 */
function detectDbAccesses(code: string | null): string[] {
  if (!code) return [];
  const tables = new Set<string>();

  // Drizzle: .from(tableName) / .insert(tableName) / .update(tableName)
  const drizzlePattern = /\.(?:from|insert|update|delete)\s*\(\s*([a-zA-Z_]\w*)\s*\)/g;
  let m;
  while ((m = drizzlePattern.exec(code)) !== null) {
    tables.add(m[1]);
  }

  // Prisma: prisma.tableName.findMany
  const prismaPattern = /prisma\.([a-zA-Z_]\w*)\.(?:find|create|update|delete|upsert)/g;
  while ((m = prismaPattern.exec(code)) !== null) {
    tables.add(m[1]);
  }

  // TypeORM: getRepository(Entity) / entityManager.find(Entity)
  const typeormPattern = /getRepository\s*\(\s*([A-Z][a-zA-Z_]*)\s*\)/g;
  while ((m = typeormPattern.exec(code)) !== null) {
    tables.add(m[1]);
  }

  return [...tables].slice(0, 8);
}

/**
 * Detect external API calls in handler code.
 */
function detectExternalCalls(code: string | null): string[] {
  if (!code) return [];
  const calls: string[] = [];

  // fetch("https://...")
  const fetchPattern = /fetch\s*\(\s*['"`](https?:\/\/[^'"` ]+)['"`]/g;
  let m;
  while ((m = fetchPattern.exec(code)) !== null) {
    try {
      const url = new URL(m[1]);
      calls.push(url.hostname);
    } catch {
      calls.push(m[1].slice(0, 50));
    }
  }

  // axios.get("https://...")
  const axiosPattern = /axios\.(?:get|post|put|delete)\s*\(\s*['"`](https?:\/\/[^'"` ]+)['"`]/g;
  while ((m = axiosPattern.exec(code)) !== null) {
    try {
      const url = new URL(m[1]);
      calls.push(url.hostname);
    } catch {
      calls.push(m[1].slice(0, 50));
    }
  }

  return [...new Set(calls)].slice(0, 5);
}

// ---------------------------------------------------------------------------
// LLM description generation
// ---------------------------------------------------------------------------

/**
 * Generate one-line descriptions for all endpoints in a single LLM call.
 * Returns a map of endpoint id → description.
 */
async function generateDescriptions(
  endpoints: DetectedEndpoint[],
): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();

  if (endpoints.length === 0) return descriptions;

  // Build a concise summary of each endpoint for the prompt
  const endpointSummaries = endpoints.map((ep, i) => {
    const params = ep.parameters.length > 0
      ? ep.parameters.map((p) => `${p.name}(${p.location})`).join(", ")
      : "none";
    const codeSnippet = ep.handlerCode
      ? ep.handlerCode.slice(0, 300).replace(/\n+/g, " ")
      : "";
    return `${i + 1}. [${ep.id}] ${ep.method} ${ep.path}
   Framework: ${ep.framework}, Auth: ${ep.authRequired}
   Params: ${params}
   Code preview: ${codeSnippet}`;
  });

  const prompt = `You are analyzing API endpoints in a codebase. For each endpoint below, write a single concise sentence (max 15 words) describing what it does.

Respond in JSON format as an object where keys are the endpoint IDs and values are the descriptions.
Only include the JSON object, nothing else.

Endpoints:
${endpointSummaries.join("\n\n")}`;

  try {
    const provider = getProvider();
    let responseText = "";

    if (provider === "openai") {
      const client = getOpenAIClient();
      const resp = await client.chat.completions.create({
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      responseText = resp.choices[0]?.message?.content ?? "{}";
    } else {
      const client = getAnthropicClient();
      const resp = await client.messages.create({
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const block = resp.content[0];
      responseText = block.type === "text" ? block.text : "{}";
    }

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
      for (const [id, desc] of Object.entries(parsed)) {
        if (typeof desc === "string") {
          descriptions.set(id, desc);
        }
      }
    }
  } catch {
    // LLM failure is non-fatal; endpoints will have null descriptions
  }

  return descriptions;
}

// ---------------------------------------------------------------------------
// Primary enrichment function
// ---------------------------------------------------------------------------

export async function enrichEndpoints(
  endpoints: DetectedEndpoint[],
): Promise<ApiMapResult> {
  // Generate LLM descriptions for all endpoints in one batch
  const descriptions = await generateDescriptions(endpoints);

  // Enrich each endpoint
  const enriched: EnrichedEndpoint[] = endpoints.map((ep) => ({
    ...ep,
    description: descriptions.get(ep.id) ?? ep.description,
    dbTablesAccessed: detectDbAccesses(ep.handlerCode),
    externalApiCalls: detectExternalCalls(ep.handlerCode),
    relatedEndpointIds: [], // populated below
  }));

  // Compute related endpoints (same resource)
  const byResource = new Map<string, string[]>();
  for (const ep of enriched) {
    const resource = extractResource(ep.path);
    const group = byResource.get(resource) ?? [];
    group.push(ep.id);
    byResource.set(resource, group);
  }

  // Assign relatedEndpointIds (exclude self)
  for (const ep of enriched) {
    const resource = extractResource(ep.path);
    const group = byResource.get(resource) ?? [];
    ep.relatedEndpointIds = group.filter((id) => id !== ep.id);
  }

  // Group by resource for the response
  const groupedByResource: Record<string, EnrichedEndpoint[]> = {};
  for (const ep of enriched) {
    const resource = extractResource(ep.path);
    const group = groupedByResource[resource] ?? [];
    group.push(ep);
    groupedByResource[resource] = group;
  }

  // Detect the primary framework (most common one)
  const frameworkCounts = new Map<string, number>();
  for (const ep of enriched) {
    frameworkCounts.set(ep.framework, (frameworkCounts.get(ep.framework) ?? 0) + 1);
  }
  let primaryFramework = "unknown";
  let maxCount = 0;
  for (const [fw, count] of frameworkCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryFramework = fw;
    }
  }

  return {
    endpoints: enriched,
    framework: primaryFramework,
    totalEndpoints: enriched.length,
    groupedByResource,
    cached: false,
  };
}
