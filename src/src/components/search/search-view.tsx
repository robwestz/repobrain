"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SearchResultCard } from "./search-result-card";
import { INTENT_LABELS, INTENT_COLORS, type QueryIntent } from "@/src/modules/search/classifier";
import type { SearchResult, SearchResponse } from "@/src/modules/search/search-service";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchViewProps {
  workspaceId: string;
  repoId: string;
  /** Called when user clicks a result to open the file in the code viewer */
  onFileOpen?: (filePath: string, line: number) => void;
}

// ---------------------------------------------------------------------------
// Skeleton card placeholder
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden animate-pulse">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-48 rounded bg-[var(--muted)]" />
          <div className="h-2.5 w-72 rounded bg-[var(--muted)] opacity-60" />
        </div>
        <div className="h-5 w-20 rounded-full bg-[var(--muted)]" />
      </div>
      <div className="p-3">
        <div className="rounded-md h-28 bg-[var(--muted)]" />
      </div>
      <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)]">
        <div className="h-1.5 flex-1 rounded-full bg-[var(--muted)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language options
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS = [
  { value: "", label: "All languages" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
];

// ---------------------------------------------------------------------------
// Suggested example queries
// ---------------------------------------------------------------------------

const EXAMPLE_QUERIES = [
  "find all error handlers",
  "where is the authentication middleware defined",
  "which functions don't have error handling",
  "where is the database connection configured",
  "find all API route handlers",
  "show me all class definitions",
];

// ---------------------------------------------------------------------------
// SearchView
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export function SearchView({ workspaceId, repoId, onFileOpen }: SearchViewProps) {
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [fileFilter, setFileFilter] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination: accumulated results
  const [displayedResults, setDisplayedResults] = useState<SearchResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K focuses the search input
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Search execution
  // ---------------------------------------------------------------------------

  const executeSearch = useCallback(
    async (searchQuery: string, searchOffset: number, append: boolean) => {
      if (!searchQuery.trim()) return;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
        setResponse(null);
        setDisplayedResults([]);
        setOffset(0);
      }

      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: searchQuery,
              limit: PAGE_SIZE,
              offset: searchOffset,
              fileFilter: fileFilter.trim() || undefined,
              languageFilter: languageFilter || undefined,
            }),
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Search failed");
        }

        const data: SearchResponse = await res.json();

        if (append) {
          setDisplayedResults((prev) => [...prev, ...data.results]);
          setOffset(searchOffset + data.results.length);
        } else {
          setDisplayedResults(data.results);
          setOffset(data.results.length);
          setResponse(data);
        }

        // Keep the response meta updated for both initial and load-more
        setResponse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [workspaceId, repoId, fileFilter, languageFilter],
  );

  const handleSearch = useCallback(() => {
    executeSearch(query, 0, false);
  }, [query, executeSearch]);

  const handleLoadMore = useCallback(() => {
    executeSearch(query, offset, true);
  }, [query, offset, executeSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    executeSearch(example, 0, false);
  };

  const handleFileClick = useCallback(
    (filePath: string, line: number) => {
      if (onFileOpen) {
        onFileOpen(filePath, line);
      }
    },
    [onFileOpen],
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasMore =
    response !== null && displayedResults.length < response.totalResults;

  const intentLabel =
    response?.intent ? INTENT_LABELS[response.intent as QueryIntent] : null;
  const intentColor =
    response?.intent ? INTENT_COLORS[response.intent as QueryIntent] : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header bar ── */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-6 py-4">
        <div className="mx-auto max-w-4xl">
          {/* Title row */}
          <div className="mb-4 flex items-center gap-2">
            <a
              href={`/workspace/${workspaceId}`}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              ← Workspace
            </a>
            <span className="text-[var(--muted-foreground)]">/</span>
            <h1 className="text-sm font-semibold">Code Search</h1>
            <span className="ml-auto text-[10px] text-[var(--muted-foreground)] hidden sm:block">
              Press <kbd className="rounded border px-1 font-mono text-[10px]">⌘K</kbd> to focus
            </span>
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your code in natural language…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 pr-10 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setResponse(null); setError(null); setDisplayedResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg leading-none"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "…" : "Search"}
            </button>
          </div>

          {/* Intent pill */}
          {intentLabel && intentColor && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${intentColor}`}
              >
                {intentLabel}
              </span>
              {response && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  {response.totalResults} result{response.totalResults !== 1 ? "s" : ""} in {response.durationMs}ms
                </span>
              )}
            </div>
          )}

          {/* Filters row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              placeholder="File path filter (e.g. *.ts, src/api/**)"
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500/50 w-56"
            />
          </div>
        </div>
      </div>

      {/* ── Results area ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">

          {/* Loading skeletons */}
          {isLoading && (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Search failed</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{error}</p>
              <button
                type="button"
                onClick={handleSearch}
                className="mt-3 text-xs text-blue-500 hover:text-blue-400 underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state — no query yet */}
          {!isLoading && !error && !response && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 select-none">🔍</div>
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-2">
                Search your codebase
              </h2>
              <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-8">
                Ask questions about your code in plain English. Try searching for
                functions, patterns, or specific behaviours.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {EXAMPLE_QUERIES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleExampleClick(example)}
                    className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty results */}
          {!isLoading && !error && response && displayedResults.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 select-none">🌫️</div>
              <h2 className="text-base font-semibold mb-2">No results found</h2>
              <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
                No code matches your query. Try rephrasing or broadening your search.
              </p>
              {response.suggestions && response.suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">Suggestions:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {response.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          // Extract actual query from "Try: '...'" pattern
                          const match = s.match(/['"]([^'"]+)['"]/);
                          const suggested = match ? match[1] : s;
                          setQuery(suggested);
                          executeSearch(suggested, 0, false);
                        }}
                        className="rounded-full border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results list */}
          {!isLoading && displayedResults.length > 0 && (
            <div className="space-y-4">
              {displayedResults.map((result, i) => (
                <SearchResultCard
                  key={`${result.filePath}:${result.startLine}:${i}`}
                  result={result}
                  onFileClick={handleFileClick}
                />
              ))}

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="rounded-xl border border-[var(--border)] px-6 py-2.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoadingMore ? "Loading…" : `Load more (${response!.totalResults - displayedResults.length} remaining)`}
                  </button>
                </div>
              )}

              {/* End of results */}
              {!hasMore && displayedResults.length > 0 && (
                <p className="text-center text-xs text-[var(--muted-foreground)] pt-4">
                  All {response?.totalResults ?? displayedResults.length} result{(response?.totalResults ?? displayedResults.length) !== 1 ? "s" : ""} shown
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
