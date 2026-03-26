/**
 * Lexical search: Postgres full-text search (ts_vector/ts_query) with
 * pg_trgm trigram fallback for partial / fuzzy matches.
 *
 * The schema already defines a GIN ts_vector index and a trigram GIN index
 * on chunks.content, so both paths use index-accelerated scans.
 */

import { sql } from "drizzle-orm";
import { db } from "../../lib/db";
import type { KeywordSearchResult } from "../../types/retrieval";

/**
 * Run full-text + trigram lexical search against chunk content.
 *
 * Strategy:
 *   1. Build a `ts_query` from the query string (websearch_to_tsquery for
 *      natural language handling) and rank with ts_rank_cd.
 *   2. If FTS returns fewer than `k` results, supplement with pg_trgm
 *      similarity search on the same content column.
 *   3. Merge, deduplicate, and return up to `k` results.
 *
 * @param query           Natural-language or keyword query
 * @param repoConnectionId  UUID of the repo to search within
 * @param k               Maximum number of results to return (default 20)
 * @returns Keyword search results ordered by descending BM25/rank score
 */
export async function lexicalSearch(
  query: string,
  repoConnectionId: string,
  k: number = 20,
): Promise<KeywordSearchResult[]> {
  // --- 1. Full-text search with ts_rank_cd -----------------------------------
  const ftsRows = await db.execute<{
    chunk_id: string;
    file_id: string;
    file_path: string;
    content: string;
    start_line: number;
    end_line: number;
    rank: number;
    symbol_id: string | null;
    symbol_name: string | null;
    symbol_kind: string | null;
    language: string | null;
    token_count: number;
  }>(sql`
    SELECT
      c.id            AS chunk_id,
      c.file_id       AS file_id,
      f.path          AS file_path,
      c.content       AS content,
      c.start_line    AS start_line,
      c.end_line      AS end_line,
      ts_rank_cd(
        to_tsvector('english', c.content),
        websearch_to_tsquery('english', ${query})
      ) AS rank,
      c.symbol_id     AS symbol_id,
      s.name          AS symbol_name,
      s.kind          AS symbol_kind,
      f.language       AS language,
      c.token_count   AS token_count
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    LEFT JOIN symbols s ON s.id = c.symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${k}
  `);

  const ftsResults: KeywordSearchResult[] = ftsRows.rows.map((r) => ({
    chunkId: r.chunk_id,
    fileId: r.file_id,
    filePath: r.file_path,
    content: r.content,
    startLine: r.start_line,
    endLine: r.end_line,
    bm25Score: Number(r.rank),
    symbolId: r.symbol_id,
    symbolName: r.symbol_name,
    symbolKind: r.symbol_kind,
    language: r.language,
    tokenCount: r.token_count,
  }));

  // If FTS returned enough results, return them directly
  if (ftsResults.length >= k) {
    return ftsResults;
  }

  // --- 2. Trigram fallback for partial matches --------------------------------
  const ftsChunkIds = new Set(ftsResults.map((r) => r.chunkId));
  const remaining = k - ftsResults.length;

  const trigramRows = await db.execute<{
    chunk_id: string;
    file_id: string;
    file_path: string;
    content: string;
    start_line: number;
    end_line: number;
    sim: number;
    symbol_id: string | null;
    symbol_name: string | null;
    symbol_kind: string | null;
    language: string | null;
    token_count: number;
  }>(sql`
    SELECT
      c.id            AS chunk_id,
      c.file_id       AS file_id,
      f.path          AS file_path,
      c.content       AS content,
      c.start_line    AS start_line,
      c.end_line      AS end_line,
      similarity(c.content, ${query}) AS sim,
      c.symbol_id     AS symbol_id,
      s.name          AS symbol_name,
      s.kind          AS symbol_kind,
      f.language       AS language,
      c.token_count   AS token_count
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    LEFT JOIN symbols s ON s.id = c.symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND similarity(c.content, ${query}) > 0.1
    ORDER BY sim DESC
    LIMIT ${remaining + ftsResults.length}
  `);

  const trigramResults: KeywordSearchResult[] = trigramRows.rows
    .filter((r) => !ftsChunkIds.has(r.chunk_id))
    .slice(0, remaining)
    .map((r) => ({
      chunkId: r.chunk_id,
      fileId: r.file_id,
      filePath: r.file_path,
      content: r.content,
      startLine: r.start_line,
      endLine: r.end_line,
      // Scale trigram similarity to roughly comparable range as ts_rank
      bm25Score: Number(r.sim) * 0.5,
      symbolId: r.symbol_id,
      symbolName: r.symbol_name,
      symbolKind: r.symbol_kind,
      language: r.language,
      tokenCount: r.token_count,
    }));

  return [...ftsResults, ...trigramResults];
}
