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
import { assembleContext } from "./context";
import { detectQueryDomain, applyDomainBoost } from "./domain-filter";
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
 */
export async function retrieve(
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

  // --- Domain detection + boosting ------------------------------------------
  // Heuristic, no LLM. Detects the likely domain from the query and boosts
  // matching chunks by +0.2. ADDITIVE: chunks are never removed, only reordered.
  const detectedDomain = detectQueryDomain(question);
  const domainBoostedChunks = detectedDomain
    ? applyDomainBoost(rankedChunks, detectedDomain).sort((a, b) => b.score - a.score)
    : rankedChunks;

  // --- Context assembly ------------------------------------------------------
  const assemblyStart = Date.now();

  const contextWindow = await assembleContext(domainBoostedChunks, repoConnectionId, {
    includeRepoSummary,
    filePath,
    maxContextTokens,
    domain: detectedDomain ?? undefined,
  });

  timing.contextAssemblyMs = Date.now() - assemblyStart;

  const durationMs = Date.now() - startTime;

  return {
    chunks: domainBoostedChunks,
    totalCandidates,
    query: question,
    expandedQueries: [], // query expansion reserved for future enhancement
    repoSummary: contextWindow.repoSummary,
    totalTokens: contextWindow.totalTokens,
    durationMs,
    timing,
    domain: detectedDomain ?? undefined,
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
