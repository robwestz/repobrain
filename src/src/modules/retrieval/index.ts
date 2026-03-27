/**
 * Retrieval engine entry point — §09 interface contract:
 *
 *   retrieve(question, repoConnectionId, options?) → RetrievalResult
 *
 * Orchestrates semantic + lexical + structural search in parallel, merges
 * via the ranker, and assembles the final context window.
 *
 * This module is PURE READ-ONLY. It never mutates any data.
 */

import { semanticSearch } from "./semantic";
import { lexicalSearch } from "./lexical";
import { structuralSearch } from "./structural";
import { rankAndMerge } from "./ranker";
import { assembleContext, formatContextForPrompt } from "./context";
import type {
  RetrievalOptions,
  RetrievalResult,
  RetrievalTiming,
} from "../../types/retrieval";

/**
 * Main retrieval function matching the §09 contract.
 *
 * Runs all three strategies in parallel, merges results, and assembles
 * an LLM-ready context window.
 *
 * When repoConnectionIds contains multiple IDs, runs retrieval on each repo
 * in parallel and merges results. Single-repo behavior is the default.
 */
export async function retrieve(
  question: string,
  repoConnectionId: string,
  options?: Partial<Omit<RetrievalOptions, "query" | "repoConnectionId">> & {
    repoConnectionIds?: string[];
  },
): Promise<RetrievalResult> {
  // Multi-repo mode: run on all repos in parallel and merge
  const additionalRepoIds = options?.repoConnectionIds?.filter(
    (id) => id !== repoConnectionId,
  ) ?? [];

  if (additionalRepoIds.length > 0) {
    return retrieveMultiRepo(question, [repoConnectionId, ...additionalRepoIds], options);
  }

  return retrieveSingleRepo(question, repoConnectionId, options);
}

/**
 * Retrieve across multiple repos by running single-repo retrieval in parallel
 * and merging results, keeping repo attribution via repoName labels on chunks.
 */
async function retrieveMultiRepo(
  question: string,
  repoConnectionIds: string[],
  options?: Partial<Omit<RetrievalOptions, "query" | "repoConnectionId">>,
): Promise<RetrievalResult> {
  const results = await Promise.all(
    repoConnectionIds.map((id) => retrieveSingleRepo(question, id, options)),
  );

  // Merge all chunks and sort by score descending
  const allChunks = results.flatMap((r) => r.chunks);
  allChunks.sort((a, b) => b.score - a.score);

  const maxResults = options?.maxResults ?? 15;
  const mergedChunks = allChunks.slice(0, maxResults);

  const totalCandidates = results.reduce((sum, r) => sum + r.totalCandidates, 0);
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
  const durationMs = Math.max(...results.map((r) => r.durationMs));

  // Use the first repo's summary (primary repo)
  const repoSummary = results[0]?.repoSummary ?? null;

  const timing = results[0]?.timing ?? {
    queryExpansionMs: 0,
    vectorSearchMs: 0,
    keywordSearchMs: 0,
    rerankingMs: 0,
    contextAssemblyMs: 0,
  };

  return {
    chunks: mergedChunks,
    totalCandidates,
    query: question,
    expandedQueries: [],
    repoSummary,
    totalTokens,
    durationMs,
    timing,
  };
}

/**
 * Single-repo retrieval — the original implementation.
 */
async function retrieveSingleRepo(
  question: string,
  repoConnectionId: string,
  options?: Partial<Omit<RetrievalOptions, "query" | "repoConnectionId">>,
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const timing: RetrievalTiming = {
    queryExpansionMs: 0,
    vectorSearchMs: 0,
    keywordSearchMs: 0,
    rerankingMs: 0,
    contextAssemblyMs: 0,
  };

  const maxResults = options?.maxResults ?? 15;
  const candidatePoolSize = options?.candidatePoolSize ?? 20;
  const similarityThreshold = options?.similarityThreshold ?? 0.3;
  const filePath = options?.fileFilter;
  const includeRepoSummary = options?.includeRepoSummary !== false;
  const maxContextTokens = options?.maxContextTokens ?? 12_000;

  // Top-K for deep questions vs standard (§06)
  const topK = maxResults > 20 ? 25 : maxResults;

  // --- Run all three strategies in parallel ----------------------------------
  const [semanticResults, lexicalResults, structuralResults] = await Promise.all([
    timedSearch(() => semanticSearch(question, repoConnectionId, candidatePoolSize, similarityThreshold)),
    timedSearch(() => lexicalSearch(question, repoConnectionId, candidatePoolSize)),
    timedSearch(() => structuralSearch(question, repoConnectionId)),
  ]);

  timing.vectorSearchMs = semanticResults.durationMs;
  timing.keywordSearchMs = lexicalResults.durationMs;
  // Structural timing is folded into keyword for the timing breakdown
  // since they run in parallel; we report the wall-clock time of the slowest

  const totalCandidates =
    semanticResults.results.length +
    lexicalResults.results.length +
    structuralResults.results.length;

  // --- Rank and merge --------------------------------------------------------
  const rankStart = Date.now();

  const rankedChunks = rankAndMerge(
    semanticResults.results,
    lexicalResults.results,
    structuralResults.results,
    { filePath, topK },
  );

  timing.rerankingMs = Date.now() - rankStart;

  // --- Context assembly ------------------------------------------------------
  const assemblyStart = Date.now();

  const contextWindow = await assembleContext(rankedChunks, repoConnectionId, {
    includeRepoSummary,
    filePath,
    maxContextTokens,
  });

  timing.contextAssemblyMs = Date.now() - assemblyStart;

  const durationMs = Date.now() - startTime;

  return {
    chunks: rankedChunks,
    totalCandidates,
    query: question,
    expandedQueries: [], // query expansion reserved for future enhancement
    repoSummary: contextWindow.repoSummary,
    totalTokens: contextWindow.totalTokens,
    durationMs,
    timing,
  };
}

// Re-export context formatting for downstream consumers (LLM module)
export { formatContextForPrompt, assembleContext } from "./context";
export { extractSymbolCandidates } from "./structural";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface TimedResult<T> {
  results: T;
  durationMs: number;
}

async function timedSearch<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = Date.now();
  const results = await fn();
  return { results, durationMs: Date.now() - start };
}
