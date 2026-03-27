/**
 * Database queries for blast radius analysis.
 * Uses recursive CTE for downstream symbol graph traversal.
 */

import { db } from "@/src/lib/db";
import { symbols, files } from "@/src/lib/db/schema";
import { and, eq, ilike, sql } from "drizzle-orm";

export interface RawImpactRow {
  symbolId: string;
  name: string;
  kind: string;
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
  relationType: string;
  depth: number;
  relationPath: string[];
}

export interface SymbolRow {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
}

/**
 * Recursive CTE: find all symbols that depend on the given symbolId,
 * up to maxDepth hops away.
 */
export async function getDownstreamSymbols(
  symbolId: string,
  maxDepth: number,
): Promise<RawImpactRow[]> {
  // We use db.execute with a raw SQL query for the recursive CTE
  const result = await db.execute(sql`
    WITH RECURSIVE impact AS (
      -- Base case: direct dependents (symbols that reference the target)
      SELECT
        s.id          AS symbol_id,
        s.name        AS name,
        s.kind        AS kind,
        f.path        AS file_path,
        f.id          AS file_id,
        s.start_line  AS start_line,
        s.end_line    AS end_line,
        sr.relation_type AS relation_type,
        1             AS depth,
        ARRAY[sr.relation_type::text] AS relation_path
      FROM symbol_relations sr
      JOIN symbols s ON s.id = sr.from_symbol_id
      JOIN files f ON f.id = s.file_id
      WHERE sr.to_symbol_id = ${symbolId}::uuid

      UNION ALL

      -- Recursive step: who depends on the already-found dependents?
      SELECT
        s2.id         AS symbol_id,
        s2.name       AS name,
        s2.kind       AS kind,
        f2.path       AS file_path,
        f2.id         AS file_id,
        s2.start_line AS start_line,
        s2.end_line   AS end_line,
        sr2.relation_type AS relation_type,
        i.depth + 1   AS depth,
        i.relation_path || sr2.relation_type::text AS relation_path
      FROM impact i
      JOIN symbol_relations sr2 ON sr2.to_symbol_id = i.symbol_id
      JOIN symbols s2 ON s2.id = sr2.from_symbol_id
      JOIN files f2 ON f2.id = s2.file_id
      WHERE i.depth < ${maxDepth}
        AND s2.id <> ALL(SELECT symbol_id FROM impact)
    )
    SELECT DISTINCT ON (symbol_id)
      symbol_id,
      name,
      kind,
      file_path,
      file_id,
      start_line,
      end_line,
      relation_type,
      depth,
      relation_path
    FROM impact
    ORDER BY symbol_id, depth ASC
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    symbolId: row.symbol_id as string,
    name: row.name as string,
    kind: row.kind as string,
    filePath: row.file_path as string,
    fileId: row.file_id as string,
    startLine: Number(row.start_line),
    endLine: Number(row.end_line),
    relationType: row.relation_type as string,
    depth: Number(row.depth),
    relationPath: row.relation_path as string[],
  }));
}

/**
 * Get all symbol IDs for a given file path + repo.
 */
export async function getFileSymbolIds(
  repoConnectionId: string,
  filePath: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: symbols.id })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(and(eq(files.repoConnectionId, repoConnectionId), eq(files.path, filePath)));

  return rows.map((r) => r.id);
}

/**
 * Find a symbol by name in the given repo.
 * Returns the first match (most common case: unique function/class names).
 */
export async function getSymbolByName(
  repoConnectionId: string,
  name: string,
): Promise<SymbolRow | null> {
  const rows = await db
    .select({
      id: symbols.id,
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
      fileId: files.id,
      startLine: symbols.startLine,
      endLine: symbols.endLine,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(and(eq(files.repoConnectionId, repoConnectionId), eq(symbols.name, name)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Find a symbol by ID (with its file path).
 */
export async function getSymbolById(symbolId: string): Promise<SymbolRow | null> {
  const rows = await db
    .select({
      id: symbols.id,
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
      fileId: files.id,
      startLine: symbols.startLine,
      endLine: symbols.endLine,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(eq(symbols.id, symbolId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Search symbols by name prefix (for autocomplete).
 */
export async function searchSymbols(
  repoConnectionId: string,
  query: string,
  limit: number = 10,
): Promise<SymbolRow[]> {
  const rows = await db
    .select({
      id: symbols.id,
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
      fileId: files.id,
      startLine: symbols.startLine,
      endLine: symbols.endLine,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(and(eq(files.repoConnectionId, repoConnectionId), ilike(symbols.name, `%${query}%`)))
    .limit(limit);

  return rows;
}

/**
 * Count how many symbols depend on a given file (afferent coupling).
 * Used for risk score bonus.
 */
export async function getAfferentCouplingCount(fileId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT sr.from_symbol_id) AS cnt
    FROM symbol_relations sr
    JOIN symbols s ON s.id = sr.to_symbol_id
    WHERE s.file_id = ${fileId}::uuid
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? Number(row.cnt) : 0;
}
