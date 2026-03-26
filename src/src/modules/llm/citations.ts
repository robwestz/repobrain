/**
 * Citation parsing and validation.
 *
 * The LLM is instructed to emit citations in the form:
 *   [file:path/to/file.ts:L15-L30]
 *
 * This module:
 *   1. Parses all citation references out of an LLM response string
 *   2. Validates each against the actual File records in the database
 *      (file exists? line range in bounds?)
 *   3. Returns structured Citation domain objects for valid ones
 *   4. Flags invalid ones (never silently discards — the caller decides
 *      what to do with the warning, per §11 acceptance criteria)
 */

import { db } from "../../lib/db";
import { files } from "../../lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Citation } from "../../types/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedCitation {
  /** Full raw match, e.g. "[file:src/auth.ts:L10-L25]" */
  raw: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ValidatedCitation extends ParsedCitation {
  /** True if the file exists in the repo and lines are in-bounds */
  valid: boolean;
  /** Human-readable reason when valid === false */
  invalidReason?: string;
  /** DB file ID (set when file is found, even if lines are out-of-bounds) */
  fileId?: string;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Extract all citation references from an LLM response string.
 *
 * Returns deduplicated results (same file+lines only counted once).
 */
export function parseCitations(text: string): ParsedCitation[] {
  // Pattern: [file:any/path.ext:L<start>-L<end>]
  const CITATION_RE = /\[file:([^\]:]+(?:\.[^\]:]*)?):L(\d+)-L(\d+)\]/g;
  const seen = new Set<string>();
  const citations: ParsedCitation[] = [];

  let match: RegExpExecArray | null;
  while ((match = CITATION_RE.exec(text)) !== null) {
    const [raw, filePath, startStr, endStr] = match;
    const startLine = parseInt(startStr, 10);
    const endLine = parseInt(endStr, 10);

    const key = `${filePath}:${startLine}-${endLine}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({ raw, filePath, startLine, endLine });
    }
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

/**
 * Validate parsed citations against the File records for the given repo.
 *
 * Checks:
 * 1. File path exists in the repo
 * 2. Start line ≥ 1 and ≤ file's line count
 * 3. End line ≥ start line and ≤ file's line count
 *
 * Invalid citations are included in the output with valid=false and a reason.
 * They are NEVER silently removed — the caller surfaces them as warnings.
 */
export async function validateCitations(
  citations: ParsedCitation[],
  repoConnectionId: string,
): Promise<ValidatedCitation[]> {
  if (citations.length === 0) return [];

  const uniquePaths = [...new Set(citations.map((c) => c.filePath))];

  // Fetch only the files that were actually cited (don't scan the whole repo)
  const fileRows = await db
    .select({ id: files.id, path: files.path, lineCount: files.lineCount })
    .from(files)
    .where(
      and(
        eq(files.repoConnectionId, repoConnectionId),
        inArray(files.path, uniquePaths),
      ),
    );

  const fileMap = new Map(fileRows.map((f) => [f.path, f]));

  return citations.map((citation) => {
    const fileRecord = fileMap.get(citation.filePath);

    if (!fileRecord) {
      return {
        ...citation,
        valid: false,
        invalidReason: `File "${citation.filePath}" not found in repository`,
      };
    }

    if (citation.startLine < 1 || citation.startLine > fileRecord.lineCount) {
      return {
        ...citation,
        valid: false,
        fileId: fileRecord.id,
        invalidReason: `Line ${citation.startLine} is out of range for "${citation.filePath}" (${fileRecord.lineCount} lines)`,
      };
    }

    if (citation.endLine < citation.startLine || citation.endLine > fileRecord.lineCount) {
      return {
        ...citation,
        valid: false,
        fileId: fileRecord.id,
        invalidReason: `End line ${citation.endLine} is out of range for "${citation.filePath}" (${fileRecord.lineCount} lines)`,
      };
    }

    return {
      ...citation,
      valid: true,
      fileId: fileRecord.id,
    };
  });
}

// ---------------------------------------------------------------------------
// Convert to domain objects
// ---------------------------------------------------------------------------

/**
 * Convert validated citations into Citation domain objects.
 * Only valid citations are returned.
 */
export function toCitationObjects(validated: ValidatedCitation[]): Citation[] {
  return validated
    .filter((v): v is ValidatedCitation & { fileId: string } => v.valid && !!v.fileId)
    .map((v) => ({
      fileId: v.fileId,
      filePath: v.filePath,
      startLine: v.startLine,
      endLine: v.endLine,
      content: "", // snippet content is not fetched here to keep this lightweight
    }));
}

// ---------------------------------------------------------------------------
// Quality check
// ---------------------------------------------------------------------------

/**
 * Returns true if the response has at least 1 citation per 100 words,
 * with a minimum of 1 required citation regardless of length.
 *
 * Used to append a low-confidence warning when density is insufficient.
 */
export function hasSufficientCitations(text: string, validCitationCount: number): boolean {
  if (validCitationCount === 0) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const minimumRequired = Math.max(1, Math.floor(wordCount / 100));
  return validCitationCount >= minimumRequired;
}
