/**
 * suggestions.ts — Suggest interesting flows to narrate.
 *
 * Queries the DB for good narrative entry points:
 * - API route handlers (HTTP method functions in files under /api/)
 * - Symbols with the highest number of outgoing relations (call-heavy)
 * - Symbols that cross multiple modules
 *
 * Returns 5-10 suggestions with metadata the UI can display as cards.
 */

import { db } from "@/src/lib/db";
import { symbols, symbolRelations, files } from "@/src/lib/db/schema";
import { and, eq, sql, desc, like, or } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SuggestedFlow {
  title: string;
  description: string;
  entrySymbol: string;
  entryFile: string;
}

// ---------------------------------------------------------------------------
// Helper: get API route entry points
// ---------------------------------------------------------------------------

async function getApiRouteEntryPoints(repoConnectionId: string): Promise<SuggestedFlow[]> {
  // Functions named GET, POST, PUT, DELETE, PATCH in files under api/ or route files
  const apiSymbols = await db
    .select({
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(
      and(
        eq(files.repoConnectionId, repoConnectionId),
        or(
          like(files.path, "%/api/%"),
          like(files.path, "%route.ts%"),
          like(files.path, "%route.tsx%"),
        ),
        or(
          eq(symbols.name, "GET"),
          eq(symbols.name, "POST"),
          eq(symbols.name, "PUT"),
          eq(symbols.name, "DELETE"),
          eq(symbols.name, "PATCH"),
          like(symbols.name, "%Handler%"),
          like(symbols.name, "%handler%"),
        ),
      ),
    )
    .limit(5);

  return apiSymbols.map((s) => {
    const pathParts = s.filePath.split("/");
    const routeHint = pathParts
      .slice(pathParts.indexOf("api") >= 0 ? pathParts.indexOf("api") : -3)
      .join("/")
      .replace(/\/route\.(ts|tsx)$/, "");

    return {
      title: `${s.name} ${routeHint}`,
      description: `Trace what happens when the ${s.name} handler is called at ${routeHint}`,
      entrySymbol: s.name,
      entryFile: s.filePath,
    };
  });
}

// ---------------------------------------------------------------------------
// Helper: high out-degree symbols (call-heavy hubs)
// ---------------------------------------------------------------------------

async function getHighOutDegreeSymbols(repoConnectionId: string): Promise<SuggestedFlow[]> {
  // Count outgoing relations per symbol, return top 5
  const rows = await db
    .select({
      symbolId: symbolRelations.fromSymbolId,
      outDegree: sql<number>`count(*)::int`.as("out_degree"),
      symbolName: symbols.name,
      symbolKind: symbols.kind,
      filePath: files.path,
    })
    .from(symbolRelations)
    .innerJoin(symbols, eq(symbolRelations.fromSymbolId, symbols.id))
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(eq(files.repoConnectionId, repoConnectionId))
    .groupBy(
      symbolRelations.fromSymbolId,
      symbols.name,
      symbols.kind,
      files.path,
    )
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  return rows
    .filter((r) => r.outDegree >= 2)
    .map((r) => ({
      title: `${r.symbolName} flow`,
      description: `${r.symbolName} calls ${r.outDegree} other symbols — trace its full execution path`,
      entrySymbol: r.symbolName,
      entryFile: r.filePath,
    }));
}

// ---------------------------------------------------------------------------
// Helper: cross-module symbols (appear in "service" or "module" files)
// ---------------------------------------------------------------------------

async function getCrossModuleSymbols(repoConnectionId: string): Promise<SuggestedFlow[]> {
  const serviceSymbols = await db
    .select({
      name: symbols.name,
      kind: symbols.kind,
      filePath: files.path,
    })
    .from(symbols)
    .innerJoin(files, eq(symbols.fileId, files.id))
    .where(
      and(
        eq(files.repoConnectionId, repoConnectionId),
        or(
          like(files.path, "%service%"),
          like(files.path, "%Service%"),
          like(files.path, "%worker%"),
          like(files.path, "%Worker%"),
          like(files.path, "%pipeline%"),
        ),
        or(
          eq(symbols.kind, "function"),
          eq(symbols.kind, "method"),
          eq(symbols.kind, "class"),
        ),
      ),
    )
    .limit(5);

  return serviceSymbols.map((s) => {
    const moduleFolder = s.filePath.split("/").slice(-2, -1)[0] ?? "module";
    return {
      title: `${s.name} in ${moduleFolder}`,
      description: `Understand what ${s.name} does and how it orchestrates work across the system`,
      entrySymbol: s.name,
      entryFile: s.filePath,
    };
  });
}

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

function deduplicateSuggestions(suggestions: SuggestedFlow[]): SuggestedFlow[] {
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.entrySymbol}:${s.entryFile}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Suggest interesting flows to narrate for the given repository.
 *
 * Returns 5-10 suggestions drawn from:
 * - API route handlers
 * - High out-degree symbols (hubs with many calls)
 * - Service/worker/pipeline functions (likely cross-module orchestrators)
 */
export async function suggestFlows(repoConnectionId: string): Promise<SuggestedFlow[]> {
  const [apiRoutes, highDegree, crossModule] = await Promise.all([
    getApiRouteEntryPoints(repoConnectionId).catch(() => [] as SuggestedFlow[]),
    getHighOutDegreeSymbols(repoConnectionId).catch(() => [] as SuggestedFlow[]),
    getCrossModuleSymbols(repoConnectionId).catch(() => [] as SuggestedFlow[]),
  ]);

  // Merge, deduplicate, cap at 10
  const merged = deduplicateSuggestions([
    ...apiRoutes,
    ...highDegree,
    ...crossModule,
  ]);

  return merged.slice(0, 10);
}
