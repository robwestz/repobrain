/**
 * Rank-and-merge: combine results from semantic, lexical, and structural
 * search into a single ranked list.
 *
 * Weights (from §06):
 *   semantic  = 0.45
 *   lexical   = 0.30
 *   structural = 0.25
 *
 * Intersection bonus: +0.15 for chunks appearing in multiple strategies.
 * File-scope boost: +0.30 for chunks matching a scoped file path.
 */

import type {
  VectorSearchResult,
  KeywordSearchResult,
  RerankCandidate,
  RankedChunk,
} from "../../types/retrieval";

const WEIGHT_SEMANTIC = 0.45;
const WEIGHT_LEXICAL = 0.30;
const WEIGHT_STRUCTURAL = 0.25;
const INTERSECTION_BONUS = 0.15;
const FILE_SCOPE_BOOST = 0.30;

/** Normalize an array of scores to [0, 1] using min-max scaling. */
function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => (max > 0 ? 1.0 : 0.0));
  return values.map((v) => (v - min) / range);
}

export interface RankerOptions {
  /** If set, boost chunks from this file path */
  filePath?: string;
  /** Maximum results to return (default 15) */
  topK?: number;
}

/**
 * Merge and rank results from all three retrieval strategies.
 *
 * @param semanticResults   Results from pgvector k-NN
 * @param lexicalResults    Results from Postgres FTS
 * @param structuralResults Results from symbol graph traversal
 * @param options           Ranking options (file scope, top-K)
 * @returns Deduplicated, ranked chunks
 */
export function rankAndMerge(
  semanticResults: VectorSearchResult[],
  lexicalResults: KeywordSearchResult[],
  structuralResults: VectorSearchResult[],
  options: RankerOptions = {},
): RankedChunk[] {
  const topK = options.topK ?? 15;

  // --- 1. Normalize scores within each strategy -----------------------------
  const semScores = normalizeScores(semanticResults.map((r) => r.similarity));
  const lexScores = normalizeScores(lexicalResults.map((r) => r.bm25Score));
  const strScores = normalizeScores(structuralResults.map((r) => r.similarity));

  // --- 2. Build a merged map keyed by chunkId -------------------------------
  const candidateMap = new Map<string, RerankCandidate & { strategies: number; structuralScore: number }>();

  // Helper: upsert into map
  function upsert(
    chunkId: string,
    base: {
      fileId: string;
      filePath: string;
      content: string;
      startLine: number;
      endLine: number;
      symbolName: string | null;
      symbolKind: string | null;
      language: string | null;
      tokenCount: number;
    },
    vectorScore: number,
    keywordScore: number,
    structuralScore: number,
  ) {
    const existing = candidateMap.get(chunkId);
    if (existing) {
      existing.vectorScore = Math.max(existing.vectorScore, vectorScore);
      existing.keywordScore = Math.max(existing.keywordScore, keywordScore);
      existing.structuralScore = Math.max(existing.structuralScore, structuralScore);
      existing.strategies += 1;
    } else {
      candidateMap.set(chunkId, {
        chunkId,
        ...base,
        vectorScore,
        keywordScore,
        structuralScore,
        strategies: 1,
      });
    }
  }

  // Semantic
  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    upsert(r.chunkId, r, semScores[i], 0, 0);
  }

  // Lexical
  for (let i = 0; i < lexicalResults.length; i++) {
    const r = lexicalResults[i];
    upsert(
      r.chunkId,
      {
        fileId: r.fileId,
        filePath: r.filePath,
        content: r.content,
        startLine: r.startLine,
        endLine: r.endLine,
        symbolName: r.symbolName,
        symbolKind: r.symbolKind,
        language: r.language,
        tokenCount: r.tokenCount,
      },
      0,
      lexScores[i],
      0,
    );
  }

  // Structural
  for (let i = 0; i < structuralResults.length; i++) {
    const r = structuralResults[i];
    upsert(r.chunkId, r, 0, 0, strScores[i]);
  }

  // --- 3. Compute combined score -------------------------------------------
  const ranked: RankedChunk[] = [];

  for (const c of candidateMap.values()) {
    let score =
      c.vectorScore * WEIGHT_SEMANTIC +
      c.keywordScore * WEIGHT_LEXICAL +
      c.structuralScore * WEIGHT_STRUCTURAL;

    // Intersection bonus: appears in 2+ strategies
    if (c.strategies >= 2) {
      score += INTERSECTION_BONUS;
    }

    // File-scope boost
    if (options.filePath && c.filePath === options.filePath) {
      score += FILE_SCOPE_BOOST;
    }

    // Clamp to [0, 1] (bonuses can push above 1)
    score = Math.min(1.0, score);

    ranked.push({
      chunkId: c.chunkId,
      fileId: c.fileId,
      filePath: c.filePath,
      content: c.content,
      startLine: c.startLine,
      endLine: c.endLine,
      score,
      vectorScore: c.vectorScore,
      keywordScore: c.keywordScore,
      symbolName: c.symbolName,
      symbolKind: c.symbolKind,
      language: c.language,
      tokenCount: c.tokenCount,
    });
  }

  // --- 4. Sort descending by score, deduplicate overlapping chunks ----------
  ranked.sort((a, b) => b.score - a.score);
  return deduplicateOverlapping(ranked).slice(0, topK);
}

/**
 * Remove chunks that substantially overlap with a higher-scored chunk in the
 * same file. Two chunks "overlap" if their line ranges intersect by ≥50%.
 */
function deduplicateOverlapping(chunks: RankedChunk[]): RankedChunk[] {
  const kept: RankedChunk[] = [];

  for (const chunk of chunks) {
    const dominated = kept.some((existing) => {
      if (existing.filePath !== chunk.filePath) return false;
      const overlapStart = Math.max(existing.startLine, chunk.startLine);
      const overlapEnd = Math.min(existing.endLine, chunk.endLine);
      if (overlapEnd < overlapStart) return false;
      const overlapSize = overlapEnd - overlapStart + 1;
      const chunkSize = chunk.endLine - chunk.startLine + 1;
      return overlapSize / chunkSize >= 0.5;
    });

    if (!dominated) {
      kept.push(chunk);
    }
  }

  return kept;
}
