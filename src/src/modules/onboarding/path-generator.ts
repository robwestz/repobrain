/**
 * Smart Onboarding Path Generator (Job 09)
 *
 * Gathers repo context from the DB, calls the LLM to produce a structured
 * 5-8 step learning path, validates all file/symbol references against the DB,
 * and caches the result in Redis for 30 minutes.
 */

import { db } from "@/src/lib/db";
import { files, symbols, symbolRelations, repoSummaries } from "@/src/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { getRedis } from "@/src/lib/redis";
import { getProvider, getOpenAIClient, getAnthropicClient } from "@/src/modules/llm/provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusFile {
  path: string;
  startLine?: number;
  endLine?: number;
  why: string;
}

export interface KeySymbol {
  name: string;
  kind: string;
  filePath: string;
  explanation: string;
}

export interface OnboardingStep {
  order: number;
  title: string;
  description: string;
  focusFiles: FocusFile[];
  keySymbols: KeySymbol[];
  conceptsLearned: string[];
  estimatedMinutes: number;
}

export interface OnboardingPath {
  id: string;
  repoConnectionId: string;
  role: string;
  title: string;
  overview: string;
  totalSteps: number;
  estimatedTotalMinutes: number;
  steps: OnboardingStep[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

function cacheKey(repoConnectionId: string, role: string): string {
  const safeRole = role.replace(/\s+/g, "_").toLowerCase();
  return `onboarding:path:${repoConnectionId}:${safeRole}`;
}

async function getCached(repoConnectionId: string, role: string): Promise<OnboardingPath | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(cacheKey(repoConnectionId, role));
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingPath;
  } catch {
    return null;
  }
}

async function setCached(path: OnboardingPath): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      cacheKey(path.repoConnectionId, path.role),
      CACHE_TTL_SECONDS,
      JSON.stringify(path),
    );
  } catch {
    // Non-fatal — continue without caching
  }
}

// ---------------------------------------------------------------------------
// Repo context gathering
// ---------------------------------------------------------------------------

interface RepoContext {
  fileCount: number;
  languages: string[];
  topDirs: string[];
  topSymbols: { name: string; kind: string; filePath: string; incomingCount: number }[];
  entryPoints: string[];
  summary: string | null;
}

async function gatherRepoContext(repoConnectionId: string): Promise<RepoContext> {
  // File count + language breakdown
  const fileRows = await db
    .select({ language: files.language, path: files.path })
    .from(files)
    .where(eq(files.repoConnectionId, repoConnectionId));

  const fileCount = fileRows.length;

  const langCounts: Record<string, number> = {};
  for (const f of fileRows) {
    if (f.language) {
      langCounts[f.language] = (langCounts[f.language] ?? 0) + 1;
    }
  }
  const languages = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang]) => lang);

  // Top-level directories
  const dirCounts: Record<string, number> = {};
  for (const f of fileRows) {
    const firstSegment = f.path.split("/")[0];
    if (firstSegment) {
      dirCounts[firstSegment] = (dirCounts[firstSegment] ?? 0) + 1;
    }
  }
  const topDirs = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dir]) => dir);

  // Entry points: route handlers, main files, index files
  const entryPoints = fileRows
    .filter((f) => {
      const lower = f.path.toLowerCase();
      return (
        lower.endsWith("/index.ts") ||
        lower.endsWith("/index.tsx") ||
        lower.endsWith("/index.js") ||
        lower === "index.ts" ||
        lower === "index.tsx" ||
        lower === "index.js" ||
        lower.includes("route.ts") ||
        lower.includes("route.tsx") ||
        lower.includes("main.ts") ||
        lower.includes("main.js") ||
        lower.includes("app.ts") ||
        lower.includes("app.js") ||
        lower.includes("server.ts") ||
        lower.includes("server.js")
      );
    })
    .map((f) => f.path)
    .slice(0, 15);

  // Most-referenced symbols (highest afferent coupling — most incoming relations)
  const topSymbolRows = await db
    .select({
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
      incomingCount: sql<number>`cast(count(${symbolRelations.id}) as integer)`,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .leftJoin(symbolRelations, eq(symbolRelations.toSymbolId, symbols.id))
    .where(eq(files.repoConnectionId, repoConnectionId))
    .groupBy(symbols.id, symbols.name, symbols.kind, files.path)
    .orderBy(desc(sql`count(${symbolRelations.id})`))
    .limit(20);

  const topSymbols = topSymbolRows.map((r) => ({
    name: r.name,
    kind: r.kind,
    filePath: r.filePath,
    incomingCount: r.incomingCount,
  }));

  // Repo summary (if available)
  const summaryRow = await db.query.repoSummaries.findFirst({
    where: eq(repoSummaries.repoConnectionId, repoConnectionId),
  });

  return {
    fileCount,
    languages,
    topDirs,
    topSymbols,
    entryPoints,
    summary: summaryRow?.summaryText ?? null,
  };
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

const STEP_SCHEMA = `{
  "order": <number 1-N>,
  "title": <string>,
  "description": <string — 2 to 3 paragraphs explaining this step>,
  "focusFiles": [
    { "path": <string — exact file path>, "startLine": <number|null>, "endLine": <number|null>, "why": <string> }
  ],
  "keySymbols": [
    { "name": <string>, "kind": <string e.g. function/class/interface>, "filePath": <string>, "explanation": <string> }
  ],
  "conceptsLearned": [<string>, ...],
  "estimatedMinutes": <number>
}`;

const RESPONSE_SCHEMA = `{
  "title": <string e.g. "Getting Started with <RepoName>">,
  "overview": <string — 2 to 3 sentences about the repo>,
  "steps": [<step>, ...]
}`;

async function callLLM(context: RepoContext, role: string): Promise<{
  title: string;
  overview: string;
  steps: OnboardingStep[];
}> {
  const topSymbolsText = context.topSymbols
    .slice(0, 10)
    .map((s) => `  - ${s.name} (${s.kind}) in ${s.filePath}`)
    .join("\n");

  const prompt = `You are generating a developer onboarding guide for a codebase.

Repository stats:
- ${context.fileCount} files across languages: ${context.languages.join(", ") || "unknown"}
- Key directories: ${context.topDirs.join(", ") || "none found"}
- Most important symbols:
${topSymbolsText || "  (none indexed yet)"}
- Entry points: ${context.entryPoints.slice(0, 8).join(", ") || "none found"}
- Repo summary: ${context.summary ?? "Not available — infer from the stats above."}

Generate a 5 to 8 step learning path for a "${role}" developer joining this project.
Each step must focus on one concept or architectural layer.
Order steps from foundational to advanced (e.g. data model → auth → API layer → UI layer → advanced features).
For each step, specify which files to read and which symbols to understand.
Use ONLY the file paths and symbol names listed above. Do not invent paths.
If fewer files exist, produce fewer steps (minimum 3).

Return ONLY valid JSON matching this schema (no markdown, no explanation):
${RESPONSE_SCHEMA}

Where each step matches:
${STEP_SCHEMA}`;

  const provider = getProvider();

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    return parseLLMResponse(text);
  } else {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content ?? "{}";
    return parseLLMResponse(text);
  }
}

function parseLLMResponse(text: string): {
  title: string;
  overview: string;
  steps: OnboardingStep[];
} {
  // Strip any accidental markdown code fences
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const parsed = JSON.parse(clean);

  const steps: OnboardingStep[] = (parsed.steps ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any, idx: number): OnboardingStep => ({
      order: typeof s.order === "number" ? s.order : idx + 1,
      title: String(s.title ?? `Step ${idx + 1}`),
      description: String(s.description ?? ""),
      focusFiles: Array.isArray(s.focusFiles) ? s.focusFiles.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f: any) => ({
          path: String(f.path ?? ""),
          startLine: typeof f.startLine === "number" ? f.startLine : undefined,
          endLine: typeof f.endLine === "number" ? f.endLine : undefined,
          why: String(f.why ?? ""),
        })
      ) : [],
      keySymbols: Array.isArray(s.keySymbols) ? s.keySymbols.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sym: any) => ({
          name: String(sym.name ?? ""),
          kind: String(sym.kind ?? ""),
          filePath: String(sym.filePath ?? ""),
          explanation: String(sym.explanation ?? ""),
        })
      ) : [],
      conceptsLearned: Array.isArray(s.conceptsLearned)
        ? s.conceptsLearned.map(String)
        : [],
      estimatedMinutes: typeof s.estimatedMinutes === "number" ? s.estimatedMinutes : 10,
    })
  );

  return {
    title: String(parsed.title ?? "Getting Started"),
    overview: String(parsed.overview ?? ""),
    steps,
  };
}

