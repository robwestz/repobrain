/**
 * Health dashboard DB queries.
 * All queries use existing tables (files, symbols, symbolRelations, chunks).
 * Results are cached in Redis for 5 minutes.
 */

import { sql } from "drizzle-orm";
import { db } from "@/src/lib/db";
import { getRedis } from "@/src/lib/redis";

const CACHE_TTL = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Row types returned by aggregation queries
// ---------------------------------------------------------------------------

export interface FileMetricsRow {
  fileId: string;
  filePath: string;
  language: string | null;
  sizeBytes: number;
  lineCount: number;
}

export interface SymbolCountRow {
  fileId: string;
  symbolCount: number;
  functionCount: number;
  totalComplexity: number;
}

export interface CouplingRow {
  fileId: string;
  afferent: number;
  efferent: number;
}

export interface ChunkStatsRow {
  fileId: string;
  chunkCount: number;
  avgTokens: number;
  commentChunks: number;
}

// ---------------------------------------------------------------------------
// Query: basic file metrics
// ---------------------------------------------------------------------------

export async function getFileMetrics(repoConnectionId: string): Promise<FileMetricsRow[]> {
  const cacheKey = `health:files:${repoConnectionId}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as FileMetricsRow[];
  }

  const rows = await db.execute<{
    file_id: string;
    file_path: string;
    language: string | null;
    size_bytes: number;
    line_count: number;
  }>(sql`
    SELECT
      id AS file_id,
      path AS file_path,
      language,
      size_bytes,
      line_count
    FROM files
    WHERE repo_connection_id = ${repoConnectionId}
    ORDER BY line_count DESC
  `);

  const result: FileMetricsRow[] = rows.rows.map((r) => ({
    fileId: r.file_id,
    filePath: r.file_path,
    language: r.language,
    sizeBytes: r.size_bytes,
    lineCount: r.line_count,
  }));

  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  return result;
}

// ---------------------------------------------------------------------------
// Query: symbol counts and complexity estimates per file
// ---------------------------------------------------------------------------

export async function getSymbolCounts(repoConnectionId: string): Promise<Map<string, SymbolCountRow>> {
  const cacheKey = `health:symbols:${repoConnectionId}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) {
    const arr = JSON.parse(cached) as SymbolCountRow[];
    return new Map(arr.map((r) => [r.fileId, r]));
  }

  const rows = await db.execute<{
    file_id: string;
    symbol_count: string;
    function_count: string;
    total_complexity: string;
  }>(sql`
    SELECT
      s.file_id,
      COUNT(*) AS symbol_count,
      COUNT(*) FILTER (WHERE s.kind IN ('function', 'method')) AS function_count,
      COALESCE(
        SUM(
          CASE
            WHEN s.kind IN ('function', 'method')
            THEN GREATEST((s.end_line - s.start_line)::float / 10.0, 1.0)
            ELSE 0
          END
        ),
        0
      ) AS total_complexity
    FROM symbols s
    INNER JOIN files f ON f.id = s.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY s.file_id
  `);

  const result: SymbolCountRow[] = rows.rows.map((r) => ({
    fileId: r.file_id,
    symbolCount: parseInt(r.symbol_count, 10),
    functionCount: parseInt(r.function_count, 10),
    totalComplexity: parseFloat(r.total_complexity),
  }));

  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  return new Map(result.map((r) => [r.fileId, r]));
}

// ---------------------------------------------------------------------------
// Query: coupling (afferent/efferent) per file
// ---------------------------------------------------------------------------

