/**
 * Database queries for pattern detection.
 * All queries are read-only — no DB tables are created by this module.
 */

import { db } from "@/src/lib/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolRow {
  id: string;
  fileId: string;
  filePath: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  parentSymbolId: string | null;
  signature: string | null;
  language: string | null;
  lineCount: number;
}

export interface ChunkRow {
  id: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface CircularDepRow {
  fromSymbolId: string;
  toSymbolId: string;
  fromFilePath: string;
  toFilePath: string;
  fromSymbolName: string;
  toSymbolName: string;
}

export interface NestingDepthRow {
  symbolId: string;
  fileId: string;
  filePath: string;
  symbolName: string;
  depth: number;
  startLine: number;
  endLine: number;
}

export interface UnreferencedSymbolRow {
  id: string;
  fileId: string;
  filePath: string;
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
}

export interface FileSymbolCountRow {
  fileId: string;
  filePath: string;
  language: string | null;
  lineCount: number;
  methodCount: number;
}

// ---------------------------------------------------------------------------
// Query: all symbols with file info for a repo
// ---------------------------------------------------------------------------

export async function getSymbolsWithFiles(repoConnectionId: string): Promise<SymbolRow[]> {
  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.file_id AS "fileId",
      f.path AS "filePath",
      s.name,
      s.kind,
      s.start_line AS "startLine",
      s.end_line AS "endLine",
      s.parent_symbol_id AS "parentSymbolId",
      s.signature,
      f.language,
      f.line_count AS "lineCount"
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
    ORDER BY f.path, s.start_line
  `);
  return rows.rows as unknown as SymbolRow[];
}

// ---------------------------------------------------------------------------
// Query: symbol+method counts per file (for God class detection)
// ---------------------------------------------------------------------------

export async function getFileSymbolCounts(repoConnectionId: string): Promise<FileSymbolCountRow[]> {
  const rows = await db.execute(sql`
    SELECT
      f.id AS "fileId",
      f.path AS "filePath",
      f.language,
      f.line_count AS "lineCount",
      COUNT(s.id) FILTER (WHERE s.kind IN ('function', 'method', 'arrow_function', 'constructor')) AS "methodCount"
    FROM files f
    LEFT JOIN symbols s ON s.file_id = f.id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY f.id, f.path, f.language, f.line_count
    ORDER BY "methodCount" DESC
  `);
  return rows.rows as unknown as FileSymbolCountRow[];
}

// ---------------------------------------------------------------------------
// Query: circular dependencies via recursive CTE
// ---------------------------------------------------------------------------

export async function getCircularDependencies(repoConnectionId: string): Promise<CircularDepRow[]> {
  // We work at the file level by finding symbols in the same file that form cycles.
  // The recursive CTE follows import chains and detects when we arrive back at the start.
  const rows = await db.execute(sql`
    WITH RECURSIVE dep_chain AS (
      SELECT
        sr.from_symbol_id,
        sr.to_symbol_id,
        ARRAY[sr.from_symbol_id] AS path
      FROM symbol_relations sr
      JOIN symbols s_from ON s_from.id = sr.from_symbol_id
      JOIN files f_from ON f_from.id = s_from.file_id
      WHERE sr.relation_type = 'imports'
        AND f_from.repo_connection_id = ${repoConnectionId}
      UNION ALL
      SELECT
        dc.from_symbol_id,
        sr.to_symbol_id,
        dc.path || sr.from_symbol_id
      FROM dep_chain dc
      JOIN symbol_relations sr ON sr.from_symbol_id = dc.to_symbol_id
      WHERE sr.relation_type = 'imports'
        AND NOT sr.from_symbol_id = ANY(dc.path)
        AND array_length(dc.path, 1) < 5
    )
    SELECT DISTINCT
      dc.from_symbol_id AS "fromSymbolId",
      dc.to_symbol_id AS "toSymbolId",
      f_from.path AS "fromFilePath",
      f_to.path AS "toFilePath",
      s_from.name AS "fromSymbolName",
      s_to.name AS "toSymbolName"
    FROM dep_chain dc
    JOIN symbols s_from ON s_from.id = dc.from_symbol_id
    JOIN symbols s_to ON s_to.id = dc.to_symbol_id
    JOIN files f_from ON f_from.id = s_from.file_id
    JOIN files f_to ON f_to.id = s_to.file_id
    WHERE dc.to_symbol_id = dc.from_symbol_id
    LIMIT 50
  `);
  return rows.rows as unknown as CircularDepRow[];
}

// ---------------------------------------------------------------------------
// Query: symbols with deep nesting (parentSymbolId chain depth > 3)
// ---------------------------------------------------------------------------

export async function getNestingDepths(repoConnectionId: string): Promise<NestingDepthRow[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE symbol_depth AS (
      -- Base case: top-level symbols (no parent)
      SELECT
        s.id AS symbol_id,
        s.file_id,
        s.name AS symbol_name,
        s.start_line,
        s.end_line,
        1 AS depth
      FROM symbols s
      JOIN files f ON f.id = s.file_id
      WHERE s.parent_symbol_id IS NULL
        AND f.repo_connection_id = ${repoConnectionId}
      UNION ALL
      -- Recursive case: child symbols
      SELECT
        s.id,
        s.file_id,
        s.name,
        s.start_line,
        s.end_line,
        sd.depth + 1
      FROM symbols s
      JOIN symbol_depth sd ON sd.symbol_id = s.parent_symbol_id
      WHERE sd.depth < 10
    )
    SELECT
      sd.symbol_id AS "symbolId",
      sd.file_id AS "fileId",
      f.path AS "filePath",
      sd.symbol_name AS "symbolName",
      MAX(sd.depth) AS depth,
      sd.start_line AS "startLine",
      sd.end_line AS "endLine"
    FROM symbol_depth sd
    JOIN files f ON f.id = sd.file_id
    GROUP BY sd.symbol_id, sd.file_id, f.path, sd.symbol_name, sd.start_line, sd.end_line
    HAVING MAX(sd.depth) > 3
    ORDER BY depth DESC
    LIMIT 100
  `);
  return rows.rows as unknown as NestingDepthRow[];
}

