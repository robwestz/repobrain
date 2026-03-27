/**
 * flow-tracer.ts — BFS traversal of symbol_relations to trace execution flow.
 *
 * Given a repository and an entry symbol name, follows outgoing relations
 * (calls, uses, imports) up to maxDepth levels, collecting at most MAX_STEPS
 * steps. For each visited symbol the associated chunk content is fetched so
 * the narrator has real code to work with.
 */

import { db } from "@/src/lib/db";
import {
  symbols,
  symbolRelations,
  files,
  chunks,
  repoConnections,
} from "@/src/lib/db/schema";
import { and, eq, ilike, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FlowStep {
  order: number;
  symbolName: string;
  symbolKind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  incomingRelation?: string; // "calls", "imports", "uses", etc.
}

export interface TracedFlow {
  entryPoint: FlowStep;
  steps: FlowStep[];
  totalFiles: number;
  totalSymbols: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 15;
const DEFAULT_MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Fetch the best chunk content for a given symbol id. */
async function fetchChunkContent(
  symbolId: string,
  fileId: string,
  startLine: number,
  endLine: number,
): Promise<string> {
  // Prefer a chunk that is directly linked to this symbol
  const symbolChunk = await db
    .select({ content: chunks.content })
    .from(chunks)
    .where(eq(chunks.symbolId, symbolId))
    .limit(1);

  if (symbolChunk.length > 0) {
    return symbolChunk[0].content;
  }

  // Fall back to any chunk in the file that overlaps the symbol's line range
  const overlapChunk = await db
    .select({ content: chunks.content })
    .from(chunks)
    .where(
      and(
        eq(chunks.fileId, fileId),
        sql`${chunks.startLine} <= ${endLine}`,
        sql`${chunks.endLine} >= ${startLine}`,
      ),
    )
    .orderBy(chunks.startLine)
    .limit(1);

  if (overlapChunk.length > 0) {
    return overlapChunk[0].content;
  }

  return "// Source code not available";
}

/** Find the entry symbol by exact or fuzzy name match within a repo. */
async function findEntrySymbol(repoConnectionId: string, symbolName: string) {
  // Exact match first
  const exact = await db
    .select({
      id: symbols.id,
      name: symbols.name,
      kind: symbols.kind,
      startLine: symbols.startLine,
      endLine: symbols.endLine,
      fileId: symbols.fileId,
      filePath: files.path,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(
      and(
        eq(files.repoConnectionId, repoConnectionId),
        eq(symbols.name, symbolName),
      ),
    )
    .limit(1);

  if (exact.length > 0) return exact[0];

  // Fuzzy (case-insensitive LIKE) fallback
  const fuzzy = await db
    .select({
      id: symbols.id,
      name: symbols.name,
      kind: symbols.kind,
      startLine: symbols.startLine,
      endLine: symbols.endLine,
      fileId: symbols.fileId,
      filePath: files.path,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(
      and(
        eq(files.repoConnectionId, repoConnectionId),
        ilike(symbols.name, `%${symbolName}%`),
      ),
    )
    .limit(1);

  return fuzzy.length > 0 ? fuzzy[0] : null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Trace an execution flow starting from `entrySymbolName` in the given repo.
 *
 * Uses BFS over outgoing symbol_relations. Returns at most MAX_STEPS steps
 * (including the entry point). The entry point itself counts as step 0.
 */
export async function traceFlow(
  repoConnectionId: string,
  entrySymbolName: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<TracedFlow> {
  // Validate the repo connection exists
  const repo = await db
    .select({ id: repoConnections.id })
    .from(repoConnections)
    .where(eq(repoConnections.id, repoConnectionId))
    .limit(1);

  if (repo.length === 0) {
    throw new Error(`Repository connection ${repoConnectionId} not found`);
  }

  // Find entry symbol
  const entry = await findEntrySymbol(repoConnectionId, entrySymbolName);
  if (!entry) {
    throw new Error(
      `Symbol "${entrySymbolName}" not found in repository ${repoConnectionId}`,
    );
  }

  // Fetch entry chunk content
  const entryCode = await fetchChunkContent(
    entry.id,
    entry.fileId,
    entry.startLine,
    entry.endLine,
  );

  const entryStep: FlowStep = {
    order: 0,
    symbolName: entry.name,
    symbolKind: entry.kind,
    filePath: entry.filePath,
    startLine: entry.startLine,
    endLine: entry.endLine,
    code: entryCode,
  };

  // BFS
  const visitedIds = new Set<string>([entry.id]);
  const steps: FlowStep[] = [];
  const queue: Array<{ symbolId: string; depth: number }> = [
    { symbolId: entry.id, depth: 0 },
  ];

  while (queue.length > 0 && steps.length < MAX_STEPS - 1) {
    const current = queue.shift()!;

    if (current.depth >= maxDepth) continue;

    // Fetch outgoing relations from the current symbol
    const outgoing = await db
      .select({
        toSymbolId: symbolRelations.toSymbolId,
        relationType: symbolRelations.relationType,
        symbolName: symbols.name,
        symbolKind: symbols.kind,
        symbolStartLine: symbols.startLine,
        symbolEndLine: symbols.endLine,
        fileId: symbols.fileId,
        filePath: files.path,
      })
      .from(symbolRelations)
      .innerJoin(symbols, eq(symbolRelations.toSymbolId, symbols.id))
      .innerJoin(files, eq(symbols.fileId, files.id))
      .where(
        and(
          eq(symbolRelations.fromSymbolId, current.symbolId),
          eq(files.repoConnectionId, repoConnectionId),
        ),
      )
      .limit(10); // Don't fan out too widely from a single symbol

    for (const rel of outgoing) {
      if (visitedIds.has(rel.toSymbolId)) continue;
      if (steps.length >= MAX_STEPS - 1) break;

      visitedIds.add(rel.toSymbolId);

      const code = await fetchChunkContent(
        rel.toSymbolId,
        rel.fileId,
        rel.symbolStartLine,
        rel.symbolEndLine,
      );

      steps.push({
        order: steps.length + 1,
        symbolName: rel.symbolName,
        symbolKind: rel.symbolKind,
        filePath: rel.filePath,
        startLine: rel.symbolStartLine,
        endLine: rel.symbolEndLine,
        code,
        incomingRelation: rel.relationType,
      });

      queue.push({ symbolId: rel.toSymbolId, depth: current.depth + 1 });
    }
  }

  // Compute unique file count
  const allSteps = [entryStep, ...steps];
  const uniqueFiles = new Set(allSteps.map((s) => s.filePath));

  return {
    entryPoint: entryStep,
    steps,
    totalFiles: uniqueFiles.size,
    totalSymbols: allSteps.length,
  };
}
