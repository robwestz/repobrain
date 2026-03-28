/**
 * Domain-based context partitioning — adapted from DeepWiki's context_partition.py.
 *
 * Provides heuristic (no LLM) detection of which domain a query or file belongs
 * to, and helpers to boost / filter chunks by that domain in the retrieval
 * pipeline.
 *
 * This is ADDITIVE to existing retrieval: it never removes chunks, only reorders
 * them by adding a domainScore bonus on top of the existing ranking.
 */

import type { RankedChunk } from "../../types/retrieval";

// ---------------------------------------------------------------------------
// Domain definitions
// ---------------------------------------------------------------------------

const DOMAINS = {
  security: {
    pathPatterns: ["auth", "crypto", "token", "jwt", "oauth", "password", "session", "middleware"],
    filePatterns: ["*.key", "*.pem"],
    contentKeywords: ["encrypt", "hash", "secret", "permission"],
  },
  frontend: {
    pathPatterns: ["components/", "hooks/", "context/", "pages/", "app/", "ui/"],
    filePatterns: ["*.tsx", "*.jsx", "*.css", "*.scss"],
    contentKeywords: ["useState", "useEffect", "render", "component"],
  },
  backend: {
    pathPatterns: ["api/", "server/", "services/", "controllers/", "routes/"],
    filePatterns: ["route.ts", "service.ts", "controller.ts"],
    contentKeywords: ["request", "response", "endpoint", "handler"],
  },
  database: {
    pathPatterns: ["db/", "schema", "migration", "model/", "drizzle/"],
    filePatterns: ["*.sql", "schema.ts"],
    contentKeywords: ["table", "column", "index", "query", "SELECT"],
  },
  config: {
    pathPatterns: ["docker", ".github/", "infra/", ".env"],
    filePatterns: ["*.yml", "*.yaml", "*.json", "*.toml", "Dockerfile"],
    contentKeywords: ["config", "environment", "deploy"],
  },
  testing: {
    pathPatterns: ["test/", "spec/", "__tests__", "e2e/"],
    filePatterns: ["*.test.*", "*.spec.*"],
    contentKeywords: ["describe", "it(", "expect", "assert", "mock"],
  },
} as const;

export type Domain = keyof typeof DOMAINS;

export interface DomainScore {
  domain: Domain;
  score: number;
}

// ---------------------------------------------------------------------------
// Query-level keywords for domain detection
// ---------------------------------------------------------------------------

/**
 * Maps each domain to words likely to appear in a user query about that domain.
 * These are intentionally kept broad — false positives are okay since we only
 * boost, never filter.
 */
const QUERY_DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  security: [
    "auth", "authentication", "authorization", "login", "logout", "jwt", "oauth",
    "token", "session", "permission", "role", "rbac", "acl", "encrypt", "decrypt",
    "hash", "password", "secret", "csrf", "cors", "sanitize", "xss", "injection",
    "security", "credential", "cookie", "guard", "policy",
  ],
  frontend: [
    "component", "react", "vue", "svelte", "render", "ui", "page", "view",
    "hook", "usestate", "useeffect", "props", "css", "style", "layout",
    "form", "button", "modal", "frontend", "client", "browser", "dom",
  ],
  backend: [
    "api", "endpoint", "route", "handler", "controller", "service", "server",
    "middleware", "request", "response", "rest", "graphql", "grpc", "rpc",
    "backend", "express", "fastify", "koa", "nest",
  ],
  database: [
    "database", "db", "query", "sql", "table", "column", "row", "schema",
    "migration", "index", "transaction", "join", "select", "insert", "update",
    "delete", "orm", "drizzle", "prisma", "model", "entity",
  ],
  config: [
    "config", "configuration", "environment", "env", "deploy", "deployment",
    "docker", "dockerfile", "compose", "ci", "cd", "pipeline", "github actions",
    "yaml", "yml", "toml", "infra", "infrastructure", "terraform",
  ],
  testing: [
    "test", "spec", "jest", "vitest", "mocha", "chai", "assert", "mock",
    "stub", "fixture", "unit test", "integration test", "e2e", "coverage",
    "describe", "it(", "expect", "beforeeach",
  ],
};

// ---------------------------------------------------------------------------
// Scoring helpers (mirrors _score_document from context_partition.py)
// ---------------------------------------------------------------------------

/**
 * Score a file path (and optionally its content) against all domains.
 *
 * Scoring weights (matching DeepWiki's approach):
 *   path pattern match  → +2.0 per match
 *   file pattern match  → +3.0 per match
 *   content keyword     → +0.5 per match (only first 2000 chars)
 *
 * Returns an array of (domain, score) pairs sorted highest-first.
 */
