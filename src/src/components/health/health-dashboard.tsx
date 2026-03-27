"use client";

import { useState, useMemo, useCallback } from "react";
import { HealthScoreBadge, getScoreColorRgb } from "./health-score-badge";
import { LanguageBreakdown, LanguageTable } from "./language-breakdown";
import type { RepoHealth, FileHealth } from "@/src/modules/health/metrics";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthDashboardProps {
  workspaceId: string;
  repoId: string;
  initialData: RepoHealth;
}

// ---------------------------------------------------------------------------
// Treemap
// ---------------------------------------------------------------------------

interface TreemapCellProps {
  file: FileHealth;
  totalLines: number;
  onNavigate: (filePath: string) => void;
}

function TreemapCell({ file, totalLines, onNavigate }: TreemapCellProps) {
  const [hovered, setHovered] = useState(false);
  const pct = totalLines > 0 ? (file.metrics.lineCount / totalLines) * 100 : 0;
  const bgColor = getScoreColorRgb(file.healthScore);
  const filename = file.filePath.split("/").pop() ?? file.filePath;

  // Minimum 0.5% width so tiny files are still visible
  const widthPct = Math.max(0.5, pct);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${file.filePath} — score ${file.healthScore}`}
      onClick={() => onNavigate(file.filePath)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate(file.filePath); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: `${widthPct}%`,
        backgroundColor: bgColor,
        opacity: hovered ? 0.85 : 1,
        minWidth: 4,
        minHeight: 40,
        position: "relative",
        flexGrow: widthPct,
        flexShrink: 0,
        flexBasis: `${widthPct}%`,
      }}
      className="cursor-pointer overflow-hidden border border-white/10 transition-opacity"
    >
      {/* Tooltip */}
      {hovered && (
        <div
          style={{ zIndex: 50 }}
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full mb-1 rounded bg-[var(--popover)] border border-[var(--border)] px-2 py-1 text-xs shadow-lg whitespace-nowrap"
        >
          <div className="font-medium truncate max-w-[200px]">{file.filePath}</div>
          <div className="text-[var(--muted-foreground)]">
            Score: {file.healthScore} · {file.metrics.lineCount} lines
          </div>
          {file.issues.length > 0 && (
            <div className="text-[var(--muted-foreground)] mt-0.5">
              {file.issues[0]}
            </div>
          )}
        </div>
      )}
      {/* Label (only if wide enough) */}
      {widthPct > 3 && (
        <span className="absolute inset-0 flex items-center justify-center px-1 text-white/90 text-[10px] font-medium overflow-hidden truncate leading-tight">
          {filename}
        </span>
      )}
    </div>
  );
}

function Treemap({
  files,
  onNavigate,
}: {
  files: FileHealth[];
  onNavigate: (filePath: string) => void;
}) {
  // Sort by line count descending (larger = wider cell)
  const sorted = useMemo(
    () => [...files].sort((a, b) => b.metrics.lineCount - a.metrics.lineCount).slice(0, 150),
    [files],
  );
  const totalLines = useMemo(
    () => sorted.reduce((sum, f) => sum + f.metrics.lineCount, 0),
    [sorted],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-[var(--muted-foreground)]">
        No files to display
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap w-full rounded overflow-hidden"
      style={{ minHeight: 80, maxHeight: 200 }}
      aria-label="File health treemap"
    >
      {sorted.map((file) => (
        <TreemapCell
          key={file.fileId}
          file={file}
          totalLines={totalLines}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview cards
// ---------------------------------------------------------------------------

type SortKey = "healthScore" | "filePath" | "language" | "lineCount" | "symbolCount" | "complexity" | "coupling";
type SortDir = "asc" | "desc";

function OverviewCards({ health }: { health: RepoHealth }) {
  const scoreColor =
    health.overallScore > 70
      ? "text-green-600 dark:text-green-400"
      : health.overallScore > 40
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Overall score */}
      <div className="rounded-lg border p-4">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Overall Health</div>
        <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
          {health.overallScore}
          <span className="text-lg font-normal text-[var(--muted-foreground)]">/100</span>
        </div>
      </div>

      {/* Files / Symbols */}
      <div className="rounded-lg border p-4">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Codebase Size</div>
        <div className="text-2xl font-bold tabular-nums">{health.fileCount.toLocaleString()}</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
          files · {health.totalSymbols.toLocaleString()} symbols
        </div>
      </div>

      {/* Avg Complexity */}
      <div className="rounded-lg border p-4">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Avg Complexity</div>
        <div className="text-2xl font-bold tabular-nums">
          {health.metrics.avgComplexity.toFixed(1)}
        </div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
          per file
        </div>
      </div>

      {/* Coupling distribution */}
      <div className="rounded-lg border p-4">
        <div className="text-xs text-[var(--muted-foreground)] mb-1">Avg Instability</div>
        <div className="text-2xl font-bold tabular-nums">
          {(health.metrics.avgCoupling * 100).toFixed(0)}
          <span className="text-lg font-normal text-[var(--muted-foreground)]">%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${Math.min(100, health.metrics.avgCoupling * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File table
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function FileTable({
  files,
  onNavigate,
}: {
  files: FileHealth[];
  onNavigate: (filePath: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("healthScore");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortKey],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.filePath.toLowerCase().includes(q) ||
        (f.language ?? "").toLowerCase().includes(q),
    );
  }, [files, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortKey) {
        case "filePath": va = a.filePath; vb = b.filePath; break;
        case "language": va = a.language ?? ""; vb = b.language ?? ""; break;
        case "lineCount": va = a.metrics.lineCount; vb = b.metrics.lineCount; break;
        case "symbolCount": va = a.metrics.symbolCount; vb = b.metrics.symbolCount; break;
        case "complexity": va = a.metrics.complexity; vb = b.metrics.complexity; break;
        case "coupling": va = a.metrics.coupling.instability; vb = b.metrics.coupling.instability; break;
        case "healthScore":
        default: va = a.healthScore; vb = b.healthScore; break;
      }
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--foreground)] whitespace-nowrap";

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="search"
        placeholder="Filter by file path or language…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--ring)]"
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-[var(--muted)]/30">
            <tr>
              <th className={thClass} onClick={() => handleSort("filePath")}>
                File <SortIcon col="filePath" />
              </th>
              <th className={thClass} onClick={() => handleSort("language")}>
                Language <SortIcon col="language" />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("lineCount")}>
                Lines <SortIcon col="lineCount" />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("symbolCount")}>
                Symbols <SortIcon col="symbolCount" />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("complexity")}>
                Complexity <SortIcon col="complexity" />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("coupling")}>
                Instability <SortIcon col="coupling" />
              </th>
              <th className={`${thClass} text-right`} onClick={() => handleSort("healthScore")}>
                Score <SortIcon col="healthScore" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                  No files match the search filter.
                </td>
              </tr>
            ) : (
              paged.map((file) => (
                <tr
                  key={file.fileId}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)] cursor-pointer transition-colors"
                  onClick={() => onNavigate(file.filePath)}
                >
                  <td className="px-3 py-2 font-mono text-xs max-w-[300px] truncate" title={file.filePath}>
                    {file.filePath}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)] capitalize">
                    {file.language ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {file.metrics.lineCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {file.metrics.symbolCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {file.metrics.complexity.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(file.metrics.coupling.instability * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    <HealthScoreBadge score={file.healthScore} size="sm" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>
            {sorted.length} files · page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-[var(--accent)] transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-[var(--accent)] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotspots section
// ---------------------------------------------------------------------------

function HotspotList({
  files,
  label,
  onNavigate,
}: {
  files: FileHealth[];
  label: string;
  onNavigate: (filePath: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="space-y-1">
        {files.map((file) => (
          <div
            key={file.fileId}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(file.filePath)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate(file.filePath); }}
            className="flex items-center justify-between rounded border px-3 py-2 hover:bg-[var(--accent)] cursor-pointer transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs truncate" title={file.filePath}>
                {file.filePath}
              </div>
              {file.issues.length > 0 && (
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {file.issues.slice(0, 2).join(" · ")}
                </div>
              )}
            </div>
            <HealthScoreBadge score={file.healthScore} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function HealthDashboard({ workspaceId, repoId, initialData }: HealthDashboardProps) {
  const [health] = useState<RepoHealth>(initialData);
  const [activeTab, setActiveTab] = useState<"treemap" | "table">("treemap");

  const handleNavigate = useCallback(
    (filePath: string) => {
      // Navigate back to workspace and open the file in the code viewer.
      // We pass the file path as a query param; the workspace page can consume it.
      const url = new URL(`/workspace/${workspaceId}`, window.location.origin);
      url.searchParams.set("file", filePath);
      url.searchParams.set("repo", repoId);
      window.location.href = url.toString();
    },
    [workspaceId, repoId],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <a href={`/workspace/${workspaceId}`} className="text-sm hover:opacity-70 transition-opacity">
            ← Workspace
          </a>
          <span className="text-[var(--muted-foreground)]">/</span>
          <span className="font-semibold text-sm">Code Health</span>
        </div>
        <HealthScoreBadge score={health.overallScore} size="lg" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Overview cards */}
        <section>
          <OverviewCards health={health} />
        </section>

        {/* Language breakdown */}
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Language Distribution</h2>
          <LanguageBreakdown languages={health.languageBreakdown} />
        </section>

        {/* Treemap / Table tabs */}
        <section className="rounded-lg border overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab("treemap")}
              className={[
                "px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "treemap"
                  ? "bg-[var(--background)] border-b-2 border-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              Treemap
            </button>
            <button
              onClick={() => setActiveTab("table")}
              className={[
                "px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "table"
                  ? "bg-[var(--background)] border-b-2 border-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              File Table
            </button>
          </div>

          <div className="p-4">
            {activeTab === "treemap" ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--muted-foreground)]">
                  Width = file size (lines). Colour: green = healthy, yellow = moderate, red = needs attention. Click to open.
                </p>
                <Treemap files={health.allFiles} onNavigate={handleNavigate} />
              </div>
            ) : (
              <FileTable files={health.allFiles} onNavigate={handleNavigate} />
            )}
          </div>
        </section>

        {/* Hotspots + Best files */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border p-4">
            <HotspotList
              files={health.hotspots}
              label="Worst Files (Hotspots)"
              onNavigate={handleNavigate}
            />
          </section>
          <section className="rounded-lg border p-4">
            <HotspotList
              files={health.bestFiles}
              label="Healthiest Files"
              onNavigate={handleNavigate}
            />
          </section>
        </div>

        {/* Language details table */}
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Languages</h2>
          <LanguageTable languages={health.languageBreakdown} />
        </section>
      </div>
    </div>
  );
}
