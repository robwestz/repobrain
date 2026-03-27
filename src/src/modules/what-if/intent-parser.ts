/**
 * Heuristic intent parser for "What If" change descriptions.
 * No LLM — pure string pattern matching.
 */

export type ChangeType =
  | "remove"
  | "modify"
  | "add"
  | "split"
  | "merge"
  | "move"
  | "replace";

export interface ParsedIntent {
  changeType: ChangeType;
  targetSymbols: string[];  // identified symbol names
  targetFiles: string[];    // identified file paths
  targetModules: string[];  // identified module/directory names
  description: string;      // cleaned description
}

// ---------------------------------------------------------------------------
// Verb detection
// ---------------------------------------------------------------------------

const VERB_PATTERNS: Array<{ pattern: RegExp; type: ChangeType }> = [
  { pattern: /\b(remove|delete|drop|eliminate|get rid of)\b/i, type: "remove" },
  { pattern: /\b(split|break up|decompose|divide)\b/i, type: "split" },
  { pattern: /\b(merge|combine|consolidate|unify|join)\b/i, type: "merge" },
  { pattern: /\b(move|relocate|migrate)\b/i, type: "move" },
  { pattern: /\b(replace|swap|substitute|switch)\b/i, type: "replace" },
  { pattern: /\b(add|create|introduce|implement|insert)\b/i, type: "add" },
  { pattern: /\b(change|update|refactor|modify|rename|improve|rework|rewrite)\b/i, type: "modify" },
];

function detectChangeType(description: string): ChangeType {
  for (const { pattern, type } of VERB_PATTERNS) {
    if (pattern.test(description)) return type;
  }
  return "modify";
}

// ---------------------------------------------------------------------------
// Identifier extraction
// ---------------------------------------------------------------------------

// Matches: camelCase, PascalCase, snake_case, SCREAMING_SNAKE, kebab-case-words
const IDENTIFIER_PATTERN = /\b([A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)*|[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z][a-z0-9]*)+|[A-Z][A-Z0-9]*(?:_[A-Z][A-Z0-9]*)+)\b/g;

// File path patterns: includes "/" or ends with common extensions
const FILE_PATH_PATTERN = /\b([\w./\-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|cpp|c|h|md|json|yaml|yml|toml|sql))\b/g;

// Module name patterns: lowercase words that look like module/directory names
const MODULE_PATTERN = /\b(the\s+)?([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)\s+(?:module|service|component|package|library|handler|controller|middleware|provider|helper|util|utils|hook|store|context|reducer|action|selector|resolver|repository|adapter|gateway|client|server)\b/gi;

function extractIdentifiers(description: string): {
  symbols: string[];
  files: string[];
  modules: string[];
} {
  const symbols: string[] = [];
  const files: string[] = [];
  const modules: string[] = [];

  // Extract file paths first
  const fileMatches = description.matchAll(FILE_PATH_PATTERN);
  for (const match of fileMatches) {
    const filePath = match[1];
    if (!files.includes(filePath)) {
      files.push(filePath);
    }
  }

  // Extract module names
  const moduleMatches = description.matchAll(MODULE_PATTERN);
  for (const match of moduleMatches) {
    const moduleName = match[2];
    if (moduleName && !modules.includes(moduleName)) {
      modules.push(moduleName);
    }
  }

  // Extract identifiers (camelCase/PascalCase/snake_case)
  // Strip out common English words that match the pattern but aren't code identifiers
  const COMMON_WORDS = new Set([
    "What", "If", "I", "the", "The", "a", "an", "in", "to", "from", "into",
    "with", "by", "for", "as", "is", "are", "was", "will", "would", "should",
    "could", "can", "do", "does", "did", "be", "been", "have", "has", "had",
    "this", "that", "these", "those", "my", "your", "its", "our", "their",
    "which", "who", "whom", "when", "where", "how", "why",
  ]);

  const identifierMatches = description.matchAll(IDENTIFIER_PATTERN);
  for (const match of identifierMatches) {
    const name = match[1];
    if (
      name.length > 2 &&
      !COMMON_WORDS.has(name) &&
      !files.some((f) => f.includes(name))
    ) {
      if (!symbols.includes(name)) {
        symbols.push(name);
      }
    }
  }

  return { symbols, files, modules };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a natural language change description into structured intent.
 * Pure heuristic — no LLM calls.
 */
export function parseChangeIntent(description: string): ParsedIntent {
  const cleaned = description.trim().replace(/\s+/g, " ");
  const changeType = detectChangeType(cleaned);
  const { symbols, files, modules } = extractIdentifiers(cleaned);

  return {
    changeType,
    targetSymbols: symbols,
    targetFiles: files,
    targetModules: modules,
    description: cleaned,
  };
}