export function scoreDomains(filePath: string, content?: string): DomainScore[] {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");
  const normalizedContent = content ? content.slice(0, 2000).toLowerCase() : "";

  const scores: DomainScore[] = [];

  for (const [domainKey, filters] of Object.entries(DOMAINS) as [Domain, typeof DOMAINS[Domain]][]) {
    let score = 0;

    // Path pattern matching
    for (const pattern of filters.pathPatterns) {
      if (normalizedPath.includes(pattern.toLowerCase())) {
        score += 2.0;
      }
    }

    // File pattern matching: convert glob-style "*.tsx" → check extension
    for (const pattern of filters.filePatterns) {
      const normalizedPattern = pattern.toLowerCase();
      if (normalizedPattern.startsWith("*.")) {
        // Extension match: *.tsx matches anything ending in .tsx
        const ext = normalizedPattern.slice(1); // ".tsx"
        if (normalizedPath.endsWith(ext)) {
          score += 3.0;
        }
      } else if (normalizedPattern.includes("*")) {
        // General glob: e.g. "*.test.*" — check if filename contains both parts
        const parts = normalizedPattern.split("*").filter(Boolean);
        const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
        if (parts.every((p) => fileName.includes(p))) {
          score += 3.0;
        }
      } else {
        // Literal filename match
        if (normalizedPath.endsWith(normalizedPattern) || normalizedPath.includes(normalizedPattern)) {
          score += 3.0;
        }
      }
    }

    // Content keyword matching
    if (normalizedContent) {
      for (const keyword of filters.contentKeywords) {
        if (normalizedContent.includes(keyword.toLowerCase())) {
          score += 0.5;
        }
      }
    }

    if (score > 0) {
      scores.push({ domain: domainKey, score });
    }
  }

  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Detect the most likely domain for a user query using keyword heuristics.
 *
 * Returns `null` if no domain clears the confidence threshold — in that case
 * the caller should skip domain boosting.
 */
export function detectQueryDomain(query: string): Domain | null {
  const normalized = query.toLowerCase();

  let bestDomain: Domain | null = null;
  let bestCount = 0;

  for (const [domain, keywords] of Object.entries(QUERY_DOMAIN_KEYWORDS) as [Domain, string[]][]) {
    let count = 0;
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestDomain = domain;
    }
  }

  // Require at least one keyword match to declare a domain
  return bestCount >= 1 ? bestDomain : null;
}

/**
 * Filter (and sort) chunks to those most relevant to a domain, respecting an
 * optional token budget.
 *
 * This is the TypeScript equivalent of DeepWiki's `_build_partition`:
 * domain-matching chunks come first, then non-matching ones to fill the budget.
 *
 * NOTE: This is only used in assembleContext for prioritisation within the
 * token budget. Chunks are NEVER fully removed from the retrieval result.
 */
export function filterByDomain(
  chunks: RankedChunk[],
  domain: Domain,
  budget?: number,
): RankedChunk[] {
  const scored = chunks.map((chunk) => {
    const domainScores = scoreDomains(chunk.filePath, chunk.content);
    const match = domainScores.find((ds) => ds.domain === domain);
    return { chunk, domainMatchScore: match?.score ?? 0 };
  });

  // Stable sort: domain-matching chunks first (by domainMatchScore), then by
  // existing score for tie-breaking among non-matching chunks.
  scored.sort((a, b) => {
    if (b.domainMatchScore !== a.domainMatchScore) {
      return b.domainMatchScore - a.domainMatchScore;
    }
    return b.chunk.score - a.chunk.score;
  });

  const ordered = scored.map((s) => s.chunk);

  if (budget === undefined) return ordered;

  // Respect budget (token count)
  const result: RankedChunk[] = [];
  let remaining = budget;
  for (const chunk of ordered) {
    const tokens = chunk.tokenCount || Math.ceil(chunk.content.length / 4);
    if (remaining - tokens < 0) break;
    remaining -= tokens;
    result.push(chunk);
  }
  return result;
}

/**
 * Apply a domain boost to all chunks whose file path / content matches the
 * detected domain. The boost is ADDITIVE (+0.2) and the final score is clamped
 * to [0, 1].
 *
 * Returns a new array (does not mutate the input).
 */
export function applyDomainBoost(chunks: RankedChunk[], domain: Domain): RankedChunk[] {
  const DOMAIN_BOOST = 0.2;

  return chunks.map((chunk) => {
    const domainScores = scoreDomains(chunk.filePath, chunk.content);
    const topMatch = domainScores[0];

    if (topMatch?.domain === domain) {
      const boostedScore = Math.min(1.0, chunk.score + DOMAIN_BOOST);
      return {
        ...chunk,
        score: boostedScore,
        domainScore: topMatch.score,
      };
    }

    return { ...chunk, domainScore: 0 };
  });
}
