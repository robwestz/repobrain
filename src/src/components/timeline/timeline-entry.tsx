"use client";

import { useState } from "react";
import type { TimelineEntry as TimelineEntryData } from "@/src/modules/git-timeline/service";

interface TimelineEntryProps {
  entry: TimelineEntryData;
  onFileClick: (path: string) => void;
  onSymbolClick: (symbolName: string) => void;
}

// ---------------------------------------------------------------------------
// Impact indicator helpers
// ---------------------------------------------------------------------------

const IMPACT_DOT: Record<string, string> = {
  minor: "bg-green-500",
  moderate: "bg-yellow-500",
  major: "bg-red-500",
};

const IMPACT_LABEL: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

const IMPACT_BADGE: Record<string, string> = {
  minor: "text-green-700 bg-green-50 ring-green-600/20 dark:text-green-400 dark:bg-green-950/30 dark:ring-green-500/20",
  moderate: "text-yellow-700 bg-yellow-50 ring-yellow-600/20 dark:text-yellow-400 dark:bg-yellow-950/30 dark:ring-yellow-500/20",
  major: "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-950/30 dark:ring-red-500/20",
};

// ---------------------------------------------------------------------------
// Tag colours (deterministic based on tag name)
// ---------------------------------------------------------------------------

const TAG_COLOURS: Record<string, string> = {
  feature: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  bugfix: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refactor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  docs: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  deps: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  security: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  auth: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  api: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  test: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  config: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  perf: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ui: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

function tagColour(tag: string): string {
  return TAG_COLOURS[tag] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimelineEntry({ entry, onFileClick, onSymbolClick }: TimelineEntryProps) {
  const [filesExpanded, setFilesExpanded] = useState(false);

  const dotColour = IMPACT_DOT[entry.impactLevel] ?? IMPACT_DOT.minor;
  const badgeColour = IMPACT_BADGE[entry.impactLevel] ?? IMPACT_BADGE.minor;

  return (
    <div className="rounded-lg border bg-[var(--card,white)] p-4 shadow-sm dark:bg-[var(--card,#1a1a2e)] transition-shadow hover:shadow-md">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: SHA + date + author */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-mono text-xs bg-[var(--muted,#f3f4f6)] px-1.5 py-0.5 rounded text-[var(--muted-foreground)] shrink-0">
            {entry.shortSha}
          </span>
          <span className="text-xs text-[var(--muted-foreground)] shrink-0">
            {formatDate(entry.date)} at {formatTime(entry.date)}
          </span>
          <span className="text-xs text-[var(--muted-foreground)] truncate">
            by <span className="font-medium">{entry.author}</span>
          </span>
        </div>

        {/* Right: impact badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset shrink-0 ${badgeColour}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotColour}`} />
          {IMPACT_LABEL[entry.impactLevel]}
        </span>
      </div>

      {/* Semantic summary */}
      <p className="mt-3 text-sm font-semibold leading-snug text-[var(--foreground)]">
        {entry.semanticSummary}
      </p>

      {/* Original commit message */}
      <p className="mt-1 text-xs text-[var(--muted-foreground)] leading-relaxed break-words">
        {entry.originalMessage}
      </p>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tagColour(tag)}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Affected symbols */}
      {entry.affectedSymbols.length > 0 && (
        <div className="mt-3">
          <span className="text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
            Symbols
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entry.affectedSymbols.map((sym) => (
              <button
                key={sym}
                onClick={() => onSymbolClick(sym)}
                className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Affected files (collapsible) */}
      {entry.affectedFiles.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setFilesExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wider hover:text-[var(--foreground)] transition-colors focus:outline-none"
          >
            <svg
              className={`h-3 w-3 shrink-0 transition-transform ${filesExpanded ? "rotate-90" : ""}`}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {entry.affectedFiles.length} file{entry.affectedFiles.length !== 1 ? "s" : ""}
          </button>

          {filesExpanded && (
            <ul className="mt-1.5 space-y-1">
              {entry.affectedFiles.map((f) => (
                <li key={f.path} className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => onFileClick(f.path)}
                    className="font-mono text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[60%] text-left focus:outline-none"
                    title={f.path}
                  >
                    {f.path}
                  </button>
                  <span className="text-green-600 dark:text-green-400 shrink-0">
                    +{f.additions}
                  </span>
                  <span className="text-red-600 dark:text-red-400 shrink-0">
                    -{f.deletions}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
