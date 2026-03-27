"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { ApiMapResult, EnrichedEndpoint } from "@/src/modules/api-map/analyzer";
import type { HttpMethod } from "@/src/modules/api-map/detector";
import { EndpointCard } from "./endpoint-card";
import { EndpointDetail } from "./endpoint-detail";

interface ApiMapViewProps {
  workspaceId: string;
  repoId: string;
}

const ALL_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-orange-600 dark:text-orange-400",
  PATCH: "text-yellow-600 dark:text-yellow-500",
  DELETE: "text-red-600 dark:text-red-400",
};

export function ApiMapView({ workspaceId, repoId }: ApiMapViewProps) {
  const [data, setData] = useState<ApiMapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethods, setSelectedMethods] = useState<Set<HttpMethod>>(
    new Set(ALL_METHODS),
  );
  const [authFilter, setAuthFilter] = useState<"all" | "auth" | "public">("all");
  const [selectedEndpoint, setSelectedEndpoint] = useState<EnrichedEndpoint | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch data
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/api-map`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        const result = (await res.json()) as ApiMapResult;
        if (!cancelled) {
          setData(result);
          // Auto-expand all groups initially
          setExpandedGroups(new Set(Object.keys(result.groupedByResource)));
          // Auto-select first endpoint
          const firstGroup = Object.values(result.groupedByResource)[0];
          if (firstGroup && firstGroup.length > 0) {
            setSelectedEndpoint(firstGroup[0]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load API map");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, repoId]);

  // Toggle method filter
  const toggleMethod = useCallback((method: HttpMethod) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size > 1) next.delete(method); // keep at least one
      } else {
        next.add(method);
      }
      return next;
    });
  }, []);

  // Toggle group collapse
  const toggleGroup = useCallback((resource: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) {
        next.delete(resource);
      } else {
        next.add(resource);
      }
      return next;
    });
  }, []);

  // Filtered + grouped endpoints
  const filteredGrouped = useMemo(() => {
    if (!data) return {};

    const result: Record<string, EnrichedEndpoint[]> = {};
    for (const [resource, endpoints] of Object.entries(data.groupedByResource)) {
      const filtered = endpoints.filter((ep) => {
        const matchesMethod = selectedMethods.has(ep.method as HttpMethod);
        const matchesAuth =
          authFilter === "all" ||
          (authFilter === "auth" && ep.authRequired) ||
          (authFilter === "public" && !ep.authRequired);
        const matchesSearch =
          !searchQuery ||
          ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (ep.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          ep.method.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesMethod && matchesAuth && matchesSearch;
      });
      if (filtered.length > 0) {
        result[resource] = filtered;
      }
    }
    return result;
  }, [data, selectedMethods, authFilter, searchQuery]);

  const totalVisible = useMemo(
    () => Object.values(filteredGrouped).reduce((acc, arr) => acc + arr.length, 0),
    [filteredGrouped],
  );

  const allEndpoints = useMemo(
    () => data?.endpoints ?? [],
    [data],
  );

  // ----- Loading state -----
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-500" />
          <p className="text-sm text-[var(--muted-foreground)]">
            Scanning repository for API endpoints…
          </p>
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Failed to load API map
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{error}</p>
        </div>
      </div>
    );
  }

  // ----- Empty state -----
  if (!data || data.totalEndpoints === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">
            No API endpoints detected
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            This repository does not appear to contain any detected API routes.
            Supported frameworks: Next.js App Router, Next.js Pages API, Express,
            FastAPI, Flask.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar: endpoint list ── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border)]">
        {/* Sidebar header */}
        <div className="shrink-0 border-b border-[var(--border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              API Surface
            </h2>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {totalVisible}/{data.totalEndpoints}
            </span>
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="Search endpoints…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Method filters */}
          <div className="mt-2 flex flex-wrap gap-1">
            {ALL_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => toggleMethod(method)}
                className={[
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity",
                  selectedMethods.has(method)
                    ? METHOD_COLORS[method] + " opacity-100"
                    : "opacity-30 text-[var(--muted-foreground)]",
                ].join(" ")}
              >
                {method}
              </button>
            ))}
          </div>

          {/* Auth filter */}
          <div className="mt-2 flex gap-1">
            {(["all", "auth", "public"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAuthFilter(f)}
                className={[
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  authFilter === f
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {f === "all" ? "All" : f === "auth" ? "Auth" : "Public"}
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint list */}
        <div className="flex-1 overflow-y-auto p-2">
          {Object.keys(filteredGrouped).length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-[var(--muted-foreground)]">
              No endpoints match filters
            </p>
          ) : (
            Object.entries(filteredGrouped).map(([resource, endpoints]) => (
              <div key={resource} className="mb-2">
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(resource)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:text-[var(--foreground)]"
                >
                  <span
                    className={[
                      "text-[10px] transition-transform",
                      expandedGroups.has(resource) ? "rotate-90" : "",
                    ].join(" ")}
                  >
                    ▶
                  </span>
                  <span className="flex-1 truncate font-mono text-[11px] font-semibold text-[var(--muted-foreground)]">
                    {resource}
                  </span>
                  <span className="shrink-0 rounded bg-[var(--muted)] px-1 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                    {endpoints.length}
                  </span>
                </button>

                {/* Endpoints in group */}
                {expandedGroups.has(resource) && (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-1">
                    {endpoints.map((ep) => (
                      <EndpointCard
                        key={ep.id}
                        endpoint={ep}
                        isSelected={selectedEndpoint?.id === ep.id}
                        onSelect={setSelectedEndpoint}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted-foreground)]">
          Framework: {data.framework}
          {data.cached && <span className="ml-2 text-green-600 dark:text-green-400">● cached</span>}
        </div>
      </div>

      {/* ── Right panel: endpoint detail ── */}
      <div className="flex-1 overflow-hidden">
        {selectedEndpoint ? (
          <EndpointDetail
            endpoint={selectedEndpoint}
            workspaceId={workspaceId}
            allEndpoints={allEndpoints}
            onSelectEndpoint={setSelectedEndpoint}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-[var(--muted-foreground)]">
              Select an endpoint to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
