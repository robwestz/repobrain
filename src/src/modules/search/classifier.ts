/**
 * Query classifier — pure heuristic intent detection with NO LLM calls.
 *
 * Analyses the raw query text and assigns one of the QueryIntent values
 * based on keyword patterns, then extracts symbol candidates and optional
 * filters (file pattern, language) for downstream search strategies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryIntent =
  | "find_code"       // "find all error handlers"
  | "find_pattern"    // "show me singleton patterns"
  | "find_usage"      // "where is getUserById called?"
  | "find_definition" // "where is the User type defined?"
  | "find_similar"    // "find code similar to this function"
  | "find_missing"    // "which files don't have error handling?"
  | "general";        // fallback

export interface ClassifiedQuery {
  intent: QueryIntent;
  normalizedQuery: string; // cleaned for retrieval
  symbolCandidates: string[]; // extracted identifiers
  fileFilter?: string; // e.g. "*.ts"
  languageFilter?: string; // e.g. "typescript"
}

// ---------------------------------------------------------------------------
// Heuristic patterns — ordered by specificity (most specific first)
// ---------------------------------------------------------------------------

/** Patterns that map to find_definition */
const DEFINITION_PATTERNS = [
  /\b(?:where\s+is|where's|find)\s+(?:the\s+)?(?:definition|declaration|type|interface|class|struct|enum|function|method)\s+(?:of|for)?\s/i,
  /\b(?:defined?|declared?|implemented?)\s+(?:where|in which|at)\b/i,
  /\bwhere\s+(?:is|are)\s+.+\s+(?:defined?|declared?|implemented?|located?)\b/i,
  /\bdefinition\s+of\b/i,
  /\bwhat\s+(?:is|are)\s+the\s+(?:type|interface|class|struct|enum)\s+(?:of\s+)?[A-Z]/i,
];

/** Patterns that map to find_usage */
const USAGE_PATTERNS = [
  /\b(?:where|how)\s+is\s+.+\s+(?:used|called|invoked|referenced|imported|consumed)\b/i,
  /\b(?:who|what)\s+(?:calls?|uses?|invokes?|imports?|references?)\s/i,
  /\bwhere\s+(?:is|are|does)\s+.+\s+(?:get\s+)?(?:used|called|invoked|imported)\b/i,
  /\bcall\s+sites?\s+(?:for|of)\b/i,
  /\busages?\s+of\b/i,
  /\bcallers?\s+of\b/i,
];

/** Patterns that map to find_similar */
const SIMILAR_PATTERNS = [
  /\bsimilar\s+to\b/i,
  /\blike\s+(?:this|the)\b/i,
  /\banalogous\s+to\b/i,
  /\bequivalent\s+to\b/i,
  /\brelated\s+(?:code|functions?|implementations?)\b/i,
  /\bsame\s+pattern\s+as\b/i,
];

/** Patterns that map to find_missing */
const MISSING_PATTERNS = [
  /\bwithout\b/i,
  /\bmissing\b/i,
  /\blacking\b/i,
  /\bno\s+(?:error|input|auth|validation|handling|logging|tests?)\b/i,
  /\bdon'?t\s+have\b/i,
  /\bdoesn'?t?\s+(?:have|handle|check|validate)\b/i,
  /\bnever\s+(?:check|validate|handle|catch)\b/i,
  /\bwhich\s+(?:files?|functions?|classes?|modules?)\s+(?:don'?t|doesn'?t|lack|never)\b/i,
];

/** Patterns that map to find_pattern */
const PATTERN_PATTERNS = [
  /\b(?:design\s+)?pattern\b/i,
  /\bsingleton\b/i,
  /\bfactory\b/i,
  /\bobserver\b/i,
  /\bdependency\s+injection\b/i,
  /\bmiddleware\b/i,
  /\bdecorator\s+pattern\b/i,
  /\brepository\s+pattern\b/i,
  /\banti-?pattern\b/i,
  /\bshow\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?patterns?\b/i,
];

/** Patterns that indicate "find code" (broad search) */
const FIND_CODE_PATTERNS = [
  /\b(?:find|show|list|get|search)\s+(?:all|any|every)?\s+(?:the\s+)?(?:code|functions?|methods?|classes?|files?|endpoints?|routes?|handlers?|components?)\b/i,
  /\bshow\s+me\b/i,
];

// ---------------------------------------------------------------------------
// File/language filter extraction
// ---------------------------------------------------------------------------

/** Extract file glob patterns like "*.ts", "*.tsx", "in *.py files" */
function extractFileFilter(query: string): string | undefined {
  // Explicit glob pattern
  const globMatch = query.match(/\*\.\w+/);
  if (globMatch) return globMatch[0];

  // "in the api folder" / "in api/" / "in src/modules"
  const folderMatch = query.match(/\bin\s+(?:the\s+)?([a-z][a-z0-9/_-]+(?:\/|\s+folder|\s+directory))/i);
  if (folderMatch) {
    const folder = folderMatch[1].trim().replace(/\s+(?:folder|directory)$/, "").trim();
    return `${folder}/**`;
  }

  return undefined;
}

/** Extract a language filter hint from the query */
const LANGUAGE_KEYWORDS: Record<string, string> = {
  typescript: "typescript", " ts ": "typescript", " ts\b": "typescript",
  javascript: "javascript", " js ": "javascript",
  python: "python", " py ": "python",
  rust: "rust",
  go: "go", golang: "go",
  java: "java",
  ruby: "ruby",
  php: "php",
  csharp: "csharp", "c#": "csharp",
  cpp: "cpp", "c++": "cpp",
};

function extractLanguageFilter(query: string): string | undefined {
  const lower = query.toLowerCase();
  for (const [keyword, lang] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (lower.includes(keyword)) return lang;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Symbol candidate extraction
// ---------------------------------------------------------------------------

/** Minimum symbol name length to avoid matching noise tokens */
const MIN_SYMBOL_LENGTH = 2;

/**
 * Extract plausible symbol/identifier names from the query text.
 * Mirrors the logic in retrieval/structural.ts but focused on
 * the query-level (not DB lookup) — used to guide intent scoring.
 */
export function extractSymbolCandidates(query: string): string[] {
  const candidates = new Set<string>();

  // Backtick-quoted identifiers: `foo`
  for (const m of query.matchAll(/`([^`]+)`/g)) {
    candidates.add(m[1].trim());
  }

  // Double-quoted identifiers: "FooBar"
  for (const m of query.matchAll(/"([A-Za-z_]\w+)"/g)) {
    candidates.add(m[1].trim());
  }

  // Single-quoted identifiers: 'fooBar'
  for (const m of query.matchAll(/'([A-Za-z_]\w+)'/g)) {
    candidates.add(m[1].trim());
  }

  // CamelCase / PascalCase with at least two capital transitions
  for (const m of query.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g)) {
    candidates.add(m[1]);
  }

  // snake_case identifiers
  for (const m of query.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
    candidates.add(m[1]);
  }

  // Single PascalCase word (e.g. "User", "Config", "Router")
  for (const m of query.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    candidates.add(m[1]);
  }

  // camelCase identifiers (starts lowercase, has uppercase)
  for (const m of query.matchAll(/\b([a-z][a-zA-Z0-9]{2,})\b/g)) {
    if (/[A-Z]/.test(m[1]) || /\d/.test(m[1])) {
      candidates.add(m[1]);
    }
  }

  return Array.from(candidates).filter((c) => c.length >= MIN_SYMBOL_LENGTH);
}

// ---------------------------------------------------------------------------
// Query normalisation
// ---------------------------------------------------------------------------

/** Stop-words that add noise to retrieval queries */
const STOP_PHRASE_RE = /\b(?:where\s+is|where\s+are|find\s+(?:all\s+)?|show\s+(?:me\s+)?(?:all\s+)?|list\s+(?:all\s+)?|how\s+(?:is|are)\s+|search\s+for\s+|look\s+for\s+|which\s+files?\s+(?:have|contain|don't\s+have|lack)\s+)\b/gi;

function normalizeQuery(raw: string): string {
  return raw
    .replace(STOP_PHRASE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a raw natural-language query into a structured intent and
 * extract metadata useful for search routing — no LLM involved.
 */
export function classifyQuery(rawQuery: string): ClassifiedQuery {
  const trimmed = rawQuery.trim();
  const symbolCandidates = extractSymbolCandidates(trimmed);
  const fileFilter = extractFileFilter(trimmed);
  const languageFilter = extractLanguageFilter(trimmed);
  const normalizedQuery = normalizeQuery(trimmed);

  // Test patterns in priority order
  if (DEFINITION_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_definition", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  if (USAGE_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_usage", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  if (MISSING_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_missing", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  if (SIMILAR_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_similar", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  if (PATTERN_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_pattern", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  if (FIND_CODE_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "find_code", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  // If we have symbol candidates that look like code identifiers, lean toward
  // find_code so the retrieval pipeline can leverage them
  if (symbolCandidates.length > 0) {
    return { intent: "find_code", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
  }

  return { intent: "general", normalizedQuery, symbolCandidates, fileFilter, languageFilter };
}

// ---------------------------------------------------------------------------
// Intent display helpers (UI-facing)
// ---------------------------------------------------------------------------

export const INTENT_LABELS: Record<QueryIntent, string> = {
  find_definition: "Finding definitions",
  find_usage: "Finding usages",
  find_code: "Searching code",
  find_pattern: "Finding patterns",
  find_similar: "Finding similar code",
  find_missing: "Finding missing implementations",
  general: "Searching",
};

export const INTENT_COLORS: Record<QueryIntent, string> = {
  find_definition: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  find_usage: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  find_code: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  find_pattern: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  find_similar: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  find_missing: "bg-red-500/15 text-red-700 dark:text-red-300",
  general: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
};
