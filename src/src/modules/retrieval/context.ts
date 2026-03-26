/**
 * Context assembly: build the final context window that gets sent to the LLM.
 *
 * Assembles:
 *   1. Repository summary (if available and enabled)
 *   2. Top-K ranked chunks with file headers and line ranges
 *   3. Full file content for file-scoped queries
 *
 * The assembled context respects a token budget (maxContextTokens) so we don't
 * blow the LLM's context window.
 */

import { sql, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { repoSummaries, files, chunks, symbols, symbolRelations } from "../../lib/db/schema";
import type { RankedChunk, ContextWindow, ContextChunk } from "../../types/retrieval";

const DEFAULT_MAX_CONTEXT_TOKENS = 12_000;

// Rough token estimate: 1 token ≈ 4 characters
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Fetch the repo summary text for inclusion as context preamble.
 */
export async function getRepoSummary(repoConnectionId: string): Promise<string | null> {
  const rows = await db
    .select({ summaryText: repoSummaries.summaryText })
    .from(repoSummaries)
    .where(eq(repoSummaries.repoConnectionId, repoConnectionId))
    .limit(1);

  return rows.length > 0 ? rows[0].summaryText : null;
}

/**
 * For file-scoped queries: fetch the full file content and its symbols,
 * plus files that import from this file (via symbol relations).
 *
 * Returns additional context chunks to prepend to the ranked results.
 */
export async function getFileScopedContext(
  repoConnectionId: string,
  filePath: string,
): Promise<ContextChunk[]> {
  const result: ContextChunk[] = [];

  // Get the full file's chunks (ordered by line number)
  const fileChunks = await db.execute<{
    chunk_id: string;
    file_id: string;
    content: string;
    start_line: number;
    end_line: number;
    symbol_name: string | null;
    language: string | null;
    token_count: number;
  }>(sql`
    SELECT
      c.id AS chunk_id,
      c.file_id,
      c.content,
      c.start_line,
      c.end_line,
      s.name AS symbol_name,
      f.language,
      c.token_count
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    LEFT JOIN symbols s ON s.id = c.symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND f.path = ${filePath}
    ORDER BY c.start_line ASC
  `);

  for (const row of fileChunks.rows) {
    result.push({
      filePath,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      symbolName: row.symbol_name,
      language: row.language,
      score: 1.0, // file-scoped chunks get maximum relevance
    });
  }

  // Find files that import symbols from this file (via symbol_relations)
  const importerRows = await db.execute<{
    importer_path: string;
    importer_chunk_content: string;
    start_line: number;
    end_line: number;
    symbol_name: string | null;
    language: string | null;
  }>(sql`
    SELECT DISTINCT ON (f_imp.path)
      f_imp.path AS importer_path,
      c.content AS importer_chunk_content,
      c.start_line,
      c.end_line,
      s_imp.name AS symbol_name,
      f_imp.language
    FROM symbol_relations sr
    JOIN symbols s_src ON s_src.id = sr.to_symbol_id
    JOIN files f_src ON f_src.id = s_src.file_id
    JOIN symbols s_imp ON s_imp.id = sr.from_symbol_id
    JOIN files f_imp ON f_imp.id = s_imp.file_id
    LEFT JOIN chunks c ON c.symbol_id = s_imp.id
    WHERE f_src.repo_connection_id = ${repoConnectionId}
      AND f_src.path = ${filePath}
      AND sr.relation_type IN ('imports', 'calls', 'uses')
      AND f_imp.path != ${filePath}
    LIMIT 10
  `);

  for (const row of importerRows.rows) {
    if (row.importer_chunk_content) {
      result.push({
        filePath: row.importer_path,
        startLine: row.start_line,
        endLine: row.end_line,
        content: row.importer_chunk_content,
        symbolName: row.symbol_name,
        language: row.language,
        score: 0.7, // importers are relevant but not primary
      });
    }
  }

  return result;
}

/**
 * Assemble the final context window from ranked chunks and optional extras.
 *
 * @param rankedChunks     Top-K chunks from the ranker
 * @param repoConnectionId  UUID of the repo (for fetching summary)
 * @param options          Context assembly options
 * @returns Assembled context ready for LLM prompt construction
 */
export async function assembleContext(
  rankedChunks: RankedChunk[],
  repoConnectionId: string,
  options: {
    includeRepoSummary?: boolean;
    filePath?: string;
    maxContextTokens?: number;
  } = {},
): Promise<ContextWindow> {
  const maxTokens = options.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  let tokenBudget = maxTokens;
  let repoSummary: string | null = null;

  // 1. Repo summary preamble
  if (options.includeRepoSummary !== false) {
    repoSummary = await getRepoSummary(repoConnectionId);
    if (repoSummary) {
      const summaryTokens = estimateTokens(repoSummary);
      tokenBudget -= summaryTokens;
    }
  }

  // 2. File-scoped context (prepended before ranked results)
  const fileScopedChunks: ContextChunk[] = [];
  if (options.filePath) {
    const scopedCtx = await getFileScopedContext(repoConnectionId, options.filePath);
    for (const chunk of scopedCtx) {
      const tokens = estimateTokens(chunk.content);
      if (tokenBudget - tokens < 0) break;
      tokenBudget -= tokens;
      fileScopedChunks.push(chunk);
    }
  }

  // 3. Ranked chunks (fill remaining budget)
  const contextChunks: ContextChunk[] = [...fileScopedChunks];
  const seenChunkKeys = new Set(
    fileScopedChunks.map((c) => `${c.filePath}:${c.startLine}-${c.endLine}`),
  );

  for (const chunk of rankedChunks) {
    const key = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
    if (seenChunkKeys.has(key)) continue;

    const tokens = chunk.tokenCount || estimateTokens(chunk.content);
    if (tokenBudget - tokens < 0) break;

    tokenBudget -= tokens;
    seenChunkKeys.add(key);
    contextChunks.push({
      filePath: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      symbolName: chunk.symbolName,
      language: chunk.language,
      score: chunk.score,
    });
  }

  const totalTokens = maxTokens - tokenBudget;

  return {
    repoSummary,
    contextChunks,
    totalTokens,
  };
}

/**
 * Format the assembled context window into a string ready for LLM prompt
 * insertion. This is the text that goes between the system prompt and the
 * user question.
 */
export function formatContextForPrompt(context: ContextWindow): string {
  const parts: string[] = [];

  if (context.repoSummary) {
    parts.push("## Repository Overview");
    parts.push(context.repoSummary);
    parts.push("");
  }

  parts.push("## Relevant Code (ordered by relevance)");
  parts.push("");

  for (const chunk of context.contextChunks) {
    const lang = chunk.language ?? "";
    const symbolLabel = chunk.symbolName ? ` — ${chunk.symbolName}` : "";
    parts.push(`### File: ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})${symbolLabel}`);
    parts.push("```" + lang);
    parts.push(chunk.content);
    parts.push("```");
    parts.push("");
  }

  return parts.join("\n");
}
