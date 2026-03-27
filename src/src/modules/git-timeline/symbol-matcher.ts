/**
 * symbol-matcher.ts
 *
 * Matches diff hunks (changed line ranges) to known symbols in the DB.
 * Uses the existing `symbols` + `files` tables — finds symbols where
 * startLine/endLine overlap with changed line ranges.
 */

import { db } from "@/src/lib/db";
import { symbols, files } from "@/src/lib/db/schema";
import { and, eq, lte, gte } from "drizzle-orm";

/**
 * Given a repo connection, a file path, and an array of changed line numbers,
 * returns the names of symbols that overlap with at least one changed line.
 *
 * @param repoConnectionId  - The repo_connection UUID
 * @param filePath          - Repo-relative file path (e.g. "src/lib/auth.ts")
 * @param changedLines      - Array of 1-based line numbers that were changed
 * @returns                 - Deduplicated list of symbol names
 */
export async function matchDiffToSymbols(
  repoConnectionId: string,
  filePath: string,
  changedLines: number[],
): Promise<string[]> {
  if (changedLines.length === 0) return [];

  // Find the file record for this repo + path
  const fileRow = await db.query.files.findFirst({
    where: and(
      eq(files.repoConnectionId, repoConnectionId),
      eq(files.path, filePath),
    ),
  });

  if (!fileRow) return [];

  // Determine the min/max changed line to narrow the DB query
  const minLine = Math.min(...changedLines);
  const maxLine = Math.max(...changedLines);

  // Find symbols whose line range overlaps [minLine, maxLine]
  // Overlap condition: symbol.startLine <= maxLine AND symbol.endLine >= minLine
  const matchedSymbols = await db
    .select({ name: symbols.name })
    .from(symbols)
    .where(
      and(
        eq(symbols.fileId, fileRow.id),
        lte(symbols.startLine, maxLine),
        gte(symbols.endLine, minLine),
      ),
    );

  // Deduplicate names
  const names = new Set<string>();
  for (const row of matchedSymbols) {
    names.add(row.name);
  }
  return Array.from(names);
}
