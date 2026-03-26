/**
 * Structural search: extract symbol names mentioned in the query, look them up
 * in the symbol table, then traverse the SymbolRelation graph 1–2 hops to
 * find related chunks.
 *
 * Good for dependency questions: "what depends on X?", "what does Y call?"
 */

import { sql } from "drizzle-orm";
import { db } from "../../lib/db";
import type { VectorSearchResult } from "../../types/retrieval";

/** Minimum symbol name length to avoid matching noise tokens */
const MIN_SYMBOL_LENGTH = 2;

/**
 * Extract plausible symbol names from a natural-language query.
 *
 * Heuristics:
 *  - CamelCase or PascalCase words (UserService, parseConfig)
 *  - snake_case identifiers (user_service, parse_config)
 *  - Quoted identifiers (`foo`, "bar")
 *  - Words that match known symbols are validated downstream
 */
export function extractSymbolCandidates(query: string): string[] {
  const candidates = new Set<string>();

  // Backtick-quoted identifiers
  const backtickRe = /`([^`]+)`/g;
  for (const m of query.matchAll(backtickRe)) {
    candidates.add(m[1].trim());
  }

  // Double-quoted identifiers
  const doubleQuoteRe = /"([A-Za-z_]\w+)"/g;
  for (const m of query.matchAll(doubleQuoteRe)) {
    candidates.add(m[1].trim());
  }

  // CamelCase / PascalCase tokens (at least two capital-letter transitions)
  const camelRe = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
  for (const m of query.matchAll(camelRe)) {
    candidates.add(m[1]);
  }

  // snake_case tokens
  const snakeRe = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
  for (const m of query.matchAll(snakeRe)) {
    candidates.add(m[1]);
  }

  // Single PascalCase word (e.g. "User", "Config") — common class names
  const pascalRe = /\b([A-Z][a-z]{2,})\b/g;
  for (const m of query.matchAll(pascalRe)) {
    candidates.add(m[1]);
  }

  // Lower-case identifiers that look like function/variable names (3+ chars, no spaces)
  const identRe = /\b([a-z][a-zA-Z0-9]{2,})\b/g;
  for (const m of query.matchAll(identRe)) {
    // Only keep if it looks like a code identifier (has mixed case or numbers)
    if (/[A-Z]/.test(m[1]) || /\d/.test(m[1])) {
      candidates.add(m[1]);
    }
  }

  return Array.from(candidates).filter((c) => c.length >= MIN_SYMBOL_LENGTH);
}

/**
 * Run structural search: find symbols matching the query, traverse their
 * relationships 1–2 hops, and return the chunks associated with those symbols.
 *
 * @param query              Natural-language question
 * @param repoConnectionId   UUID of the repo
 * @param maxHops            Maximum relationship traversal depth (default 2)
 * @param maxResults         Maximum chunks to return (default 20)
 * @returns Chunks associated with the matched symbol subgraph
 */
export async function structuralSearch(
  query: string,
  repoConnectionId: string,
  maxHops: number = 2,
  maxResults: number = 20,
): Promise<VectorSearchResult[]> {
  const candidates = extractSymbolCandidates(query);
  if (candidates.length === 0) {
    return [];
  }

  // Step 1: Find matching symbols by name (case-insensitive)
  // Build an OR condition for all candidate names
  const nameClauses = candidates.map((c) => sql`LOWER(s.name) = LOWER(${c})`);
  const nameCondition = sql.join(nameClauses, sql` OR `);

  const seedRows = await db.execute<{
    symbol_id: string;
    symbol_name: string;
    symbol_kind: string;
    file_id: string;
  }>(sql`
    SELECT s.id AS symbol_id, s.name AS symbol_name, s.kind AS symbol_kind, s.file_id
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND (${nameCondition})
    LIMIT 50
  `);

  if (seedRows.rows.length === 0) {
    // Fallback: try ILIKE partial match for the candidates
    const likeClauses = candidates.map((c) => sql`s.name ILIKE ${"%" + c + "%"}`);
    const likeCondition = sql.join(likeClauses, sql` OR `);

    const fallbackRows = await db.execute<{
      symbol_id: string;
      symbol_name: string;
      symbol_kind: string;
      file_id: string;
    }>(sql`
      SELECT s.id AS symbol_id, s.name AS symbol_name, s.kind AS symbol_kind, s.file_id
      FROM symbols s
      JOIN files f ON f.id = s.file_id
      WHERE f.repo_connection_id = ${repoConnectionId}
        AND (${likeCondition})
      LIMIT 30
    `);

    if (fallbackRows.rows.length === 0) {
      return [];
    }
    seedRows.rows.push(...fallbackRows.rows);
  }

  // Collect seed symbol IDs
  const seedSymbolIds = [...new Set(seedRows.rows.map((r) => r.symbol_id))];

  // Step 2: Traverse symbol_relations graph 1-2 hops
  // Hop 1 + Hop 2 via recursive CTE (capped at maxHops)
  const relatedRows = await db.execute<{
    symbol_id: string;
    depth: number;
  }>(sql`
    WITH RECURSIVE symbol_graph AS (
      -- Seed: directly matched symbols at depth 0
      SELECT unnest(${seedSymbolIds}::uuid[]) AS symbol_id, 0 AS depth

      UNION

      -- Hop outward: follow relations in both directions
      SELECT
        CASE
          WHEN sr.from_symbol_id = sg.symbol_id THEN sr.to_symbol_id
          ELSE sr.from_symbol_id
        END AS symbol_id,
        sg.depth + 1 AS depth
      FROM symbol_graph sg
      JOIN symbol_relations sr
        ON sr.from_symbol_id = sg.symbol_id
        OR sr.to_symbol_id = sg.symbol_id
      WHERE sg.depth < ${maxHops}
    )
    SELECT DISTINCT symbol_id, MIN(depth) AS depth
    FROM symbol_graph
    GROUP BY symbol_id
    LIMIT 200
  `);

  const allSymbolIds = relatedRows.rows.map((r) => r.symbol_id);
  if (allSymbolIds.length === 0) {
    return [];
  }

  // Build a depth map for scoring: closer symbols score higher
  const depthMap = new Map<string, number>();
  for (const r of relatedRows.rows) {
    depthMap.set(r.symbol_id, Number(r.depth));
  }

  // Step 3: Fetch chunks associated with these symbols
  const chunkRows = await db.execute<{
    chunk_id: string;
    file_id: string;
    file_path: string;
    content: string;
    start_line: number;
    end_line: number;
    symbol_id: string | null;
    symbol_name: string | null;
    symbol_kind: string | null;
    language: string | null;
    token_count: number;
  }>(sql`
    SELECT
      c.id          AS chunk_id,
      c.file_id     AS file_id,
      f.path        AS file_path,
      c.content     AS content,
      c.start_line  AS start_line,
      c.end_line    AS end_line,
      c.symbol_id   AS symbol_id,
      s.name        AS symbol_name,
      s.kind        AS symbol_kind,
      f.language     AS language,
      c.token_count AS token_count
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    LEFT JOIN symbols s ON s.id = c.symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND c.symbol_id = ANY(${allSymbolIds}::uuid[])
    LIMIT ${maxResults * 3}
  `);

  // Score: seed symbols (depth 0) get 1.0, depth 1 → 0.6, depth 2 → 0.3
  const results: VectorSearchResult[] = chunkRows.rows.map((r) => {
    const depth = r.symbol_id ? (depthMap.get(r.symbol_id) ?? 2) : 2;
    const structuralScore = depth === 0 ? 1.0 : depth === 1 ? 0.6 : 0.3;

    return {
      chunkId: r.chunk_id,
      fileId: r.file_id,
      filePath: r.file_path,
      content: r.content,
      startLine: r.start_line,
      endLine: r.end_line,
      similarity: structuralScore,
      symbolId: r.symbol_id,
      symbolName: r.symbol_name,
      symbolKind: r.symbol_kind,
      language: r.language,
      tokenCount: r.token_count,
    };
  });

  // Sort by structural score descending, take top maxResults
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, maxResults);
}
