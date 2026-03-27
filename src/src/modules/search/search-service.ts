/**
 * Search service — orchestrates intent-aware code search using the existing
 * retrieval pipeline (semantic + lexical + structural).
 *
 * This module NEVER calls an LLM. All intelligence is heuristic-based via the
 * classifier, and retrieval delegates to the established pipeline.
 */

import { sql } from "drizzle-orm";
import { db } from "@/src/lib/db";
import { retrieve, extractSymbolCandidates } from "@/src/modules/retrieval";
import type { RankedChunk } from "@/src/types/retrieval";
import {
  classifyQuery,
  type QueryIntent,
} from "./classifier";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SearchResult {
  fileId: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  content: string;
  symbolName: string | null;
  symbolKind: string | null;
  relevanceScore: number;
  matchReason: "semantic match" | "symbol definition" | "symbol usage" | "keyword match" | "structural match";
}

export interface SearchResponse {
  query: string;
  intent: QueryIntent;
  results: SearchResult[];
  totalResults: number;
  durationMs: number;
  suggestions?: string[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  fileFilter?: string;
  languageFilter?: string;
}

// ---------------------------------------------------------------------------
// Definition kinds — used to filter structural results for find_definition
// ---------------------------------------------------------------------------

const DEFINITION_KINDS = new Set([
  "function", "method", "class", "interface", "type", "enum", "struct",
  "variable", "const", "let", "var", "export", "declaration",
]);

// ---------------------------------------------------------------------------
// Direct DB queries for definition and usage lookup
// ---------------------------------------------------------------------------

interface SymbolRow extends Record<string, unknown> {
  chunk_id: string;
  file_id: string;
  file_path: string;
  content: string;
  start_line: number;
  end_line: number;
  symbol_id: string;
  symbol_name: string;
  symbol_kind: string;
  language: string | null;
  token_count: number;
}

/**
 * Find symbol definitions by exact/fuzzy name match.
 * Filtered to definition-like kinds (class, function, type, etc.)
 */
async function findDefinitions(
  symbolCandidates: string[],
  repoConnectionId: string,
  limit: number,
): Promise<SearchResult[]> {
  if (symbolCandidates.length === 0) return [];

  const kindList = Array.from(DEFINITION_KINDS);

  // Build OR clauses for each candidate
  const nameClauses = symbolCandidates.map((c) => sql`LOWER(s.name) = LOWER(${c})`);
  const nameCondition = sql.join(nameClauses, sql` OR `);

  const kindClauses = kindList.map((k) => sql`LOWER(s.kind) ILIKE ${k}`);
  const kindCondition = sql.join(kindClauses, sql` OR `);

  const rows = await db.execute<SymbolRow>(sql`
    SELECT
      c.id          AS chunk_id,
      c.file_id     AS file_id,
      f.path        AS file_path,
      c.content     AS content,
      c.start_line  AS start_line,
      c.end_line    AS end_line,
      s.id          AS symbol_id,
      s.name        AS symbol_name,
      s.kind        AS symbol_kind,
      f.language    AS language,
      c.token_count AS token_count
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    LEFT JOIN chunks c ON c.symbol_id = s.id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND (${nameCondition})
      AND (${kindCondition})
    ORDER BY
      CASE WHEN LOWER(s.kind) IN ('class', 'function', 'interface', 'type', 'enum') THEN 0 ELSE 1 END ASC,
      s.name ASC
    LIMIT ${limit}
  `);

  return rows.rows
    .filter((r) => r.chunk_id != null)
    .map((r) => ({
      fileId: r.file_id,
      filePath: r.file_path,
      language: r.language,
      startLine: Number(r.start_line),
      endLine: Number(r.end_line),
      content: r.content,
      symbolName: r.symbol_name,
      symbolKind: r.symbol_kind,
      relevanceScore: 1.0,
      matchReason: "symbol definition" as const,
    }));
}

/**
 * Find usages: locate all chunks where the target symbol is called/used/imported.
 * Traverses symbol_relations to find symbols that reference the targets.
 */
async function findUsages(
  symbolCandidates: string[],
  repoConnectionId: string,
  limit: number,
): Promise<SearchResult[]> {
  if (symbolCandidates.length === 0) return [];

  // First find the target symbols by name
  const nameClauses = symbolCandidates.map((c) => sql`LOWER(s.name) = LOWER(${c})`);
  const nameCondition = sql.join(nameClauses, sql` OR `);

  const targetRows = await db.execute<{ symbol_id: string }>(sql`
    SELECT s.id AS symbol_id
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND (${nameCondition})
    LIMIT 20
  `);

  if (targetRows.rows.length === 0) return [];

  const targetIds = targetRows.rows.map((r) => r.symbol_id);

  // Find all symbols that have a relation pointing TO these targets
  const usageRows = await db.execute<SymbolRow>(sql`
    SELECT DISTINCT
      c.id          AS chunk_id,
      c.file_id     AS file_id,
      f.path        AS file_path,
      c.content     AS content,
      c.start_line  AS start_line,
      c.end_line    AS end_line,
      sr_from.id    AS symbol_id,
      sr_from.name  AS symbol_name,
      sr_from.kind  AS symbol_kind,
      f.language    AS language,
      c.token_count AS token_count
    FROM symbol_relations sr
    JOIN symbols sr_from ON sr_from.id = sr.from_symbol_id
    JOIN files f ON f.id = sr_from.file_id
    LEFT JOIN chunks c ON c.symbol_id = sr_from.id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND sr.to_symbol_id = ANY(${targetIds}::uuid[])
      AND sr.relation_type IN ('calls', 'uses', 'imports', 'extends', 'implements', 'references')
    ORDER BY f.path ASC, c.start_line ASC
    LIMIT ${limit}
  `);

  return usageRows.rows
    .filter((r) => r.chunk_id != null)
    .map((r) => ({
      fileId: r.file_id,
      filePath: r.file_path,
      language: r.language,
      startLine: Number(r.start_line),
      endLine: Number(r.end_line),
      content: r.content,
      symbolName: r.symbol_name,
      symbolKind: r.symbol_kind,
      relevanceScore: 0.9,
      matchReason: "symbol usage" as const,
    }));
}

// ---------------------------------------------------------------------------
// Convert RankedChunk to SearchResult
// ---------------------------------------------------------------------------

function chunkToResult(
  chunk: RankedChunk,
  matchReason: SearchResult["matchReason"],
): SearchResult {
  return {
    fileId: chunk.fileId,
    filePath: chunk.filePath,
    language: chunk.language,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
    symbolName: chunk.symbolName,
    symbolKind: chunk.symbolKind,
    relevanceScore: chunk.score,
    matchReason,
  };
}

function inferMatchReason(chunk: RankedChunk): SearchResult["matchReason"] {
  if (chunk.vectorScore > chunk.keywordScore) return "semantic match";
  if (chunk.keywordScore > 0) return "keyword match";
  return "structural match";
}

// ---------------------------------------------------------------------------
// File/language filtering
// ---------------------------------------------------------------------------

function applyFilters(
  results: SearchResult[],
  fileFilter?: string,
  languageFilter?: string,
): SearchResult[] {
  return results.filter((r) => {
    if (languageFilter && r.language) {
      const lang = r.language.toLowerCase();
      const filter = languageFilter.toLowerCase();
      if (!lang.includes(filter) && !filter.includes(lang)) return false;
    }
    if (fileFilter) {
      const pattern = fileFilter.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\./g, "\\.");
      try {
        if (!new RegExp(pattern).test(r.filePath)) return false;
      } catch {
        // Invalid regex from glob conversion — skip filter
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Deduplication by (filePath + startLine)
// ---------------------------------------------------------------------------

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.filePath}:${r.startLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

function generateSuggestions(intent: QueryIntent, symbolCandidates: string[]): string[] {
  const suggestions: string[] = [];

  switch (intent) {
    case "find_missing":
      suggestions.push("Try: 'find all error handlers'");
      if (symbolCandidates.length > 0) {
        suggestions.push(`Try: 'where is ${symbolCandidates[0]} defined'`);
      }
      break;
    case "find_definition":
      if (symbolCandidates.length > 0) {
        suggestions.push(`Try: 'where is ${symbolCandidates[0]} used'`);
        suggestions.push(`Try: 'find all functions similar to ${symbolCandidates[0]}'`);
      }
      break;
    case "find_usage":
      if (symbolCandidates.length > 0) {
        suggestions.push(`Try: 'where is ${symbolCandidates[0]} defined'`);
      }
      break;
    case "general":
      suggestions.push("Try using specific function or class names");
      suggestions.push("Try: 'find all API handlers'");
      break;
  }

  return suggestions.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

/**
 * Execute a natural language search over the indexed repo.
 *
 * Routes to the appropriate retrieval strategy based on classified intent:
 * - find_definition  → direct symbol lookup, definition kinds
 * - find_usage       → symbol_relations traversal (callers/importers)
 * - find_missing     → full retrieval, then flag files NOT in top results
 * - find_code        → full retrieve() pipeline
 * - find_pattern     → full retrieve() pipeline with pattern boost
 * - find_similar     → full retrieve() pipeline
 * - general          → full retrieve() pipeline
 */
export async function search(
  query: string,
  repoConnectionId: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const startTime = Date.now();
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;

  const classified = classifyQuery(query);

  // Merge explicit options into classified filters (explicit wins)
  const fileFilter = options.fileFilter ?? classified.fileFilter;
  const languageFilter = options.languageFilter ?? classified.languageFilter;

  let results: SearchResult[] = [];

  // ------------------------------------------------------------------
  // Route by intent
  // ------------------------------------------------------------------

  if (classified.intent === "find_definition") {
    // 1. Direct DB symbol lookup (fast, precise)
    const symbolCandidates =
      classified.symbolCandidates.length > 0
        ? classified.symbolCandidates
        : extractSymbolCandidates(query);

    results = await findDefinitions(symbolCandidates, repoConnectionId, limit * 2);

    // 2. Supplement with retrieval pipeline if direct lookup gave few results
    if (results.length < 5) {
      const retrieved = await retrieve(classified.normalizedQuery, repoConnectionId, {
        maxResults: limit,
        fileFilter,
      });
      const extra = retrieved.chunks
        .filter((c) => c.symbolKind && DEFINITION_KINDS.has(c.symbolKind.toLowerCase()))
        .map((c) => chunkToResult(c, "symbol definition"));
      results = [...results, ...extra];
    }

  } else if (classified.intent === "find_usage") {
    // 1. Symbol relation traversal
    const symbolCandidates =
      classified.symbolCandidates.length > 0
        ? classified.symbolCandidates
        : extractSymbolCandidates(query);

    results = await findUsages(symbolCandidates, repoConnectionId, limit * 2);

    // 2. Supplement with retrieval if not enough
    if (results.length < 5) {
      const retrieved = await retrieve(classified.normalizedQuery, repoConnectionId, {
        maxResults: limit,
        fileFilter,
      });
      const extra = retrieved.chunks.map((c) => chunkToResult(c, inferMatchReason(c)));
      results = [...results, ...extra];
    }

  } else if (classified.intent === "find_missing") {
    // Full retrieval, then invert: find files whose content does NOT contain
    // the positive capability. We return results framed as "these lack X".
    const retrieved = await retrieve(classified.normalizedQuery, repoConnectionId, {
      maxResults: limit * 2,
      fileFilter,
    });

    // For "find_missing" we keep results that scored lowest — they're the
    // most likely to be "missing" the capability.
    const allChunks = [...retrieved.chunks].sort((a, b) => a.score - b.score);
    results = allChunks.slice(0, limit).map((c) => chunkToResult(c, inferMatchReason(c)));

  } else {
    // find_code, find_pattern, find_similar, general — use full retrieval pipeline
    const retrieved = await retrieve(classified.normalizedQuery, repoConnectionId, {
      maxResults: limit + offset,
      fileFilter,
    });

    results = retrieved.chunks.map((c) => chunkToResult(c, inferMatchReason(c)));
  }

  // ------------------------------------------------------------------
  // Post-processing: filter, deduplicate, paginate
  // ------------------------------------------------------------------

  results = applyFilters(results, fileFilter, languageFilter);
  results = deduplicateResults(results);

  const totalResults = results.length;

  // Paginate
  const paginated = results.slice(offset, offset + limit);

  const durationMs = Date.now() - startTime;

  const suggestions =
    paginated.length === 0
      ? generateSuggestions(classified.intent, classified.symbolCandidates)
      : undefined;

  return {
    query,
    intent: classified.intent,
    results: paginated,
    totalResults,
    durationMs,
    suggestions,
  };
}
