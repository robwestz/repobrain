/**
 * DB queries for architecture diagram data.
 * All raw SQL lives here; diagram-generator.ts calls these functions.
 */

import { db } from "@/src/lib/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleDep {
  fromModule: string;
  toModule: string;
  depCount: number;
  fromFileCount: number;
  toFileCount: number;
}

export interface ClassNode {
  symbolId: string;
  symbolName: string;
  kind: string;
  filePath: string;
  fileId: string;
  parentSymbolId: string | null;
  relationType: string | null;
  relatedSymbolId: string | null;
  relatedSymbolName: string | null;
  relatedSymbolKind: string | null;
}

export interface CallChain {
  fromSymbolId: string;
  fromSymbolName: string;
  fromSymbolKind: string;
  fromFilePath: string;
  toSymbolId: string;
  toSymbolName: string;
  toSymbolKind: string;
  toFilePath: string;
  relationType: string;
}

export interface FileModuleRow {
  fileId: string;
  filePath: string;
  modulePath: string;
}

export interface ApiRouteRow {
  fileId: string;
  filePath: string;
}

export interface SymbolRow {
  symbolId: string;
  symbolName: string;
  kind: string;
  fileId: string;
  filePath: string;
  startLine: number;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get all files grouped by their top-level module segment.
 * For a path like "src/modules/chat/service.ts" the module is "src/modules/chat".
 * We use the first 3 path segments (or fewer) to identify the module.
 */
export async function getFilesWithModules(repoConnectionId: string): Promise<FileModuleRow[]> {
  const rows = await db.execute<{ file_id: string; file_path: string }>(sql`
    SELECT
      f.id   AS file_id,
      f.path AS file_path
    FROM files f
    WHERE f.repo_connection_id = ${repoConnectionId}
    ORDER BY f.path
  `);

  return rows.rows.map((r) => {
    const parts = r.file_path.split("/");
    // Use up to 3 segments as module identifier (e.g. "src/modules/chat")
    const modulePath = parts.slice(0, Math.min(3, parts.length - 1)).join("/") || parts[0] || r.file_path;
    return {
      fileId: r.file_id,
      filePath: r.file_path,
      modulePath,
    };
  });
}

/**
 * Count symbol_relations crossing module boundaries.
 * Returns pairs (fromModule, toModule, count).
 */
export async function getModuleDependencies(repoConnectionId: string): Promise<ModuleDep[]> {
  const files = await getFilesWithModules(repoConnectionId);

  if (files.length === 0) return [];

  // Build a map: fileId -> modulePath
  const fileModuleMap = new Map<string, string>(files.map((f) => [f.fileId, f.modulePath]));

  // Count files per module
  const moduleFileCounts = new Map<string, number>();
  for (const f of files) {
    moduleFileCounts.set(f.modulePath, (moduleFileCounts.get(f.modulePath) ?? 0) + 1);
  }

  // Get all symbol relations for this repo
  const relations = await db.execute<{
    from_file_id: string;
    to_file_id: string;
    relation_type: string;
  }>(sql`
    SELECT
      sf.file_id AS from_file_id,
      st.file_id AS to_file_id,
      sr.relation_type
    FROM symbol_relations sr
    JOIN symbols sf ON sf.id = sr.from_symbol_id
    JOIN symbols st ON st.id = sr.to_symbol_id
    WHERE sf.file_id IN (
      SELECT id FROM files WHERE repo_connection_id = ${repoConnectionId}
    )
    AND st.file_id IN (
      SELECT id FROM files WHERE repo_connection_id = ${repoConnectionId}
    )
  `);

  // Aggregate by (fromModule, toModule) excluding self-links
  const depCounts = new Map<string, number>();
  for (const rel of relations.rows) {
    const fromModule = fileModuleMap.get(rel.from_file_id);
    const toModule = fileModuleMap.get(rel.to_file_id);
    if (!fromModule || !toModule || fromModule === toModule) continue;
    const key = `${fromModule}|||${toModule}`;
    depCounts.set(key, (depCounts.get(key) ?? 0) + 1);
  }

  const result: ModuleDep[] = [];
  for (const [key, count] of depCounts.entries()) {
    const [fromModule, toModule] = key.split("|||");
    result.push({
      fromModule,
      toModule,
      depCount: count,
      fromFileCount: moduleFileCounts.get(fromModule) ?? 0,
      toFileCount: moduleFileCounts.get(toModule) ?? 0,
    });
  }

  // Sort by dep count descending
  return result.sort((a, b) => b.depCount - a.depCount);
}

/**
 * Get all class/interface symbols and their extends/implements relationships.
 */
export async function getClassHierarchy(repoConnectionId: string): Promise<ClassNode[]> {
  const rows = await db.execute<{
    symbol_id: string;
    symbol_name: string;
    kind: string;
    file_path: string;
    file_id: string;
    parent_symbol_id: string | null;
    relation_type: string | null;
    related_symbol_id: string | null;
    related_symbol_name: string | null;
    related_symbol_kind: string | null;
  }>(sql`
    SELECT
      s.id        AS symbol_id,
      s.name      AS symbol_name,
      s.kind,
      f.path      AS file_path,
      f.id        AS file_id,
      s.parent_symbol_id,
      sr.relation_type,
      sr.to_symbol_id   AS related_symbol_id,
      st.name           AS related_symbol_name,
      st.kind           AS related_symbol_kind
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    LEFT JOIN symbol_relations sr
      ON sr.from_symbol_id = s.id
      AND sr.relation_type IN ('extends', 'implements')
    LEFT JOIN symbols st ON st.id = sr.to_symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND s.kind IN ('class', 'interface', 'type')
    ORDER BY s.name
  `);

  return rows.rows.map((r) => ({
    symbolId: r.symbol_id,
    symbolName: r.symbol_name,
    kind: r.kind,
    filePath: r.file_path,
    fileId: r.file_id,
    parentSymbolId: r.parent_symbol_id,
    relationType: r.relation_type,
    relatedSymbolId: r.related_symbol_id,
    relatedSymbolName: r.related_symbol_name,
    relatedSymbolKind: r.related_symbol_kind,
  }));
}

/**
 * Get call chains starting from a specific symbol.
 * BFS up to maxDepth hops. Returns all (from, to) edges reachable.
 */
export async function getCallChains(
  repoConnectionId: string,
  entrySymbolId: string,
  maxDepth: number = 3,
): Promise<CallChain[]> {
  // We do iterative BFS using direct SQL per level for simplicity.
  const visited = new Set<string>([entrySymbolId]);
  const allEdges: CallChain[] = [];
  let frontier = [entrySymbolId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const rows = await db.execute<{
      from_symbol_id: string;
      from_symbol_name: string;
      from_symbol_kind: string;
      from_file_path: string;
      to_symbol_id: string;
      to_symbol_name: string;
      to_symbol_kind: string;
      to_file_path: string;
      relation_type: string;
    }>(sql`
      SELECT
        sf.id    AS from_symbol_id,
        sf.name  AS from_symbol_name,
        sf.kind  AS from_symbol_kind,
        ff.path  AS from_file_path,
        st.id    AS to_symbol_id,
        st.name  AS to_symbol_name,
        st.kind  AS to_symbol_kind,
        tf.path  AS to_file_path,
        sr.relation_type
      FROM symbol_relations sr
      JOIN symbols sf ON sf.id = sr.from_symbol_id
      JOIN symbols st ON st.id = sr.to_symbol_id
      JOIN files ff ON ff.id = sf.file_id
      JOIN files tf ON tf.id = st.file_id
      WHERE sr.from_symbol_id = ANY(ARRAY[${sql.raw(frontier.map((id) => `'${id}'`).join(","))}]::uuid[])
        AND ff.repo_connection_id = ${repoConnectionId}
        AND sr.relation_type IN ('calls', 'imports', 'extends', 'implements')
    `);

    const nextFrontier: string[] = [];
    for (const r of rows.rows) {
      allEdges.push({
        fromSymbolId: r.from_symbol_id,
        fromSymbolName: r.from_symbol_name,
        fromSymbolKind: r.from_symbol_kind,
        fromFilePath: r.from_file_path,
        toSymbolId: r.to_symbol_id,
        toSymbolName: r.to_symbol_name,
        toSymbolKind: r.to_symbol_kind,
        toFilePath: r.to_file_path,
        relationType: r.relation_type,
      });
      if (!visited.has(r.to_symbol_id)) {
        visited.add(r.to_symbol_id);
        nextFrontier.push(r.to_symbol_id);
      }
    }
    frontier = nextFrontier;
  }

  return allEdges;
}

/**
 * Get all API route files (paths containing "/api/").
 */
export async function getApiRouteFiles(repoConnectionId: string): Promise<ApiRouteRow[]> {
  const rows = await db.execute<{ file_id: string; file_path: string }>(sql`
    SELECT id AS file_id, path AS file_path
    FROM files
    WHERE repo_connection_id = ${repoConnectionId}
      AND path LIKE '%/api/%'
    ORDER BY path
  `);

  return rows.rows.map((r) => ({ fileId: r.file_id, filePath: r.file_path }));
}

/**
 * Get all symbols for a set of files.
 */
export async function getSymbolsForFiles(fileIds: string[]): Promise<SymbolRow[]> {
  if (fileIds.length === 0) return [];

  const rows = await db.execute<{
    symbol_id: string;
    symbol_name: string;
    kind: string;
    file_id: string;
    file_path: string;
    start_line: number;
  }>(sql`
    SELECT
      s.id        AS symbol_id,
      s.name      AS symbol_name,
      s.kind,
      f.id        AS file_id,
      f.path      AS file_path,
      s.start_line
    FROM symbols s
    JOIN files f ON f.id = s.file_id
    WHERE s.file_id = ANY(ARRAY[${sql.raw(fileIds.map((id) => `'${id}'`).join(","))}]::uuid[])
    ORDER BY f.path, s.start_line
  `);

  return rows.rows.map((r) => ({
    symbolId: r.symbol_id,
    symbolName: r.symbol_name,
    kind: r.kind,
    fileId: r.file_id,
    filePath: r.file_path,
    startLine: r.start_line,
  }));
}

/**
 * Get symbol relations for a set of source files, following calls/imports chains.
 */
export async function getRelationsFromFiles(
  repoConnectionId: string,
  fileIds: string[],
): Promise<CallChain[]> {
  if (fileIds.length === 0) return [];

  const rows = await db.execute<{
    from_symbol_id: string;
    from_symbol_name: string;
    from_symbol_kind: string;
    from_file_path: string;
    to_symbol_id: string;
    to_symbol_name: string;
    to_symbol_kind: string;
    to_file_path: string;
    relation_type: string;
  }>(sql`
    SELECT
      sf.id    AS from_symbol_id,
      sf.name  AS from_symbol_name,
      sf.kind  AS from_symbol_kind,
      ff.path  AS from_file_path,
      st.id    AS to_symbol_id,
      st.name  AS to_symbol_name,
      st.kind  AS to_symbol_kind,
      tf.path  AS to_file_path,
      sr.relation_type
    FROM symbol_relations sr
    JOIN symbols sf ON sf.id = sr.from_symbol_id
    JOIN symbols st ON st.id = sr.to_symbol_id
    JOIN files ff ON ff.id = sf.file_id
    JOIN files tf ON tf.id = st.file_id
    WHERE sf.file_id = ANY(ARRAY[${sql.raw(fileIds.map((id) => `'${id}'`).join(","))}]::uuid[])
      AND ff.repo_connection_id = ${repoConnectionId}
      AND sr.relation_type IN ('calls', 'imports')
    LIMIT 200
  `);

  return rows.rows.map((r) => ({
    fromSymbolId: r.from_symbol_id,
    fromSymbolName: r.from_symbol_name,
    fromSymbolKind: r.from_symbol_kind,
    fromFilePath: r.from_file_path,
    toSymbolId: r.to_symbol_id,
    toSymbolName: r.to_symbol_name,
    toSymbolKind: r.to_symbol_kind,
    toFilePath: r.to_file_path,
    relationType: r.relation_type,
  }));
}