export async function getCouplingData(repoConnectionId: string): Promise<Map<string, CouplingRow>> {
  const cacheKey = `health:coupling:${repoConnectionId}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) {
    const arr = JSON.parse(cached) as CouplingRow[];
    return new Map(arr.map((r) => [r.fileId, r]));
  }

  // Afferent: count distinct from_symbol_ids whose to_symbol lives in this file
  const afferentRows = await db.execute<{ file_id: string; afferent: string }>(sql`
    SELECT
      f.id AS file_id,
      COUNT(DISTINCT sr.from_symbol_id) AS afferent
    FROM files f
    INNER JOIN symbols s_to ON s_to.file_id = f.id
    INNER JOIN symbol_relations sr ON sr.to_symbol_id = s_to.id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY f.id
  `);

  // Efferent: count distinct to_symbol_ids whose from_symbol lives in this file
  const efferentRows = await db.execute<{ file_id: string; efferent: string }>(sql`
    SELECT
      f.id AS file_id,
      COUNT(DISTINCT sr.to_symbol_id) AS efferent
    FROM files f
    INNER JOIN symbols s_from ON s_from.file_id = f.id
    INNER JOIN symbol_relations sr ON sr.from_symbol_id = s_from.id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY f.id
  `);

  const afferentMap = new Map<string, number>(
    afferentRows.rows.map((r) => [r.file_id, parseInt(r.afferent, 10)])
  );
  const efferentMap = new Map<string, number>(
    efferentRows.rows.map((r) => [r.file_id, parseInt(r.efferent, 10)])
  );

  // Collect all file IDs that appear in either map
  const allFileIds = new Set([...afferentMap.keys(), ...efferentMap.keys()]);
  const result: CouplingRow[] = Array.from(allFileIds).map((fileId) => ({
    fileId,
    afferent: afferentMap.get(fileId) ?? 0,
    efferent: efferentMap.get(fileId) ?? 0,
  }));

  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  return new Map(result.map((r) => [r.fileId, r]));
}

// ---------------------------------------------------------------------------
// Query: chunk stats per file (density + documentation ratio)
// ---------------------------------------------------------------------------

export async function getChunkStats(repoConnectionId: string): Promise<Map<string, ChunkStatsRow>> {
  const cacheKey = `health:chunks:${repoConnectionId}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) {
    const arr = JSON.parse(cached) as ChunkStatsRow[];
    return new Map(arr.map((r) => [r.fileId, r]));
  }

  const rows = await db.execute<{
    file_id: string;
    chunk_count: string;
    avg_tokens: string;
    comment_chunks: string;
  }>(sql`
    SELECT
      c.file_id,
      COUNT(*) AS chunk_count,
      AVG(c.token_count)::float AS avg_tokens,
      COUNT(*) FILTER (
        WHERE c.content LIKE '//%'
          OR c.content LIKE '/*%'
          OR c.content LIKE '#%'
          OR c.content LIKE '"""%'
          OR c.content LIKE "''%"
      ) AS comment_chunks
    FROM chunks c
    INNER JOIN files f ON f.id = c.file_id
    WHERE f.repo_connection_id = ${repoConnectionId}
    GROUP BY c.file_id
  `);

  const result: ChunkStatsRow[] = rows.rows.map((r) => ({
    fileId: r.file_id,
    chunkCount: parseInt(r.chunk_count, 10),
    avgTokens: parseFloat(r.avg_tokens),
    commentChunks: parseInt(r.comment_chunks, 10),
  }));

  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  return new Map(result.map((r) => [r.fileId, r]));
}

// ---------------------------------------------------------------------------
// Query: overall repo statistics
// ---------------------------------------------------------------------------

export interface RepoStatsRow {
  totalFiles: number;
  totalSymbols: number;
  totalRelations: number;
  languageBreakdown: { language: string; fileCount: number; lineCount: number }[];
}

export async function getRepoStats(repoConnectionId: string): Promise<RepoStatsRow> {
  const cacheKey = `health:repo-stats:${repoConnectionId}`;
  const redis = getRedis();

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as RepoStatsRow;
  }

  const [countRow] = (await db.execute<{ file_count: string; symbol_count: string; relation_count: string }>(sql`
    SELECT
      (SELECT COUNT(*) FROM files WHERE repo_connection_id = ${repoConnectionId})::int AS file_count,
      (
        SELECT COUNT(*) FROM symbols s
        INNER JOIN files f ON f.id = s.file_id
        WHERE f.repo_connection_id = ${repoConnectionId}
      )::int AS symbol_count,
      (
        SELECT COUNT(*) FROM symbol_relations sr
        INNER JOIN symbols s ON s.id = sr.from_symbol_id
        INNER JOIN files f ON f.id = s.file_id
        WHERE f.repo_connection_id = ${repoConnectionId}
      )::int AS relation_count
  `)).rows;

  const languageRows = await db.execute<{
    language: string | null;
    file_count: string;
    line_count: string;
  }>(sql`
    SELECT
      COALESCE(language, 'unknown') AS language,
      COUNT(*)::int AS file_count,
      SUM(line_count)::int AS line_count
    FROM files
    WHERE repo_connection_id = ${repoConnectionId}
    GROUP BY language
    ORDER BY file_count DESC
  `);

  const result: RepoStatsRow = {
    totalFiles: parseInt(countRow?.file_count ?? "0", 10),
    totalSymbols: parseInt(countRow?.symbol_count ?? "0", 10),
    totalRelations: parseInt(countRow?.relation_count ?? "0", 10),
    languageBreakdown: languageRows.rows.map((r) => ({
      language: r.language ?? "unknown",
      fileCount: parseInt(r.file_count, 10),
      lineCount: parseInt(r.line_count, 10),
    })),
  };

  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  return result;
}

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

export async function invalidateHealthCache(repoConnectionId: string): Promise<void> {
  const redis = getRedis();
  const keys = [
    `health:files:${repoConnectionId}`,
    `health:symbols:${repoConnectionId}`,
    `health:coupling:${repoConnectionId}`,
    `health:chunks:${repoConnectionId}`,
    `health:repo-stats:${repoConnectionId}`,
    `health:full:${repoConnectionId}`,
  ];
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
