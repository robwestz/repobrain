/**
 * Symbol relationship builder.
 * Analyzes imports/exports across files to build edges between symbols.
 * Matches import sources to file paths and connects imported names to
 * their corresponding exported symbols.
 */

import type { SymbolRelationType } from "@/src/types/domain";
import type { ExtractedImport } from "./symbols";

export interface FileSymbolData {
  fileId: string;
  filePath: string;
  symbols: Array<{
    id: string;
    name: string;
    kind: string;
  }>;
  imports: ExtractedImport[];
  exports: string[];
}

export interface SymbolEdge {
  fromSymbolId: string;
  toSymbolId: string;
  relationType: SymbolRelationType;
}

/**
 * Build symbol relationship edges across all files in a repo.
 * Matches imports to exports by resolving module paths to file paths.
 */
export function buildSymbolRelations(filesData: FileSymbolData[]): SymbolEdge[] {
  const edges: SymbolEdge[] = [];

  // Build lookup maps
  const exportsByFile = new Map<string, Map<string, string>>(); // filePath → Map<symbolName, symbolId>
  const allSymbolsByName = new Map<string, Array<{ id: string; fileId: string; filePath: string }>>();

  for (const file of filesData) {
    const fileExports = new Map<string, string>();

    for (const sym of file.symbols) {
      // Track all symbols by name for fuzzy matching
      const existing = allSymbolsByName.get(sym.name) ?? [];
      existing.push({ id: sym.id, fileId: file.fileId, filePath: file.filePath });
      allSymbolsByName.set(sym.name, existing);

      // Track exports
      if (file.exports.includes(sym.name)) {
        fileExports.set(sym.name, sym.id);
      }
    }

    // If no explicit exports, all top-level symbols are potentially importable
    if (file.exports.length === 0) {
      for (const sym of file.symbols) {
        fileExports.set(sym.name, sym.id);
      }
    }

    exportsByFile.set(file.filePath, fileExports);
  }

  // Build path resolution index: map module specifiers to file paths
  const pathIndex = buildPathIndex(filesData.map((f) => f.filePath));

  // Process imports for each file
  for (const file of filesData) {
    for (const imp of file.imports) {
      const resolvedPaths = resolveImportSource(imp.source, file.filePath, pathIndex);

      for (const targetPath of resolvedPaths) {
        const targetExports = exportsByFile.get(targetPath);
        if (!targetExports) continue;

        if (imp.names.length === 0) {
          // Namespace/side-effect import — link file-level if possible
          continue;
        }

        for (const importedName of imp.names) {
          // Find the importing symbol (any symbol in this file with this name)
          const importingSymbol = file.symbols.find(
            (s) => s.name === importedName && s.kind === "variable",
          );

          // Find the exported symbol in the target file
          const exportedSymbolId = targetExports.get(importedName);

          if (exportedSymbolId) {
            if (importingSymbol) {
              edges.push({
                fromSymbolId: importingSymbol.id,
                toSymbolId: exportedSymbolId,
                relationType: "imports",
              });
            } else {
              // Even without a matching importing symbol, create edges
              // from the first symbol in the importing file to show dependency
              const firstSymbol = file.symbols[0];
              if (firstSymbol) {
                edges.push({
                  fromSymbolId: firstSymbol.id,
                  toSymbolId: exportedSymbolId,
                  relationType: "imports",
                });
              }
            }
          }
        }
      }
    }
  }

  // Detect extends/implements via class signatures
  for (const file of filesData) {
    for (const sym of file.symbols) {
      if (sym.kind !== "class" && sym.kind !== "interface") continue;

      // Simple heuristic: look for "extends X" or "implements Y" in nearby symbols
      const extendsMatch = allSymbolsByName.get(sym.name);
      if (!extendsMatch) continue;

      // We'd need the actual signature text to detect extends/implements properly.
      // This is handled in the ingestion pipeline where we have access to full content.
    }
  }

  return deduplicateEdges(edges);
}

/**
 * Build an index mapping possible import specifiers to file paths.
 */
function buildPathIndex(filePaths: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const fp of filePaths) {
    // Index by multiple forms:
    // "src/auth/middleware.ts" → ["src/auth/middleware", "auth/middleware", "middleware"]
    const withoutExt = stripExtension(fp);

    // Full path without extension
    addToIndex(index, withoutExt, fp);

    // Path segments (for relative imports)
    const parts = withoutExt.split("/");
    for (let i = 1; i < parts.length; i++) {
      addToIndex(index, parts.slice(i).join("/"), fp);
    }

    // Basename only
    const basename = parts[parts.length - 1];
    addToIndex(index, basename, fp);

    // Handle index files: "src/auth/index.ts" → "src/auth"
    if (basename === "index") {
      const dirPath = parts.slice(0, -1).join("/");
      addToIndex(index, dirPath, fp);
      // Also the directory basename
      if (parts.length >= 2) {
        addToIndex(index, parts[parts.length - 2], fp);
      }
    }
  }

  return index;
}

function addToIndex(index: Map<string, string[]>, key: string, path: string): void {
  const existing = index.get(key) ?? [];
  if (!existing.includes(path)) {
    existing.push(path);
    index.set(key, existing);
  }
}

function stripExtension(filePath: string): string {
  // Remove common extensions
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|kt|swift|cs|scala)$/, "");
}

/**
 * Resolve an import source to possible file paths.
 */
function resolveImportSource(
  source: string,
  importingFilePath: string,
  pathIndex: Map<string, string[]>,
): string[] {
  // Skip node_modules / external packages
  if (!source.startsWith(".") && !source.startsWith("/") && !source.startsWith("@/")) {
    // Could be an npm package or absolute module — skip
    return [];
  }

  // Normalize the import path
  let normalized = source;

  // Handle @/ alias (common in Next.js projects)
  if (normalized.startsWith("@/")) {
    normalized = normalized.slice(2);
  }

  // Handle relative imports
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    const importDir = importingFilePath.split("/").slice(0, -1).join("/");
    const parts = [...importDir.split("/"), ...normalized.split("/")];
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "." || part === "") continue;
      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    normalized = resolved.join("/");
  }

  // Look up in path index
  const matches = pathIndex.get(normalized);
  if (matches && matches.length > 0) return matches;

  // Try without leading directories
  const lastPart = normalized.split("/").pop();
  if (lastPart) {
    const partialMatches = pathIndex.get(lastPart);
    if (partialMatches && partialMatches.length > 0) return partialMatches;
  }

  return [];
}

function deduplicateEdges(edges: SymbolEdge[]): SymbolEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.fromSymbolId}:${edge.toSymbolId}:${edge.relationType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
