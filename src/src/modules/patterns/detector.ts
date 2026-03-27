/**
 * Pattern detection engine.
 * Analyses DB data heuristically — no LLM calls.
 */

import {
  getSymbolsWithFiles,
  getFileSymbolCounts,
  getCircularDependencies,
  getNestingDepths,
  getUnreferencedSymbols,
  getChunksForContentAnalysis,
  getFilesForRepo,
  type SymbolRow,
  type FileSymbolCountRow,
  type ChunkContentRow,
  type FileRow,
} from "./queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternLocation {
  filePath: string;
  fileId: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  evidence: string;
}

export interface PatternMatch {
  id: string;
  patternName: string;
  patternType: "design-pattern" | "anti-pattern" | "inconsistency";
  severity: "info" | "warning" | "critical";
  description: string;
  locations: PatternLocation[];
  suggestion?: string;
}

export interface PatternSummary {
  designPatterns: number;
  antiPatterns: number;
  inconsistencies: number;
  criticalCount: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function detectPatterns(repoConnectionId: string): Promise<PatternMatch[]> {
  // Fetch all data in parallel
  const [symbols, fileCounts, circularDeps, nestingDepths, unreferencedSymbols, chunks, files] =
    await Promise.all([
      getSymbolsWithFiles(repoConnectionId),
      getFileSymbolCounts(repoConnectionId),
      getCircularDependencies(repoConnectionId),
      getNestingDepths(repoConnectionId),
      getUnreferencedSymbols(repoConnectionId),
      getChunksForContentAnalysis(repoConnectionId),
      getFilesForRepo(repoConnectionId),
    ]);

  const results: PatternMatch[] = [];

  // Design patterns
  results.push(...detectSingleton(files, chunks));
  results.push(...detectFactory(symbols, chunks));
  results.push(...detectRepositoryServiceLayer(files, symbols));
  results.push(...detectObserverEvent(files, chunks));
  results.push(...detectModulePattern(files, symbols));

  // Anti-patterns
  results.push(...detectGodClass(fileCounts));
  results.push(...detectCircularDependencies(circularDeps));
  results.push(...detectDeepNesting(nestingDepths));
  results.push(...detectLongParameterList(symbols));
  results.push(...detectDeadCode(unreferencedSymbols));

  // Inconsistencies
  results.push(...detectNamingConventionMix(symbols, files));
  results.push(...detectMissingPattern(files));
  results.push(...detectInconsistentErrorHandling(files, chunks));

  // Remove patterns with no locations
  return results.filter((p) => p.locations.length > 0);
}

export function buildSummary(patterns: PatternMatch[]): PatternSummary {
  return {
    designPatterns: patterns.filter((p) => p.patternType === "design-pattern").length,
    antiPatterns: patterns.filter((p) => p.patternType === "anti-pattern").length,
    inconsistencies: patterns.filter((p) => p.patternType === "inconsistency").length,
    criticalCount: patterns.filter((p) => p.severity === "critical").length,
  };
}

// ---------------------------------------------------------------------------
// Design Pattern Detectors
// ---------------------------------------------------------------------------

/**
 * Singleton: files exporting a single created instance (e.g., `export const db = ...`)
 * or using the classic `let instance = null` pattern.
 */
function detectSingleton(files: FileRow[], chunks: ChunkContentRow[]): PatternMatch[] {
  const locations: PatternLocation[] = [];
  const singletonPatterns = [
    /let\s+instance\s*[=:]/i,
    /export\s+const\s+\w+\s*=\s*new\s+\w+/,
    /export\s+const\s+\w+\s*=\s*\w+\(\)/,
    /getInstance\s*\(/,
    /_instance\s*=/,
    /static\s+instance\s*:/,
  ];

  // Group chunks by file to avoid duplicate file entries
  const filesSeen = new Set<string>();
  for (const chunk of chunks) {
    if (filesSeen.has(chunk.fileId)) continue;
    const content = chunk.content;
    const matched = singletonPatterns.some((re) => re.test(content));
    if (matched) {
      const matchedPattern = singletonPatterns.find((re) => re.test(content));
      const evidence = matchedPattern
        ? `Chunk content matches singleton pattern: ${matchedPattern.toString().slice(1, 40)}...`
        : "Singleton pattern detected";
      locations.push({
        filePath: chunk.filePath,
        fileId: chunk.fileId,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: null,
        evidence,
      });
      filesSeen.add(chunk.fileId);
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "singleton",
      patternName: "Singleton",
      patternType: "design-pattern",
      severity: "info",
      description: `Found ${locations.length} file(s) using the Singleton pattern — a single shared instance exported or created once.`,
      locations,
      suggestion: "Ensure the singleton is thread-safe and avoids hidden global state issues.",
    },
  ];
}

/**
 * Factory: functions that return different types based on input (switch/if + return new).
 */
function detectFactory(symbols: SymbolRow[], chunks: ChunkContentRow[]): PatternMatch[] {
  const locations: PatternLocation[] = [];
  const factoryPatterns = [
    /switch\s*\(.*\)\s*\{[\s\S]{0,500}return\s+new\s+\w+/,
    /if\s*\(.*\)\s*\{[\s\S]{0,200}return\s+new\s+\w+/,
    /return\s+\{\s*\.\.\./,
  ];
  const functionSymbolIds = new Set(
    symbols.filter((s) => ["function", "method", "arrow_function"].includes(s.kind)).map((s) => s.id),
  );

  const filesSeen = new Set<string>();
  for (const chunk of chunks) {
    if (filesSeen.has(chunk.fileId)) continue;
    const content = chunk.content;
    if (factoryPatterns.some((re) => re.test(content))) {
      // Check the file has function symbols (not just utility code)
      const hasFunction = symbols.some((s) => s.fileId === chunk.fileId && functionSymbolIds.has(s.id));
      if (!hasFunction) continue;
      const matchedPattern = factoryPatterns.find((re) => re.test(content));
      locations.push({
        filePath: chunk.filePath,
        fileId: chunk.fileId,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: null,
        evidence: matchedPattern
          ? `Code contains factory-like branching: ${matchedPattern.toString().slice(1, 50)}...`
          : "Factory pattern detected",
      });
      filesSeen.add(chunk.fileId);
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "factory",
      patternName: "Factory",
      patternType: "design-pattern",
      severity: "info",
      description: `Found ${locations.length} file(s) implementing the Factory pattern — functions that return different object types based on input.`,
      locations,
      suggestion: "Consider using a dedicated factory class if the branching logic grows complex.",
    },
  ];
}

/**
 * Repository/Service Layer: files named service.ts, queries.ts, repository.ts.
 */
function detectRepositoryServiceLayer(files: FileRow[], symbols: SymbolRow[]): PatternMatch[] {
  const servicePatterns = [
    /service\.(ts|js|tsx)$/i,
    /queries\.(ts|js|tsx)$/i,
    /repository\.(ts|js|tsx)$/i,
    /repo\.(ts|js|tsx)$/i,
    /store\.(ts|js|tsx)$/i,
    /dao\.(ts|js|tsx)$/i,
  ];

  const locations: PatternLocation[] = [];
  for (const file of files) {
    if (servicePatterns.some((re) => re.test(file.path))) {
      const fileSymbols = symbols.filter((s) => s.fileId === file.id);
      const exportedFns = fileSymbols.filter((s) => ["function", "method"].includes(s.kind));
      if (exportedFns.length === 0) continue;
      locations.push({
        filePath: file.path,
        fileId: file.id,
        startLine: 1,
        endLine: file.lineCount,
        symbolName: null,
        evidence: `File follows service/repository naming convention with ${exportedFns.length} function(s)`,
      });
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "repository-service-layer",
      patternName: "Repository / Service Layer",
      patternType: "design-pattern",
      severity: "info",
      description: `Found ${locations.length} file(s) following the Repository or Service layer pattern — dedicated files for data access and business logic.`,
      locations,
      suggestion: "Keep service layers thin; move complex business rules to domain objects.",
    },
  ];
}

/**
 * Observer/Event: files using EventEmitter, .on(, .emit(.
 */
function detectObserverEvent(files: FileRow[], chunks: ChunkContentRow[]): PatternMatch[] {
  const observerPatterns = [
    /EventEmitter/,
    /\.on\s*\(/,
    /\.emit\s*\(/,
    /addEventListener/,
    /removeEventListener/,
    /\.subscribe\s*\(/,
    /Observable/,
  ];

  const locations: PatternLocation[] = [];
  const filesSeen = new Set<string>();
  for (const chunk of chunks) {
    if (filesSeen.has(chunk.fileId)) continue;
    const content = chunk.content;
    const matchCount = observerPatterns.filter((re) => re.test(content)).length;
    if (matchCount >= 2) {
      locations.push({
        filePath: chunk.filePath,
        fileId: chunk.fileId,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: null,
        evidence: `Uses ${matchCount} Observer/Event patterns (EventEmitter, .on, .emit, etc.)`,
      });
      filesSeen.add(chunk.fileId);
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "observer-event",
      patternName: "Observer / Event Pattern",
      patternType: "design-pattern",
      severity: "info",
      description: `Found ${locations.length} file(s) using the Observer or Event pattern — components communicating via events rather than direct calls.`,
      locations,
      suggestion: "Ensure event listeners are properly cleaned up to avoid memory leaks.",
    },
  ];
}

/**
 * Module Pattern: barrel files (index.ts) that re-export grouped functionality.
 */
function detectModulePattern(files: FileRow[], symbols: SymbolRow[]): PatternMatch[] {
  const barrelFiles = files.filter(
    (f) => /\/index\.(ts|js|tsx|jsx)$/.test(f.path) || /^index\.(ts|js|tsx|jsx)$/.test(f.path),
  );

  const locations: PatternLocation[] = [];
  for (const file of barrelFiles) {
    const fileSymbols = symbols.filter((s) => s.fileId === file.id);
    // Barrel files typically have many exported names but few or no function bodies
    if (fileSymbols.length > 0) {
      locations.push({
        filePath: file.path,
        fileId: file.id,
        startLine: 1,
        endLine: file.lineCount,
        symbolName: null,
        evidence: `Barrel/index file exports ${fileSymbols.length} symbol(s) for grouped module access`,
      });
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "module-pattern",
      patternName: "Module Pattern (Barrel Exports)",
      patternType: "design-pattern",
      severity: "info",
      description: `Found ${locations.length} barrel file(s) (index.ts) grouping exports for cleaner module boundaries.`,
      locations,
      suggestion: "Keep barrel files simple — avoid logic in them to prevent circular imports.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Anti-Pattern Detectors
// ---------------------------------------------------------------------------

/**
 * God Class: class or file with > 15 methods or > 500 lines.
 */
function detectGodClass(fileCounts: FileSymbolCountRow[]): PatternMatch[] {
  const GOD_METHOD_THRESHOLD = 15;
  const GOD_LINE_THRESHOLD = 500;

  const locations: PatternLocation[] = [];
  for (const fc of fileCounts) {
    const methodCount = Number(fc.methodCount) || 0;
    const lineCount = Number(fc.lineCount) || 0;
    if (methodCount > GOD_METHOD_THRESHOLD || lineCount > GOD_LINE_THRESHOLD) {
      const reasons: string[] = [];
      if (methodCount > GOD_METHOD_THRESHOLD) reasons.push(`${methodCount} methods/functions`);
      if (lineCount > GOD_LINE_THRESHOLD) reasons.push(`${lineCount} lines`);
      locations.push({
        filePath: fc.filePath,
        fileId: fc.fileId,
        startLine: 1,
        endLine: lineCount,
        symbolName: null,
        evidence: `God class/file detected: ${reasons.join(", ")}`,
      });
    }
  }

  if (locations.length === 0) return [];
  return [
    {
      id: "god-class",
      patternName: "God Class / God File",
      patternType: "anti-pattern",
      severity: locations.some((l) => l.evidence.includes("methods/functions")) ? "critical" : "warning",
      description: `Found ${locations.length} file(s) that are overly large (>15 methods or >500 lines) — the "God Class" anti-pattern.`,
      locations,
      suggestion:
        "Break large files into smaller, focused modules. Apply the Single Responsibility Principle.",
    },
  ];
}

/**
 * Circular Dependencies: A imports B, B imports A.
 */
function detectCircularDependencies(
  circularDeps: { fromFilePath: string; toFilePath: string; fromSymbolId: string; toSymbolId: string; fromSymbolName: string; toSymbolName: string }[],
): PatternMatch[] {
  if (circularDeps.length === 0) return [];

  // Deduplicate by file pair
  const seen = new Set<string>();
  const locations: PatternLocation[] = [];
  for (const dep of circularDeps) {
    const key = [dep.fromFilePath, dep.toFilePath].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({
      filePath: dep.fromFilePath,
      fileId: dep.fromSymbolId,
      startLine: 1,
      endLine: 1,
      symbolName: dep.fromSymbolName,
      evidence: `Circular import: ${dep.fromFilePath} <-> ${dep.toFilePath}`,
    });
  }

  return [
    {
      id: "circular-dependencies",
      patternName: "Circular Dependencies",
      patternType: "anti-pattern",
      severity: "critical",
      description: `Found ${locations.length} circular import chain(s). Module A imports B, and B imports back to A.`,
      locations,
      suggestion:
        "Introduce an abstraction layer or extract shared code to a third module that both can import without creating a cycle.",
    },
  ];
}

/**
 * Deep Nesting: symbols nested > 3 levels deep.
 */
function detectDeepNesting(
  nestingDepths: { symbolId: string; fileId: string; filePath: string; symbolName: string; depth: number; startLine: number; endLine: number }[],
): PatternMatch[] {
  if (nestingDepths.length === 0) return [];

  // Group by file, keep deepest per file
  const byFile = new Map<string, typeof nestingDepths[0]>();
  for (const row of nestingDepths) {
    const existing = byFile.get(row.fileId);
    if (!existing || row.depth > existing.depth) {
      byFile.set(row.fileId, row);
    }
  }

  const locations: PatternLocation[] = Array.from(byFile.values()).map((row) => ({
    filePath: row.filePath,
    fileId: row.fileId,
    startLine: row.startLine,
    endLine: row.endLine,
    symbolName: row.symbolName,
    evidence: `Symbol "${row.symbolName}" is nested ${row.depth} levels deep (threshold: 3)`,
  }));

  return [
    {
      id: "deep-nesting",
      patternName: "Deep Nesting",
      patternType: "anti-pattern",
      severity: "warning",
      description: `Found ${locations.length} file(s) with deeply nested code (>3 levels). Deep nesting reduces readability and testability.`,
      locations,
      suggestion:
        "Extract deeply nested blocks into named functions. Apply the 'early return' pattern to flatten conditionals.",
    },
  ];
}

/**
 * Long Parameter List: functions with > 5 parameters.
 */
function detectLongParameterList(symbols: SymbolRow[]): PatternMatch[] {
  const MAX_PARAMS = 5;
  const locations: PatternLocation[] = [];

  for (const sym of symbols) {
    if (!["function", "method", "arrow_function", "constructor"].includes(sym.kind)) continue;
    if (!sym.signature) continue;

    // Count parameters from the signature: extract content between first ( and last )
    const match = sym.signature.match(/\(([^)]*)\)/);
    if (!match) continue;
    const paramStr = match[1].trim();
    if (paramStr === "") continue;

    // Count commas accounting for generics/objects — simple heuristic
    let depth = 0;
    let paramCount = 1;
    for (const ch of paramStr) {
      if (ch === "<" || ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === ">" || ch === "}" || ch === "]" || ch === ")") depth--;
      else if (ch === "," && depth === 0) paramCount++;
    }

    if (paramCount > MAX_PARAMS) {
      locations.push({
        filePath: sym.filePath,
        fileId: sym.fileId,
        startLine: sym.startLine,
        endLine: sym.endLine,
        symbolName: sym.name,
        evidence: `Function "${sym.name}" has ~${paramCount} parameters (threshold: ${MAX_PARAMS})`,
      });
    }
  }

  // Limit to 50 findings
  const limited = locations.slice(0, 50);
  if (limited.length === 0) return [];

  return [
    {
      id: "long-parameter-list",
      patternName: "Long Parameter List",
      patternType: "anti-pattern",
      severity: "warning",
      description: `Found ${limited.length} function(s) with more than ${MAX_PARAMS} parameters. Long parameter lists are hard to understand and maintain.`,
      locations: limited,
      suggestion:
        "Group related parameters into a config/options object. Consider the Builder pattern for complex object construction.",
    },
  ];
}

/**
 * Dead Code: exported symbols with zero incoming relations.
 */
function detectDeadCode(
  unreferencedSymbols: { id: string; fileId: string; filePath: string; name: string; kind: string; startLine: number; endLine: number }[],
): PatternMatch[] {
  if (unreferencedSymbols.length === 0) return [];

  const locations: PatternLocation[] = unreferencedSymbols.slice(0, 50).map((sym) => ({
    filePath: sym.filePath,
    fileId: sym.fileId,
    startLine: sym.startLine,
    endLine: sym.endLine,
    symbolName: sym.name,
    evidence: `Symbol "${sym.name}" (${sym.kind}) has no incoming references — potential dead code`,
  }));

  return [
    {
      id: "dead-code",
      patternName: "Dead Code",
      patternType: "anti-pattern",
      severity: "warning",
      description: `Found ${locations.length} symbol(s) with no incoming references. These may be dead code (unused exports, stale functions).`,
      locations,
      suggestion:
        "Verify these symbols are truly unused before removing. Some may be public API entry points or used dynamically.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Inconsistency Detectors
// ---------------------------------------------------------------------------

/**
 * Naming Convention Mix: some symbols use camelCase, others use snake_case.
 */
function detectNamingConventionMix(symbols: SymbolRow[], files: FileRow[]): PatternMatch[] {
  // Focus on function/method names in TypeScript/JavaScript files
  const targetLangs = new Set(["typescript", "javascript", "tsx", "jsx"]);
  const tsFiles = new Set(
    files.filter((f) => f.language && targetLangs.has(f.language.toLowerCase())).map((f) => f.id),
  );

  const camelCaseNames: SymbolRow[] = [];
  const snakeCaseNames: SymbolRow[] = [];

  for (const sym of symbols) {
    if (!tsFiles.has(sym.fileId)) continue;
    if (!["function", "method", "class"].includes(sym.kind)) continue;
    if (sym.name.startsWith("_")) continue; // skip private prefix convention
    if (/[A-Z]/.test(sym.name[0])) continue; // PascalCase (class names) — skip

    if (/[a-z][A-Z]/.test(sym.name)) {
      camelCaseNames.push(sym);
    } else if (/_[a-z]/.test(sym.name)) {
      snakeCaseNames.push(sym);
    }
  }

  // Only flag if both conventions are present
  if (camelCaseNames.length === 0 || snakeCaseNames.length === 0) return [];

  const locations: PatternLocation[] = snakeCaseNames.slice(0, 20).map((sym) => ({
    filePath: sym.filePath,
    fileId: sym.fileId,
    startLine: sym.startLine,
    endLine: sym.endLine,
    symbolName: sym.name,
    evidence: `"${sym.name}" uses snake_case while the codebase predominantly uses camelCase`,
  }));

  return [
    {
      id: "naming-convention-mix",
      patternName: "Naming Convention Mix",
      patternType: "inconsistency",
      severity: "warning",
      description: `Found mixed naming conventions: ${camelCaseNames.length} camelCase and ${snakeCaseNames.length} snake_case function/method names in TypeScript/JavaScript files.`,
      locations,
      suggestion:
        "Adopt a consistent naming convention. For TypeScript/JavaScript, camelCase is the standard. Use an ESLint rule (camelcase) to enforce it.",
    },
  ];
}

/**
 * Missing Pattern: 3+ modules have service+queries files but some directories don't.
 */
function detectMissingPattern(files: FileRow[]): PatternMatch[] {
  // Find all directories that contain at least one .ts file
  const dirFiles = new Map<string, Set<string>>();
  for (const file of files) {
    const parts = file.path.split("/");
    if (parts.length < 2) continue;
    const dir = parts.slice(0, -1).join("/");
    const filename = parts[parts.length - 1].toLowerCase();
    if (!dirFiles.has(dir)) dirFiles.set(dir, new Set());
    dirFiles.get(dir)!.add(filename);
  }

  // Find directories that have a service.ts
  const dirsWithService: string[] = [];
  const dirsWithQueriesOnly: string[] = [];
  const dirsWithServiceButNoQueries: string[] = [];

  for (const [dir, filenames] of dirFiles) {
    const hasService = Array.from(filenames).some((f) => f.startsWith("service."));
    const hasQueries = Array.from(filenames).some((f) => f.startsWith("queries.") || f.startsWith("repository."));
    if (hasService) {
      dirsWithService.push(dir);
      if (!hasQueries) dirsWithServiceButNoQueries.push(dir);
    } else if (hasQueries) {
      dirsWithQueriesOnly.push(dir);
    }
  }

  // Need at least 3 modules with the pattern before flagging
  if (dirsWithService.length < 3) return [];
  if (dirsWithServiceButNoQueries.length === 0) return [];

  const locations: PatternLocation[] = dirsWithServiceButNoQueries.map((dir) => {
    const dirFile = files.find((f) => f.path.startsWith(dir + "/"));
    return {
      filePath: dir + "/",
      fileId: dirFile?.id ?? dir,
      startLine: 1,
      endLine: 1,
      symbolName: null,
      evidence: `Directory "${dir}" has a service file but is missing a queries/repository file`,
    };
  });

  return [
    {
      id: "missing-service-queries-pattern",
      patternName: "Missing Repository/Queries File",
      patternType: "inconsistency",
      severity: "warning",
      description: `${dirsWithService.length} modules follow the service+queries pattern but ${dirsWithServiceButNoQueries.length} module(s) are missing the queries file.`,
      locations,
      suggestion:
        "Extract database queries into a dedicated queries.ts file to keep service files focused on business logic.",
    },
  ];
}

/**
 * Inconsistent Error Handling: some route handlers use try/catch, others don't.
 */
function detectInconsistentErrorHandling(files: FileRow[], chunks: ChunkContentRow[]): PatternMatch[] {
  // Find route handler files
  const routeFiles = files.filter(
    (f) =>
      f.path.endsWith("/route.ts") ||
      f.path.endsWith("/route.js") ||
      f.path.endsWith("route.tsx"),
  );

  if (routeFiles.length < 2) return [];

  const routeFileIds = new Set(routeFiles.map((f) => f.id));

  // Group chunks by file
  const chunksByFile = new Map<string, ChunkContentRow[]>();
  for (const chunk of chunks) {
    if (!routeFileIds.has(chunk.fileId)) continue;
    if (!chunksByFile.has(chunk.fileId)) chunksByFile.set(chunk.fileId, []);
    chunksByFile.get(chunk.fileId)!.push(chunk);
  }

  const filesWithTryCatch: string[] = [];
  const filesWithoutTryCatch: string[] = [];

  for (const routeFile of routeFiles) {
    const fileChunks = chunksByFile.get(routeFile.id) ?? [];
    const content = fileChunks.map((c) => c.content).join("\n");
    if (content.includes("try {") || content.includes("try{")) {
      filesWithTryCatch.push(routeFile.id);
    } else if (content.includes("async") || content.includes("await")) {
      // Only flag if the file actually uses async/await (has async operations)
      filesWithoutTryCatch.push(routeFile.id);
    }
  }

  // Only flag if mixed
  if (filesWithTryCatch.length === 0 || filesWithoutTryCatch.length === 0) return [];

  const locations: PatternLocation[] = filesWithoutTryCatch.slice(0, 20).map((fileId) => {
    const file = routeFiles.find((f) => f.id === fileId)!;
    return {
      filePath: file.path,
      fileId,
      startLine: 1,
      endLine: file.lineCount,
      symbolName: null,
      evidence: `Route handler uses async/await without try/catch (${filesWithTryCatch.length} other route(s) do use try/catch)`,
    };
  });

  return [
    {
      id: "inconsistent-error-handling",
      patternName: "Inconsistent Error Handling",
      patternType: "inconsistency",
      severity: "warning",
      description: `${filesWithTryCatch.length} route handler(s) use try/catch but ${filesWithoutTryCatch.length} do not — inconsistent error handling across API routes.`,
      locations,
      suggestion:
        "Wrap all async route handlers in try/catch and return consistent error responses. Consider a shared error handler middleware.",
    },
  ];
}
