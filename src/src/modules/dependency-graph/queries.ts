/**
 * Raw SQL queries for dependency graph data.
 * Returns edges between modules, files, and symbols from the symbol_relations table.
 */

import { db } from "@/src/lib/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types returned from raw queries
// ---------------------------------------------------------------------------

export interface RawModuleEdge {
  fromModule: string;
  toModule: string;
  relationType: string;
  edgeCount: number;
}

export interface RawFileEdge {
  fromFileId: string;
  fromFilePath: string;
  fromLanguage: string | null;
  fromLineCount: number;
  toFileId: string;
  toFilePath: string;
  toLanguage: string | null;
  toLineCount: number;
  relationType: string;
  edgeCount: number;
}

export interface RawSymbolEdge {
  fromSymbolId: string;
  fromSymbolName: string;
  fromSymbolKind: string;
  fromFileId: string;
  fromFilePath: string;
  fromStartLine: number;
  fromEndLine: number;
  toSymbolId: string;
  toSymbolName: string;
  toSymbolKind: string;
  toFileId: string;
  toFilePath: string;
  toStartLine: number;
  toEndLine: number;
  relationType: string;
}

export interface NodeMeta {
  id: string;
  label: string;
  filePath?: string;
  language?: string;
  lineCount?: number;
  symbolCount?: number;
}

// ---------------------------------------------------------------------------
// Module graph: aggregate edges crossing top-level directory boundaries
// ---------------------------------------------------------------------------

export async function getModuleGraph(repoConnectionId: string): Promise<RawModuleEdge[]> {
  const result = await db.execute(sql`
    SELECT
      split_part(f_from.path, '/', 1) AS from_module,
      split_part(f_to.path, '/', 1) AS to_module,
      sr.relation_type,
      COUNT(*)::int AS edge_count
    FROM symbol_relations sr
    JOIN symbols s_from ON sr.from_symbol_id = s_from.id
    JOIN symbols s_to   ON sr.to_symbol_id   = s_to.id
    JOIN files f_from   ON s_from.file_id    = f_from.id
    JOIN files f_to     ON s_to.file_id      = f_to.id
    WHERE f_from.repo_connection_id = ${repoConnectionId}
      AND f_to.repo_connection_id   = ${repoConnectionId}
      AND split_part(f_from.path, '/', 1) != split_part(f_to.path, '/', 1)
    GROUP BY from_module, to_module, sr.relation_type
    ORDER BY edge_count DESC
  `);

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    fromModule: r.from_module as string,
    toModule: r.to_module as string,
    relationType: r.relation_type as string,
    edgeCount: r.edge_count as number,
  }));
}

// ---------------------------------------------------------------------------
// File graph: edges between files (deduplicated, aggregated by file pair)
// ---------------------------------------------------------------------------