// ---------------------------------------------------------------------------
// Query: unreferenced symbols (zero incoming relations, non-entry-point)
// ---------------------------------------------------------------------------

export async function getUnreferencedSymbols(repoConnectionId: string): Promise<UnreferencedSymbolRow[]> {
  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.file_id AS "fileId",
      f.path AS "filePath",
      s.name,
      s.kind,
      s.start_line AS "startLine",
      s.end_line AS "endLine"
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      -- Only check exported symbols (not private helpers)
      AND s.kind IN ('function', 'class', 'method')
      -- Exclude likely entry points: main files, route handlers, index files
      AND f.path NOT LIKE '%/index.%'
      AND f.path NOT LIKE '%/main.%'
      AND f.path NOT LIKE '%route.%'
      AND f.path NOT LIKE '%page.%'
      AND f.path NOT LIKE '%layout.%'
      AND f.path NOT LIKE '%.test.%'
      AND f.path NOT LIKE '%.spec.%'
      -- Symbol has no incoming relations
      AND NOT EXISTS (
        SELECT 1 FROM symbol_relations sr
        WHERE sr.to_symbol_id = s.id
      )
    ORDER BY f.path, s.start_line
    LIMIT 100
  `);
  return rows.rows as unknown as UnreferencedSymbolRow[];
}

// ---------------------------------------------------------------------------
// Query: chunks for content-based detection (EventEmitter, try/catch etc.)
// ---------------------------------------------------------------------------

export interface ChunkContentRow {
  id: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string | null;
}

export async function getChunksForContentAnalysis(repoConnectionId: string): Promise<ChunkContentRow[]> {
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.file_id AS "fileId",
      f.path AS "filePath",
      c.content,
      c.start_line AS "startLine",
      c.end_line AS "endLine",
      f.language
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
    ORDER BY f.path, c.start_line
    LIMIT 2000
  `);
  return rows.rows as unknown as ChunkContentRow[];
}

// ---------------------------------------------------------------------------
// Query: files list for structural analysis
// ---------------------------------------------------------------------------

export interface FileRow {
  id: string;
  path: string;
  language: string | null;
  lineCount: number;
  sizeBytes: number;
}

export async function getFilesForRepo(repoConnectionId: string): Promise<FileRow[]> {
  const rows = await db.execute(sql`
    SELECT
      f.id,
      f.path,
      f.language,
      f.line_count AS "lineCount",
      f.size_bytes AS "sizeBytes"
    FROM files f
    WHERE f.repo_connection_id = ${repoConnectionId}
    ORDER BY f.path
  `);
  return rows.rows as unknown as FileRow[];
}
