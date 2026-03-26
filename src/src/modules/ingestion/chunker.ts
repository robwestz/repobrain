/**
 * Symbol-aware code chunker.
 *
 * Splits file content into chunks of ~500 tokens with 50-token overlap.
 * Never splits mid-symbol — symbol boundaries take priority over size targets.
 * Each chunk records its line range and optional associated symbol.
 */

import { encoding_for_model } from "tiktoken";
import { createHash } from "crypto";
import type { ExtractedSymbol } from "./symbols";

export interface ChunkResult {
  content: string;
  startLine: number; // 1-based
  endLine: number;   // 1-based
  tokenCount: number;
  contentHash: string;
  /** The symbol this chunk is aligned to, if any */
  symbolId: string | null;
  symbolName: string | null;
}

// Target chunk size in tokens
const TARGET_TOKENS = 500;
// Overlap between consecutive chunks
const OVERLAP_TOKENS = 50;
// Max tokens per chunk — hard limit to prevent oversized chunks
const MAX_TOKENS = 800;
// Min tokens to form a chunk (unless it's the last content)
const MIN_TOKENS = 50;

let encoder: ReturnType<typeof encoding_for_model> | null = null;

function getEncoder() {
  if (!encoder) {
    // Use cl100k_base encoding (used by text-embedding-3-small)
    encoder = encoding_for_model("gpt-4");
  }
  return encoder;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Chunk a file's content with symbol-aware boundaries.
 *
 * Strategy:
 * 1. If the file has symbols, group lines by symbol boundaries
 * 2. Small symbols become individual chunks
 * 3. Large symbols are split at natural boundaries (blank lines, comments)
 * 4. Lines between symbols are grouped into "gap" chunks
 * 5. Overlap is added from the end of the previous chunk
 */
export function chunkFile(
  content: string,
  symbols: Array<ExtractedSymbol & { id?: string }>,
  filePath: string,
): ChunkResult[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  function hash(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  // If no symbols or very small file, chunk by line groups
  if (symbols.length === 0 || lines.length <= 30) {
    return chunkByLines(lines, hash);
  }

  // Sort symbols by start line
  const sortedSymbols = [...symbols].sort((a, b) => a.startLine - b.startLine);

  const chunks: ChunkResult[] = [];
  let currentLine = 1;

  for (const symbol of sortedSymbols) {
    // Handle gap before this symbol
    if (currentLine < symbol.startLine) {
      const gapLines = lines.slice(currentLine - 1, symbol.startLine - 1);
      const gapText = gapLines.join("\n");
      const gapTokens = countTokens(gapText);

      if (gapTokens >= MIN_TOKENS) {
        chunks.push({
          content: gapText,
          startLine: currentLine,
          endLine: symbol.startLine - 1,
          tokenCount: gapTokens,
          contentHash: hash(gapText),
          symbolId: null,
          symbolName: null,
        });
      } else if (chunks.length > 0 && gapTokens > 0) {
        // Merge small gap into previous chunk
        const prev = chunks[chunks.length - 1];
        prev.content += "\n" + gapText;
        prev.endLine = symbol.startLine - 1;
        prev.tokenCount = countTokens(prev.content);
        prev.contentHash = hash(prev.content);
      }
    }

    // Handle the symbol itself
    const symbolLines = lines.slice(symbol.startLine - 1, symbol.endLine);
    const symbolText = symbolLines.join("\n");
    const symbolTokens = countTokens(symbolText);

    if (symbolTokens <= MAX_TOKENS) {
      // Symbol fits in one chunk
      chunks.push({
        content: symbolText,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        tokenCount: symbolTokens,
        contentHash: hash(symbolText),
        symbolId: symbol.id ?? null,
        symbolName: symbol.name,
      });
    } else {
      // Symbol is too large — split at natural boundaries within the symbol
      const subChunks = splitLargeSymbol(
        symbolLines,
        symbol.startLine,
        symbol,
        hash,
      );
      chunks.push(...subChunks);
    }

    currentLine = symbol.endLine + 1;
  }

  // Handle trailing content after last symbol
  if (currentLine <= lines.length) {
    const trailingLines = lines.slice(currentLine - 1);
    const trailingText = trailingLines.join("\n");
    const trailingTokens = countTokens(trailingText);

    if (trailingTokens >= MIN_TOKENS) {
      chunks.push({
        content: trailingText,
        startLine: currentLine,
        endLine: lines.length,
        tokenCount: trailingTokens,
        contentHash: hash(trailingText),
        symbolId: null,
        symbolName: null,
      });
    } else if (chunks.length > 0 && trailingTokens > 0) {
      const prev = chunks[chunks.length - 1];
      prev.content += "\n" + trailingText;
      prev.endLine = lines.length;
      prev.tokenCount = countTokens(prev.content);
      prev.contentHash = hash(prev.content);
    }
  }

  // Add overlap between chunks
  return addOverlap(chunks, lines, hash);
}

/**
 * Split a large symbol into sub-chunks at natural boundaries.
 */
function splitLargeSymbol(
  symbolLines: string[],
  startLineOffset: number,
  symbol: ExtractedSymbol & { id?: string },
  hash: (text: string) => string,
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let chunkStartIdx = 0;
  let currentTokens = 0;
  let lastGoodBreak = 0;

  for (let i = 0; i < symbolLines.length; i++) {
    const lineTokens = countTokens(symbolLines[i]);
    currentTokens += lineTokens;

    // Track natural break points: blank lines, comment-only lines, closing braces
    const trimmed = symbolLines[i].trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed === "}" ||
      trimmed === "},"
    ) {
      lastGoodBreak = i + 1;
    }

    if (currentTokens >= TARGET_TOKENS && i > chunkStartIdx) {
      // Use the last good break point, or current line if none
      const breakAt = lastGoodBreak > chunkStartIdx ? lastGoodBreak : i + 1;
      const chunkLines = symbolLines.slice(chunkStartIdx, breakAt);
      const chunkText = chunkLines.join("\n");

      chunks.push({
        content: chunkText,
        startLine: startLineOffset + chunkStartIdx,
        endLine: startLineOffset + breakAt - 1,
        tokenCount: countTokens(chunkText),
        contentHash: hash(chunkText),
        symbolId: symbol.id ?? null,
        symbolName: symbol.name,
      });

      chunkStartIdx = breakAt;
      currentTokens = 0;
      lastGoodBreak = breakAt;
    }
  }

  // Remaining lines
  if (chunkStartIdx < symbolLines.length) {
    const chunkLines = symbolLines.slice(chunkStartIdx);
    const chunkText = chunkLines.join("\n");
    const tokens = countTokens(chunkText);

    if (tokens > 0) {
      // Merge into previous chunk if very small
      if (tokens < MIN_TOKENS && chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        prev.content += "\n" + chunkText;
        prev.endLine = startLineOffset + symbolLines.length - 1;
        prev.tokenCount = countTokens(prev.content);
        prev.contentHash = hash(prev.content);
      } else {
        chunks.push({
          content: chunkText,
          startLine: startLineOffset + chunkStartIdx,
          endLine: startLineOffset + symbolLines.length - 1,
          tokenCount: tokens,
          contentHash: hash(chunkText),
          symbolId: symbol.id ?? null,
          symbolName: symbol.name,
        });
      }
    }
  }

  return chunks;
}

/**
 * Chunk a file without symbol information, using line-based splitting.
 */
function chunkByLines(
  lines: string[],
  hash: (text: string) => string,
): ChunkResult[] {
  const fullText = lines.join("\n");
  const totalTokens = countTokens(fullText);

  // Small file — single chunk
  if (totalTokens <= MAX_TOKENS) {
    return [
      {
        content: fullText,
        startLine: 1,
        endLine: lines.length,
        tokenCount: totalTokens,
        contentHash: hash(fullText),
        symbolId: null,
        symbolName: null,
      },
    ];
  }

  // Split at natural boundaries
  const chunks: ChunkResult[] = [];
  let chunkStartIdx = 0;
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = countTokens(lines[i]);
    currentTokens += lineTokens;

    if (currentTokens >= TARGET_TOKENS) {
      // Find a good break point near here
      let breakAt = i + 1;
      for (let j = i; j >= Math.max(chunkStartIdx + 5, i - 10); j--) {
        if (lines[j].trim() === "") {
          breakAt = j + 1;
          break;
        }
      }

      const chunkLines = lines.slice(chunkStartIdx, breakAt);
      const chunkText = chunkLines.join("\n");

      chunks.push({
        content: chunkText,
        startLine: chunkStartIdx + 1,
        endLine: breakAt,
        tokenCount: countTokens(chunkText),
        contentHash: hash(chunkText),
        symbolId: null,
        symbolName: null,
      });

      chunkStartIdx = breakAt;
      currentTokens = 0;
    }
  }

  // Remaining lines
  if (chunkStartIdx < lines.length) {
    const chunkLines = lines.slice(chunkStartIdx);
    const chunkText = chunkLines.join("\n");
    const tokens = countTokens(chunkText);

    if (tokens > 0) {
      chunks.push({
        content: chunkText,
        startLine: chunkStartIdx + 1,
        endLine: lines.length,
        tokenCount: tokens,
        contentHash: hash(chunkText),
        symbolId: null,
        symbolName: null,
      });
    }
  }

  return addOverlap(chunks, lines, hash);
}

