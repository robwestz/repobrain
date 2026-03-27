"use client";

import { useState, useCallback, useEffect } from "react";
import { PatternCard } from "./pattern-card";
import type { PatternMatch, PatternSummary } from "@/src/modules/patterns/detector";

interface PatternReportProps {
  workspaceId: string;
  repoId: string;
}

type TypeFilter = "all" | PatternMatch["patternType"];
type SeverityFilter = "all" | PatternMatch["severity"];

const SUMMARY_CARDS = [
  {
    key: "designPatterns" as keyof PatternSummary,
    label: "Design Patterns",
    color: "border-blue-500 text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950",
  },
  {
    key: "antiPatterns" as keyof PatternSummary,
    label: "Anti-Patterns",
    color: "border-orange-500 text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950",
  },
  {
    key: "inconsistencies" as keyof PatternSummary,
    label: "Inconsistencies",
    color: "border-yellow-500 text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950",
  },
  {
    key: "criticalCount" as keyof PatternSummary,
    label: "Critical Issues",
    color: "border-red-500 text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950",
  },
];

export function PatternReport({ workspaceId, repoId }: PatternReportProps) {
  const [patterns, setPatterns] = useState<PatternMatch[]>([]);
  const [summary, setSummary] = useState<PatternSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/patterns`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setPatterns(data.patterns ?? []);
      setSummary(data.summary ?? null);
      setCached(data.cached ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patterns");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, repoId]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const handleLocationClick = useCallback(
    (filePath: string, line: number) => {
      // Navigate to code viewer: workspace page with file path + line in hash
      const params = new URLSearchParams({ file: filePath, line: String(line) });
      window.location.href = `/workspace/${workspaceId}?${params.toString()}`;
    },
    [workspaceId],
  );

  const filteredPatterns = patterns.filter((p) => {
    if (typeFilter !== "all" && p.patternType !== typeFilter) return false;
    if (severityFilter !== "all" && p.severity !== severityFilter) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Page header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--foreground)]">Pattern Detective</h1>
            <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
              Automatically detected design patterns, anti-patterns, and inconsistencies
              {cached && (
                <span className="ml-2 text-xs text-[var(--muted-foreground)]">(cached)</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchPatterns}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? "animate-spin" : ""}
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {loading ? "Analysing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-1 items-center justify-center gap-3 p-12">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin text-[var(--muted-foreground)]"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-sm text-[var(--muted-foreground)]">
            Scanning codebase for patterns…
          </span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
          <h3 className="font-semibold text-red-700 dark:text-red-300">Analysis failed</h3>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={fetchPatterns}
            className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <div className="flex-1 overflow-auto p-6">
          {/* Summary cards */}
          {summary && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUMMARY_CARDS.map((card) => (
                <div
                  key={card.key}
                  className={`rounded-lg border-l-4 p-4 shadow-sm ${card.color} ${card.bg}`}
                >
                  <p className="text-2xl font-bold">{summary[card.key]}</p>
                  <p className="mt-0.5 text-xs font-medium opacity-80">{card.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Type:</span>
              {(
                [
                  ["all", "All"],
                  ["design-pattern", "Design Pattern"],
                  ["anti-pattern", "Anti-Pattern"],
                  ["inconsistency", "Inconsistency"],
                ] as [TypeFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTypeFilter(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    typeFilter === value
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Severity:</span>
              {(
                [
                  ["all", "All"],
                  ["info", "Info"],
                  ["warning", "Warning"],
                  ["critical", "Critical"],
                ] as [SeverityFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSeverityFilter(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    severityFilter === value
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-[var(--muted-foreground)]">
              Showing {filteredPatterns.length} of {patterns.length} findings
            </span>
          </div>

          {/* Pattern list */}
          {filteredPatterns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                {patterns.length === 0
                  ? "No patterns detected. The repository may not be fully indexed yet."
                  : "No patterns match the current filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onLocationClick={handleLocationClick}
                  defaultExpanded={pattern.severity === "critical"}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
