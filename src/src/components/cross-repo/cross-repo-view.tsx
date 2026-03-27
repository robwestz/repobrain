"use client";

import { useState, useCallback } from "react";

interface RepoInfo {
  id: string;
  name: string;
  owner: string;
  status: string;
}

interface CrossRepoRelation {
  fromRepo: string;
  toRepo: string;
  fromRepoId: string;
  toRepoId: string;
  relationType: string;
  fromFile: string;
  toFile: string;
  fromSymbol: string | null;
  toSymbol: string | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

interface RelationSummary {
  apiConsumer: number;
  sharedType: number;
  npmDependency: number;
  importPattern: number;
  sharedModule: number;
  totalRelations: number;
}

interface SearchResult {
  repoName: string;
  repoConnectionId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  relevanceScore: number;
}

interface CrossRepoViewProps {
  workspaceId: string;
  repos: RepoInfo[];
  initialRelations: CrossRepoRelation[];
  initialSummary: RelationSummary;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  indexing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  cloning: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const RELATION_COLORS: Record<string, string> = {
  "api-consumer": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "shared-type": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "npm-dependency": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "import-pattern": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "shared-module": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const RELATION_LABELS: Record<string, string> = {
  "api-consumer": "API Consumer",
  "shared-type": "Shared Type",
  "npm-dependency": "NPM Dependency",
  "import-pattern": "Import Pattern",
  "shared-module": "Shared Module",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-gray-500",
};

export function CrossRepoView({
  workspaceId,
  repos,
  initialRelations,
  initialSummary,
}: CrossRepoViewProps) {
  const [relations, setRelations] = useState<CrossRepoRelation[]>(initialRelations);
  const [summary, setSummary] = useState<RelationSummary>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [expandedRelation, setExpandedRelation] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"relations" | "search">("relations");
  const [filterType, setFilterType] = useState<string>("all");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const refreshRelations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/cross-repo/relations`);
      if (!res.ok) throw new Error("Failed to refresh");
      const data = await res.json() as { relations: CrossRepoRelation[]; summary: RelationSummary };
      setRelations(data.relations ?? []);
      setSummary(data.summary);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/cross-repo/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json() as { results: SearchResult[] };
      setSearchResults(data.results ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, workspaceId]);

  const filteredRelations =
    filterType === "all" ? relations : relations.filter((r) => r.relationType === filterType);

  const hasMultipleRepos = repos.length >= 2;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Cross-Repo Intelligence</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Understand how your repositories interact with each other
            </p>
          </div>
          {hasMultipleRepos && (
            <button
              onClick={refreshRelations}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
            >
              <svg
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loading ? "Analyzing…" : "Re-analyze"}
            </button>
          )}
        </div>

        {/* Connected Repos */}
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
            Connected Repositories ({repos.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <svg className="h-4 w-4 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium">{repo.owner}/{repo.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[repo.status] ?? STATUS_COLORS.pending}`}>
                  {repo.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!hasMultipleRepos ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border">
            <svg className="h-6 w-6 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="font-semibold">Connect a second repository</h3>
          <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
            Cross-repo intelligence requires at least two connected repositories. Connect another repo from the workspace page.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="shrink-0 border-b p-4">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[
                { key: "apiConsumer", label: "API Consumers", count: summary.apiConsumer, type: "api-consumer" },
                { key: "sharedType", label: "Shared Types", count: summary.sharedType, type: "shared-type" },
                { key: "npmDependency", label: "NPM Deps", count: summary.npmDependency, type: "npm-dependency" },
                { key: "importPattern", label: "Import Patterns", count: summary.importPattern, type: "import-pattern" },
                { key: "sharedModule", label: "Shared Modules", count: summary.sharedModule, type: "shared-module" },
              ].map(({ key, label, count, type }) => (
                <button
                  key={key}
                  onClick={() => {
                    setFilterType(filterType === type ? "all" : type);
                    setActiveTab("relations");
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-[var(--accent)] ${
                    filterType === type ? "border-[var(--primary)] bg-[var(--accent)]" : ""
                  }`}
                >
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex gap-1 border-b px-4 pt-2">
            <button
              onClick={() => setActiveTab("relations")}
              className={`border-b-2 px-3 pb-2 text-sm font-medium transition-colors ${
                activeTab === "relations"
                  ? "border-[var(--primary)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Relations ({relations.length})
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`border-b-2 px-3 pb-2 text-sm font-medium transition-colors ${
                activeTab === "search"
                  ? "border-[var(--primary)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Cross-Repo Search
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {activeTab === "relations" && (
              <div className="p-4">
                {/* Filter chips */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setFilterType("all")}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      filterType === "all"
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "hover:bg-[var(--accent)]"
                    }`}
                  >
                    All ({relations.length})
                  </button>
                  {Object.entries(RELATION_LABELS).map(([type, label]) => {
                    const count = relations.filter((r) => r.relationType === type).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={type}
                        onClick={() => setFilterType(filterType === type ? "all" : type)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          filterType === type
                            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                            : "hover:bg-[var(--accent)]"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                {filteredRelations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-[var(--muted-foreground)]">
                      {relations.length === 0
                        ? "No cross-repo relationships detected yet. Click Re-analyze to scan."
                        : "No relations match the selected filter."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredRelations.map((relation, i) => (
                      <div key={i} className="rounded-lg border overflow-hidden">
                        <button
                          className="flex w-full items-start gap-3 p-3 text-left hover:bg-[var(--accent)] transition-colors"
                          onClick={() => setExpandedRelation(expandedRelation === i ? null : i)}
                        >
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              RELATION_COLORS[relation.relationType] ?? "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {RELATION_LABELS[relation.relationType] ?? relation.relationType}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium truncate max-w-[120px]">{relation.fromRepo}</span>
                              <svg className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              <span className="font-medium truncate max-w-[120px]">{relation.toRepo}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--muted-foreground)] truncate">
                              {relation.fromFile}
                            </div>
                          </div>

                          <span
                            className={`shrink-0 text-xs font-medium ${CONFIDENCE_COLORS[relation.confidence] ?? ""}`}
                          >
                            {relation.confidence}
                          </span>

                          <svg
                            className={`h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                              expandedRelation === i ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {expandedRelation === i && (
                          <div className="border-t bg-[var(--muted)]/30 p-3">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">From</p>
                                <p className="font-medium">{relation.fromRepo}</p>
                                <p className="text-[var(--muted-foreground)]">{relation.fromFile}</p>
                                {relation.fromSymbol && (
                                  <p className="mt-0.5 font-mono text-[var(--muted-foreground)]">{relation.fromSymbol}</p>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">To</p>
                                <p className="font-medium">{relation.toRepo}</p>
                                <p className="text-[var(--muted-foreground)]">{relation.toFile}</p>
                                {relation.toSymbol && (
                                  <p className="mt-0.5 font-mono text-[var(--muted-foreground)]">{relation.toSymbol}</p>
                                )}
                              </div>
                            </div>
                            {relation.evidence && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">Evidence</p>
                                <p className="text-xs text-[var(--foreground)]">{relation.evidence}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "search" && (
              <div className="p-4">
                {/* Search bar */}
                <form onSubmit={handleSearch} className="mb-4 flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search across all repos… e.g. 'User type definition'"
                    className="flex-1 rounded-lg border bg-[var(--background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {searching ? "Searching…" : "Search"}
                  </button>
                </form>

                {searchError && (
                  <p className="mb-4 text-sm text-red-500">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    {searchResults.map((result, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                            {result.repoName}
                          </span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {result.filePath}
                            {result.startLine > 0 && ` · L${result.startLine}-${result.endLine}`}
                          </span>
                          <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                            {(result.relevanceScore * 100).toFixed(0)}% match
                          </span>
                        </div>
                        {result.symbolName && (
                          <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">
                            {result.symbolName}
                          </p>
                        )}
                        <pre className="overflow-x-auto rounded bg-[var(--muted)]/50 p-2 text-xs">
                          <code>{result.content.slice(0, 400)}{result.content.length > 400 ? "…" : ""}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {!searching && searchResults.length === 0 && searchQuery && !searchError && (
                  <p className="text-center text-sm text-[var(--muted-foreground)] py-8">
                    No results found across any connected repository.
                  </p>
                )}

                {!searchQuery && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Enter a query to search across all {repos.length} connected repositories simultaneously.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {["User type definition", "API endpoint authentication", "database connection"].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setSearchQuery(suggestion)}
                          className="rounded-full border px-3 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