/**
 * Add overlap content from the end of each chunk to the beginning of the next.
 * This ensures context continuity across chunk boundaries.
 */
function addOverlap(
  chunks: ChunkResult[],
  allLines: string[],
  hash: (text: string) => string,
): ChunkResult[] {
  if (chunks.length <= 1) return chunks;

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const prevLines = allLines.slice(prevChunk.startLine - 1, prevChunk.endLine);

    // Take overlap lines from end of previous chunk
    let overlapText = "";
    let overlapTokens = 0;
    const overlapLines: string[] = [];

    for (let j = prevLines.length - 1; j >= 0; j--) {
      const lineTokens = countTokens(prevLines[j]);
      if (overlapTokens + lineTokens > OVERLAP_TOKENS) break;
      overlapTokens += lineTokens;
      overlapLines.unshift(prevLines[j]);
    }

    if (overlapLines.length > 0) {
      overlapText = overlapLines.join("\n");
      const currentChunk = chunks[i];
      currentChunk.content = overlapText + "\n" + currentChunk.content;
      currentChunk.startLine = Math.max(1, currentChunk.startLine - overlapLines.length);
      currentChunk.tokenCount = countTokens(currentChunk.content);
      currentChunk.contentHash = hash(currentChunk.content);
    }
  }

  return chunks;
}
