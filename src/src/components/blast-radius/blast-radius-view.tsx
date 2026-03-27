"use client";

import { useState, useCallback } from "react";
import { SymbolSearch, type SymbolResult } from "./symbol-search";
import { ImpactVisualization, FileHeatmap } from "./impact-visualization";
import type { BlastRadiusResult, ImpactNode } from "@/src/modules/blast-radius/analyzer";

interface BlastRadiusViewProps {
  workspaceId: string;
  repoConnectionId: string;
}

type SortField = "symbolName" | "filePath" | "impactLevel" | "riskScore" | "depth";
type SortDir = "asc" | "desc";
type FilterLevel = "all" | "direct" | "indirect" | "transitive";
type ViewMode = "sunburst" | "treemap";

const IMPACT_LEVEL_ORDER: Record<ImpactNode["impactLevel"], number> = {
  direct: 1,
  indirect: 2,
  transitive: 3,
};

const LEVEL_BADGE: Record<ImpactNode["impactLevel"], string> = {
  direct: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  indirect: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
  transitive: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400",
};

export function BlastRadiusView({ workspaceId, repoConnectionId }: BlastRadiusViewProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolResult | null>(null);
  const [depth, setDepth] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BlastRadiusResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("sunburst");

  // Table state
  const [sortField, setSortField] = useState<SortField>("riskScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterLevel, setFilterLevel] = useState<FilterLevel>("all");

  const handleAnalyze = useCallback(async () => {
    if (!selectedSymbol) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoConnectionId}/blast-radius`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbolId: selectedSymbol.id,
            maxDepth: depth,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Analysis failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol, depth, workspaceId, repoConnectionId]);

  // Sort + filter impacted nodes for the table
  const tableNodes = (() => {
    if (!result) return [];
    let nodes =
      filterLevel === "all"
        ? result.impactedNodes
        : result.impactedNodes.filter((n) => n.impactLevel === filterLevel);

    nodes = [...nodes].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "symbolName":
          cmp = a.symbolName.localeCompare(b.symbolName);
          break;
        case "filePath":
          cmp = a.filePath.localeCompare(b.filePath);
          break;
        case "impactLevel":
          cmp = IMPACT_LEVEL_ORDER[a.impactLevel] - IMPACT_LEVEL_ORDER[b.impactLevel];
          break;
        case "riskScore":
          cmp = a.riskScore - b.riskScore;
          break;
        case "depth":
          cmp = a.depth - b.depth;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return nodes;
  })();

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return (
        <span className="ml-1 opacity-30">
          <svg className="inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 12V8m0 0l4 4m-4-4l-4 4" />
          </svg>
        </span>
      );
    }
    return (
      <span className="ml-1 text-[var(--foreground)]">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  function navigateToSymbol(node: ImpactNode) {
    const encoded = node.filePath.split("/").map(encodeURIComponent).join("/");
    window.location.href = `/workspace/${workspaceId}?file=${encoded}&line=${node.startLine}`;
  }

  function riskBadgeClass(score: number): string {
    if (score >= 70) return "text-red-600 dark:text-red-400 font-bold";
    if (score >= 50) return "text-orange-600 dark:text-orange-400 font-semibold";
    return "text-yellow-600 dark:text-yellow-400";
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold">Blast Radius Analysis</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Select a symbol to see all downstream dependents and their risk scores.
        </p>
      </div>

      {/* Target selector */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Target Symbol
            </label>
            <SymbolSearch
              repoConnectionId={repoConnectionId}
              workspaceId={workspaceId}
              onSelect={setSelectedSymbol}
            />
          </div>

          <div className="sm:w-48">
            <label className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Max Depth: {depth}
            </label>
            <input
              type="range"
              min={1}
              max={6}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full accent-red-500"
            />
            <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
              <span>1</span>
              <span>6</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedSymbol || loading}
            className="shrink-0 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>

        {/* Selected symbol pill */}
        {selectedSymbol && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Target:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              <span className="font-mono">{selectedSymbol.name}</span>
              <span className="opacity-60">({selectedSymbol.kind})</span>
              <span className="opacity-50 truncate max-w-32" title={selectedSymbol.filePath}>
                in {selectedSymbol.filePath.split("/").slice(-2).join("/")}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Traversing dependency graph…
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 flex flex-col gap-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="Direct Impacts"
              value={result.summary.directCount}
              color="text-red-600 dark:text-red-400"
              bgColor="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            />
            <SummaryCard
              label="Indirect Impacts"
              value={result.summary.indirectCount}
              color="text-orange-600 dark:text-orange-400"
              bgColor="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
            />
            <SummaryCard
              label="Transitive Impacts"
              value={result.summary.transitiveCount}
              color="text-yellow-600 dark:text-yellow-400"
              bgColor="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
            />
            <SummaryCard
              label="Files Affected"
              value={result.summary.totalFiles}
              color="text-[var(--foreground)]"
              bgColor="bg-[var(--card)] border-[var(--border)]"
              badge={result.summary.highRiskCount > 0 ? `${result.summary.highRiskCount} high risk` : undefined}
            />
          </div>

          {/* Visualization section */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Impact Map</h2>
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("sunburst")}
                  className={`px-3 py-1.5 transition-colors ${viewMode === "sunburst" ? "bg-[var(--accent)] font-medium" : "hover:bg-[var(--accent)]/50"}`}
                >
                  Sunburst
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("treemap")}
                  className={`px-3 py-1.5 transition-colors ${viewMode === "treemap" ? "bg-[var(--accent)] font-medium" : "hover:bg-[var(--accent)]/50"}`}
                >
                  File View
                </button>
              </div>
            </div>

            {viewMode === "sunburst" ? (
              <ImpactVisualization
                result={result}
                workspaceId={workspaceId}
              />
            ) : (
              <FileHeatmap result={result} workspaceId={workspaceId} />
            )}
          </div>

          {/* Impact table */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-semibold">
                Impacted Symbols{" "}
                <span className="text-sm font-normal text-[var(--muted-foreground)]">
                  ({tableNodes.length})
                </span>
              </h2>
              {/* Level filter */}
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                {(["all", "direct", "indirect", "transitive"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFilterLevel(level)}
                    className={`px-2.5 py-1.5 capitalize transition-colors ${filterLevel === level ? "bg-[var(--accent)] font-medium" : "hover:bg-[var(--accent)]/50"}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-[var(--muted)]/30 text-[var(--muted-foreground)]">
                    <th className="px-4 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("symbolName")}
                        className="hover:text-[var(--foreground)]"
                      >
                        Symbol <SortIcon field="symbolName" />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left">Kind</th>
                    <th className="px-4 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("filePath")}
                        className="hover:text-[var(--foreground)]"
                      >
                        File <SortIcon field="filePath" />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("impactLevel")}
                        className="hover:text-[var(--foreground)]"
                      >
                        Impact <SortIcon field="impactLevel" />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("riskScore")}
                        className="hover:text-[var(--foreground)]"
                      >
                        Risk <SortIcon field="riskScore" />
                      </button>
                    </th>
                    <th className="px-4 py-2 text-left">Relation Path</th>
                  </tr>
                </thead>
                <tbody>
                  {tableNodes.map((node) => (
                    <tr
                      key={node.symbolId}
                      className="group border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--accent)]/40 cursor-pointer transition-colors"
                      onClick={() => navigateToSymbol(node)}
                    >
                      <td className="px-4 py-2 font-mono font-medium group-hover:text-red-600 dark:group-hover:text-red-400">
                        {node.symbolName}
                      </td>
                      <td className="px-4 py-2 text-[var(--muted-foreground)] capitalize">
                        {node.symbolKind}
                      </td>
                      <td
                        className="px-4 py-2 text-[var(--muted-foreground)] truncate max-w-48"
                        title={node.filePath}
                      >
                        {node.filePath.split("/").slice(-2).join("/")}:{node.startLine}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide capitalize ${LEVEL_BADGE[node.impactLevel]}`}
                        >
                          {node.impactLevel}
                        </span>
                      </td>
                      <td className={`px-4 py-2 ${riskBadgeClass(node.riskScore)}`}>
                        {node.riskScore}
                      </td>
                      <td className="px-4 py-2 text-[var(--muted-foreground)] font-mono max-w-48 truncate" title={node.relationPath.join(" → ")}>
                        {node.relationPath.join(" → ")}
                      </td>
                    </tr>
                  ))}
                  {tableNodes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[var(--muted-foreground)]">
                        No impacts at this level
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card sub-component
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  color,
  bgColor,
  badge,
}: {
  label: string;
  value: number;
  color: string;
  bgColor: string;
  badge?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${bgColor}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      {badge && (
        <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{badge}</div>
      )}
    </div>
  );
}
