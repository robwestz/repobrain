"use client";

import { useState } from "react";
import type { PatternMatch } from "@/src/modules/patterns/detector";

export interface PatternCardProps {
  pattern: PatternMatch;
  onLocationClick: (filePath: string, line: number) => void;
  defaultExpanded?: boolean;
}

const TYPE_LABELS: Record<PatternMatch["patternType"], string> = {
  "design-pattern": "Design Pattern",
  "anti-pattern": "Anti-Pattern",
  "inconsistency": "Inconsistency",
};

const TYPE_STYLES: Record<PatternMatch["patternType"], string> = {
  "design-pattern": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "anti-pattern": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "inconsistency": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const SEVERITY_STYLES: Record<PatternMatch["severity"], string> = {
  info: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

const SEVERITY_BORDER: Record<PatternMatch["severity"], string> = {
  info: "border-l-blue-400",
  warning: "border-l-yellow-400",
  critical: "border-l-red-500",
};

function truncatePath(filePath: string, maxLen = 60): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split("/");
  if (parts.length <= 2) return "..." + filePath.slice(-(maxLen - 3));
  // Keep last 2 segments, abbreviate the start
  const tail = parts.slice(-2).join("/");
  return ".../" + tail;
}

export function PatternCard({ pattern, onLocationClick, defaultExpanded = false }: PatternCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className={`rounded-lg border border-l-4 bg-[var(--card)] shadow-sm transition-all ${SEVERITY_BORDER[pattern.severity]}`}
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm text-[var(--foreground)]">
              {pattern.patternName}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[pattern.patternType]}`}
            >
              {TYPE_LABELS[pattern.patternType]}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_STYLES[pattern.severity]}`}
            >
              {pattern.severity}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {pattern.locations.length} location{pattern.locations.length !== 1 ? "s" : ""}
            </span>
          </div>
          {!expanded && (
            <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
              {pattern.description}
            </p>
          )}
        </div>

        {/* Expand/collapse icon */}
        <span className="shrink-0 text-[var(--muted-foreground)] transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          <p className="text-sm text-[var(--foreground)]">{pattern.description}</p>

          {pattern.suggestion && (
            <div className="mt-3 rounded-md bg-blue-50 p-3 dark:bg-blue-950">
              <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Suggestion</p>
              <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">{pattern.suggestion}</p>
            </div>
          )}

          {/* Locations table */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              Locations
            </p>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                    <th className="px-3 py-2 text-left font-medium">File</th>
                    <th className="px-3 py-2 text-left font-medium">Lines</th>
                    <th className="px-3 py-2 text-left font-medium">Symbol</th>
                    <th className="px-3 py-2 text-left font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pattern.locations.map((loc, idx) => (
                    <tr
                      key={`${loc.fileId}-${loc.startLine}-${idx}`}
                      className="hover:bg-[var(--accent)] transition-colors"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-mono text-blue-600 hover:underline dark:text-blue-400 break-all"
                          onClick={() => onLocationClick(loc.filePath, loc.startLine)}
                          title={loc.filePath}
                        >
                          {truncatePath(loc.filePath)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)] whitespace-nowrap">
                        {loc.startLine === loc.endLine
                          ? `L${loc.startLine}`
                          : `L${loc.startLine}–${loc.endLine}`}
                      </td>
                      <td className="px-3 py-2 font-mono text-[var(--foreground)]">
                        {loc.symbolName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted-foreground)] max-w-xs break-words">
                        {loc.evidence}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