export async function getFileGraph(
  repoConnectionId: string,
  focusModule?: string,
): Promise<RawFileEdge[]> {
  const moduleFilter = focusModule
    ? sql`AND (f_from.path LIKE ${focusModule + "/%"} OR f_to.path LIKE ${focusModule + "/%"})`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      f_from.id      AS from_file_id,
      f_from.path    AS from_file_path,
      f_from.language AS from_language,
      f_from.line_count AS from_line_count,
      f_to.id        AS to_file_id,
      f_to.path      AS to_file_path,
      f_to.language  AS to_language,
      f_to.line_count AS to_line_count,
      sr.relation_type,
      COUNT(*)::int  AS edge_count
    FROM symbol_relations sr
    JOIN symbols s_from ON sr.from_symbol_id = s_from.id
    JOIN symbols s_to   ON sr.to_symbol_id   = s_to.id
    JOIN files f_from   ON s_from.file_id    = f_from.id
    JOIN files f_to     ON s_to.file_id      = f_to.id
    WHERE f_from.repo_connection_id = ${repoConnectionId}
      AND f_to.repo_connection_id   = ${repoConnectionId}
      AND f_from.id != f_to.id
      ${moduleFilter}
    GROUP BY
      f_from.id, f_from.path, f_from.language, f_from.line_count,
      f_to.id,   f_to.path,   f_to.language,   f_to.line_count,
      sr.relation_type
    ORDER BY edge_count DESC
    LIMIT 2000
  `);

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    fromFileId: r.from_file_id as string,
    fromFilePath: r.from_file_path as string,
    fromLanguage: (r.from_language ?? null) as string | null,
    fromLineCount: r.from_line_count as number,
    toFileId: r.to_file_id as string,
    toFilePath: r.to_file_path as string,
    toLanguage: (r.to_language ?? null) as string | null,
    toLineCount: r.to_line_count as number,
    relationType: r.relation_type as string,
    edgeCount: r.edge_count as number,
  }));
}

// ---------------------------------------------------------------------------
// Symbol graph: direct symbol-level edges
// ---------------------------------------------------------------------------

export async function getSymbolGraph(
  repoConnectionId: string,
  filePath?: string,
): Promise<RawSymbolEdge[]> {
  const pathFilter = filePath
    ? sql`AND (f_from.path = ${filePath} OR f_to.path = ${filePath})`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      s_from.id         AS from_symbol_id,
      s_from.name       AS from_symbol_name,
      s_from.kind       AS from_symbol_kind,
      f_from.id         AS from_file_id,
      f_from.path       AS from_file_path,
      s_from.start_line AS from_start_line,
      s_from.end_line   AS from_end_line,
      s_to.id           AS to_symbol_id,
      s_to.name         AS to_symbol_name,
      s_to.kind         AS to_symbol_kind,
      f_to.id           AS to_file_id,
      f_to.path         AS to_file_path,
      s_to.start_line   AS to_start_line,
      s_to.end_line     AS to_end_line,
      sr.relation_type
    FROM symbol_relations sr
    JOIN symbols s_from ON sr.from_symbol_id = s_from.id
    JOIN symbols s_to   ON sr.to_symbol_id   = s_to.id
    JOIN files f_from   ON s_from.file_id    = f_from.id
    JOIN files f_to     ON s_to.file_id      = f_to.id
    WHERE f_from.repo_connection_id = ${repoConnectionId}
      AND f_to.repo_connection_id   = ${repoConnectionId}
      AND s_from.kind IN ('function', 'class', 'method', 'interface', 'type')
      AND s_to.kind   IN ('function', 'class', 'method', 'interface', 'type')
      ${pathFilter}
    ORDER BY sr.relation_type
    LIMIT 1000
  `);

  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    fromSymbolId: r.from_symbol_id as string,
    fromSymbolName: r.from_symbol_name as string,
    fromSymbolKind: r.from_symbol_kind as string,
    fromFileId: r.from_file_id as string,
    fromFilePath: r.from_file_path as string,
    fromStartLine: r.from_start_line as number,
    fromEndLine: r.from_end_line as number,
    toSymbolId: r.to_symbol_id as string,
    toSymbolName: r.to_symbol_name as string,
    toSymbolKind: r.to_symbol_kind as string,
    toFileId: r.to_file_id as string,
    toFilePath: r.to_file_path as string,
    toStartLine: r.to_start_line as number,
    toEndLine: r.to_end_line as number,
    relationType: r.relation_type as string,
  }));
}

// ---------------------------------------------------------------------------
// Node metadata: file-level symbol counts (for sizing nodes)
// ---------------------------------------------------------------------------

export async function getNodeMetadata(
  repoConnectionId: string,
): Promise<Map<string, NodeMeta>> {
  const result = await db.execute(sql`
    SELECT
      f.id,
      f.path,
      f.language,
      f.line_count,
      COUNT(s.id)::int AS symbol_count
    FROM files f
    LEFT JOIN symbols s ON s.file_id = f.id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY f.id, f.path, f.language, f.line_count
  `);

  const map = new Map<string, NodeMeta>();
  for (const r of result.rows as Array<Record<string, unknown>>) {
    map.set(r.id as string, {
      id: r.id as string,
      label: (r.path as string).split("/").pop() ?? (r.path as string),
      filePath: r.path as string,
      language: (r.language ?? undefined) as string | undefined,
      lineCount: r.line_count as number,
      symbolCount: r.symbol_count as number,
    });
  }
  return map;
}
