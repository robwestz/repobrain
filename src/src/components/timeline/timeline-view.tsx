"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TimelineEntry } from "./timeline-entry";
import type { TimelineEntry as TimelineEntryData } from "@/src/modules/git-timeline/service";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimelineViewProps {
  workspaceId: string;
  repoId: string;
  initialFilePath?: string;
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

type ImpactLevel = "minor" | "moderate" | "major";

interface Filters {
  impactLevels: Set<ImpactLevel>;
  tags: Set<string>;
  since: string;
  until: string;
  file: string;
}

const ALL_IMPACT_LEVELS: ImpactLevel[] = ["minor", "moderate", "major"];

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonEntry() {
  return (
    <div className="rounded-lg border bg-white dark:bg-gray-900 p-4 shadow-sm animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mt-3 h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-14 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag pill used in filter bar
// ---------------------------------------------------------------------------

const ALL_TAGS = [
  "feature", "bugfix", "refactor", "docs", "deps",
  "security", "auth", "api", "test", "config", "perf", "ui",
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TimelineView({ workspaceId, repoId, initialFilePath }: TimelineViewProps) {
  const router = useRouter();

  // All loaded entries (accumulated across "load more")
  const [entries, setEntries] = useState<TimelineEntryData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0); // 0 = first load
  const pageSize = 50;

  // Filters
  const [filters, setFilters] = useState<Filters>({
    impactLevels: new Set(ALL_IMPACT_LEVELS),
    tags: new Set<string>(),
    since: "",
    until: "",
    file: initialFilePath ?? "",
  });

  // Track if we've applied the initial file filter
  const initialised = useRef(false);

  // ---------------------------------------------------------------------------
  // Fetch entries
  // ---------------------------------------------------------------------------

  const fetchEntries = useCallback(
    async (append: boolean, currentFilters: Filters, offset: number) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        if (currentFilters.since) params.set("since", currentFilters.since);
        if (currentFilters.file) params.set("file", currentFilters.file);

        const url = `/api/workspaces/${workspaceId}/repos/${repoId}/timeline?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }

        const data = await res.json() as {
          entries: TimelineEntryData[];
          total: number;
          cached: boolean;
        };

        if (append) {
          // Pagination: skip already-loaded items client-side
          const newEntries = data.entries.slice(offset);
          setEntries((prev) => [...prev, ...newEntries]);
        } else {
          setEntries(data.entries);
        }

        setTotal(data.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load timeline");
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, repoId],
  );

  // Initial load
  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      fetchEntries(false, filters, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when filters change (reset pagination)
  const applyFilters = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      setPage(0);
      setEntries([]);
      fetchEntries(false, newFilters, 0);
    },
    [fetchEntries],
  );

  // Load more
  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEntries(true, filters, nextPage * pageSize);
  }, [page, filters, fetchEntries]);

  // ---------------------------------------------------------------------------
  // Filter helpers
  // ---------------------------------------------------------------------------

  const toggleImpact = (level: ImpactLevel) => {
    const next = new Set(filters.impactLevels);
    if (next.has(level)) {
      if (next.size > 1) next.delete(level); // keep at least one
    } else {
      next.add(level);
    }
    applyFilters({ ...filters, impactLevels: next });
  };

  const toggleTag = (tag: string) => {
    const next = new Set(filters.tags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    applyFilters({ ...filters, tags: next });
  };

  const handleSinceChange = (value: string) => {
    applyFilters({ ...filters, since: value });
  };

  const handleFileChange = (value: string) => {
    applyFilters({ ...filters, file: value });
    // Also update URL query param
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set("file", value);
    } else {
      url.searchParams.delete("file");
    }
    router.replace(url.pathname + url.search);
  };

  // ---------------------------------------------------------------------------
  // Client-side filtering (impact + tags — these aren't sent to API)
  // ---------------------------------------------------------------------------

  const visibleEntries = entries.filter((e) => {
    if (!filters.impactLevels.has(e.impactLevel as ImpactLevel)) return false;
    if (filters.tags.size > 0) {
      const hasTag = e.tags.some((t) => filters.tags.has(t));
      if (!hasTag) return false;
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Navigation callbacks
  // ---------------------------------------------------------------------------

  const handleFileClick = (path: string) => {
    router.push(`/workspace/${workspaceId}?file=${encodeURIComponent(path)}`);
  };

  const handleSymbolClick = (symbolName: string) => {
    router.push(`/workspace/${workspaceId}?symbol=${encodeURIComponent(symbolName)}`);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasMore = entries.length < total;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-semibold">Git Timeline</h1>
            <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
              AI-summarized history of changes
              {total > 0 && (
                <span className="ml-1 text-[var(--muted-foreground)]">
                  — {total} commit{total !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <a
            href={`/workspace/${workspaceId}`}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Back to workspace
          </a>
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 border-b bg-[var(--muted,#f8f9fa)] dark:bg-gray-900/50 px-6 py-3 space-y-3">
        {/* Row 1: impact + tags */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Impact level checkboxes */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Impact
            </span>
            {ALL_IMPACT_LEVELS.map((level) => (
              <label key={level} className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.impactLevels.has(level)}
                  onChange={() => toggleImpact(level)}
                  className="rounded"
                />
                <span className="text-xs capitalize">{level}</span>
              </label>
            ))}
          </div>

          {/* Tag pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mr-1">
              Tags
            </span>
            {ALL_TAGS.map((tag) => {
              const active = filters.tags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none ${
                    active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: date range + file filter */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Since
            </label>
            <input
              type="date"
              value={filters.since}
              onChange={(e) => handleSinceChange(e.target.value)}
              className="rounded border px-2 py-1 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
            <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider shrink-0">
              File
            </label>
            <input
              type="text"
              value={filters.file}
              onChange={(e) => handleFileChange(e.target.value)}
              placeholder="src/lib/auth.ts"
              className="flex-1 rounded border px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {filters.file && (
              <button
                onClick={() => handleFileChange("")}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm leading-none focus:outline-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Timeline entries */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="space-y-4 max-w-3xl mx-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonEntry key={i} />
            ))}
          </div>
        )}

        {!loading && !error && visibleEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[var(--muted-foreground)]">
              {entries.length === 0
                ? "No commits found"
                : "No commits match the current filters"}
            </p>
          </div>
        )}

        {visibleEntries.length > 0 && (
          <div className="relative max-w-3xl mx-auto">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[calc(50%-1px)] top-0 bottom-0 w-0.5 bg-[var(--border)] pointer-events-none"
              aria-hidden
            />

            <div className="space-y-6">
              {visibleEntries.map((entry, idx) => {
                const isLeft = idx % 2 === 0;
                return (
                  <div key={entry.id} className="relative flex items-start">
                    {/* Dot on the timeline */}
                    <div
                      className="absolute left-[calc(50%-6px)] top-5 z-10 h-3 w-3 rounded-full border-2 border-white dark:border-gray-950 bg-[var(--muted-foreground)]"
                      aria-hidden
                    />

                    {/* Left side */}
                    <div className={`w-[calc(50%-20px)] ${isLeft ? "" : "invisible"}`}>
                      {isLeft && (
                        <TimelineEntry
                          entry={entry}
                          onFileClick={handleFileClick}
                          onSymbolClick={handleSymbolClick}
                        />
                      )}
                    </div>

                    {/* Spacer */}
                    <div className="w-10 shrink-0" aria-hidden />

                    {/* Right side */}
                    <div className={`w-[calc(50%-20px)] ${!isLeft ? "" : "invisible"}`}>
                      {!isLeft && (
                        <TimelineEntry
                          entry={entry}
                          onFileClick={handleFileClick}
                          onSymbolClick={handleSymbolClick}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more / loading indicator */}
            {loading && entries.length > 0 && (
              <div className="mt-8 text-center">
                <span className="text-sm text-[var(--muted-foreground)]">Loading more…</span>
              </div>
            )}

            {!loading && hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  className="rounded-lg border px-6 py-2 text-sm transition-colors hover:bg-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Load more ({total - entries.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
