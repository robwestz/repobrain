/**
 * Semantic search: embed query → pgvector cosine-distance k-NN.
 *
 * Uses the same OpenAI text-embedding-3-small model as the ingestion embedder
 * so query vectors live in the same space as stored chunk vectors.
 */

import { sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { embedQuery } from "../ingestion/embedder";
import type { VectorSearchResult } from "../../types/retrieval";

/**
 * Run a k-NN semantic search against the pgvector HNSW index.
 *
 * @param query           Natural-language question
 * @param repoConnectionId  UUID of the repo to search within
 * @param k               Number of nearest neighbors to return (default 20)
 * @param similarityThreshold  Minimum cosine similarity to include (default 0.3)
 * @returns Ranked vector search results ordered by descending similarity
 */
export async function semanticSearch(
  query: string,
  repoConnectionId: string,
  k: number = 20,
  similarityThreshold: number = 0.3,
): Promise<VectorSearchResult[]> {
  const queryVector = await embedQuery(query);
  const vectorLiteral = `[${queryVector.join(",")}]`;

  // pgvector <=> operator returns cosine distance (0 = identical, 2 = opposite).
  // Similarity = 1 - distance.  HNSW index accelerates the ordering.
  const rows = await db.execute<{
    chunk_id: string;
    file_id: string;
    file_path: string;
    content: string;
    start_line: number;
    end_line: number;
    similarity: number;
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
      1 - (e.vector <=> ${vectorLiteral}::vector) AS similarity,
      c.symbol_id     AS symbol_id,
      s.name          AS symbol_name,
      s.kind          AS symbol_kind,
      f.language       AS language,
      c.token_count   AS token_count
    FROM embeddings e
    JOIN chunks c ON c.id = e.chunk_id
    JOIN files  f ON f.id = c.file_id
    LEFT JOIN symbols s ON s.id = c.symbol_id
    WHERE f.repo_connection_id = ${repoConnectionId}
      AND 1 - (e.vector <=> ${vectorLiteral}::vector) >= ${similarityThreshold}
    ORDER BY e.vector <=> ${vectorLiteral}::vector ASC
    LIMIT ${k}
  `);

  return rows.rows.map((r) => ({
    chunkId: r.chunk_id,
    fileId: r.file_id,
    filePath: r.file_path,
    content: r.content,
    startLine: r.start_line,
    endLine: r.end_line,
    similarity: Number(r.similarity),
    symbolId: r.symbol_id,
    symbolName: r.symbol_name,
    symbolKind: r.symbol_kind,
    language: r.language,
    tokenCount: r.token_count,
  }));
}