// ---------------------------------------------------------------------------
// Validation: remove hallucinated file paths and symbol names
// ---------------------------------------------------------------------------

async function validateAndFilter(
  path: { title: string; overview: string; steps: OnboardingStep[] },
  repoConnectionId: string,
): Promise<{ title: string; overview: string; steps: OnboardingStep[] }> {
  // Fetch all real file paths for this repo
  const fileRows = await db
    .select({ path: files.path })
    .from(files)
    .where(eq(files.repoConnectionId, repoConnectionId));
  const realPaths = new Set(fileRows.map((f) => f.path));

  // Fetch all real symbol names for this repo
  const symbolRows = await db
    .select({ name: symbols.name, filePath: files.path })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(eq(files.repoConnectionId, repoConnectionId));
  const realSymbols = new Set(symbolRows.map((s) => `${s.name}::${s.filePath}`));

  const validatedSteps = path.steps.map((step) => ({
    ...step,
    focusFiles: step.focusFiles.filter((f) => realPaths.has(f.path)),
    keySymbols: step.keySymbols.filter(
      (sym) => realSymbols.has(`${sym.name}::${sym.filePath}`) || realPaths.has(sym.filePath),
    ),
  }));

  return { ...path, steps: validatedSteps };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateOnboardingPath(
  repoConnectionId: string,
  role: string,
): Promise<OnboardingPath> {
  // Check cache first
  const cached = await getCached(repoConnectionId, role);
  if (cached) return cached;

  // Gather context
  const context = await gatherRepoContext(repoConnectionId);

  // Call LLM
  const raw = await callLLM(context, role);

  // Validate file paths and symbol names against DB
  const validated = await validateAndFilter(raw, repoConnectionId);

  // Build final path object
  const estimatedTotal = validated.steps.reduce(
    (sum, s) => sum + s.estimatedMinutes,
    0,
  );

  const onboardingPath: OnboardingPath = {
    id: crypto.randomUUID(),
    repoConnectionId,
    role,
    title: validated.title,
    overview: validated.overview,
    totalSteps: validated.steps.length,
    estimatedTotalMinutes: estimatedTotal,
    steps: validated.steps,
    generatedAt: new Date().toISOString(),
  };

  // Cache result
  await setCached(onboardingPath);

  return onboardingPath;
}

export async function invalidateOnboardingCache(
  repoConnectionId: string,
  role: string,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(cacheKey(repoConnectionId, role));
  } catch {
    // Non-fatal
  }
}
