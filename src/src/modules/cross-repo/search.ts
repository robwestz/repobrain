/**
 * Cross-repo search — searches across all connected repos in a workspace
 * and returns results grouped by repo with relevance scores.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/src/lib/db";
import { repoConnections } from "@/src/lib/db/schema";
import { crossRepoSearchCache } from "@/src/lib/db/schema-cross-repo";
import { semanticSearch } from "../retrieval/semantic";

export interface CrossRepoSearchResult {
  repoName: string;
  repoConnectionId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  relevanceScore: number;
}

interface SearchOptions {
  limit?: number;
  fileFilter?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Search across all repos in a workspace and return merged results.
 *
 * Results are:
 * 1. Retrieved from each repo in parallel using semantic search
 * 2. Merged and sorted by relevance score
 * 3. Deduplicated by content
 * 4. Cached for 5 minutes per workspace+query
 */
export async function searchAcrossRepos(
  workspaceId: string,
  query: string,
  repoConnectionIds: string[],
  options?: SearchOptions,
): Promise<CrossRepoSearchResult[]> {
  if (repoConnectionIds.length === 0) return [];

  const limit = options?.limit ?? 30;

  // Check cache
  const cached = await getCached(workspaceId, query);
  if (cached) return cached.slice(0, limit);

  // Load repo metadata
  const repos = await db
    .select({ id: repoConnections.id, owner: repoConnections.owner, name: repoConnections.name })
    .from(repoConnections)
    .where(inArray(repoConnections.id, repoConnectionIds));

  const repoMap = new Map(repos.map((r) => [r.id, `${r.owner}/${r.name}`]));

  // Search each repo in parallel
  const perRepoResults = await Promise.all(
    repoConnectionIds.map(async (repoId) => {
      try {
        const results = await semanticSearch(query, repoId, Math.ceil(limit / repoConnectionIds.length) + 5, 0.25);
        const repoName = repoMap.get(repoId) ?? repoId;
        return results.map((r) => ({
          repoName,
          repoConnectionId: repoId,
          filePath: r.filePath,
          content: r.content,
          startLine: r.startLine,
          endLine: r.endLine,
          symbolName: r.symbolName,
          relevanceScore: r.similarity,
        } satisfies CrossRepoSearchResult));
      } catch {
        // Individual repo failures don't block other repos
        return [] as CrossRepoSearchResult[];
      }
    }),
  );

  // Merge and sort by relevance
  const allResults = perRepoResults.flat();
  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Deduplicate by content hash
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    const key = `${r.repoConnectionId}:${r.filePath}:${r.startLine}-${r.endLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const finalResults = deduped.slice(0, limit);

  // Store in cache
  await setCached(workspaceId, query, finalResults);

  return finalResults;
}

async function getCached(
  workspaceId: string,
  query: string,
): Promise<CrossRepoSearchResult[] | null> {
  const rows = await db
    .select({
      results: crossRepoSearchCache.results,
      createdAt: crossRepoSearchCache.createdAt,
    })
    .from(crossRepoSearchCache)
    .where(
      eq(crossRepoSearchCache.workspaceId, workspaceId),
    )
    .limit(10);

  const match = rows.find(
    (r) => (r.results as { query?: string }).query === query,
  );

  if (!match) return null;

  const age = Date.now() - match.createdAt.getTime();
  if (age > CACHE_TTL_MS) return null;

  return (match.results as { results: CrossRepoSearchResult[] }).results ?? null;
}

async function setCached(
  workspaceId: string,
  query: string,
  results: CrossRepoSearchResult[],
): Promise<void> {
  try {
    await db.insert(crossRepoSearchCache).values({
      workspaceId,
      query,
      results: { query, results },
    });
  } catch {
    // Cache write failures are non-fatal
  }
}
