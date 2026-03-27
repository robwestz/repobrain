"use client";

import type { PotentialBreak } from "@/src/modules/what-if/simulator";

interface BreakCardProps {
  breakItem: PotentialBreak;
  workspaceId: string;
}

const BREAK_TYPE_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  "compile-error": { label: "Compile Error", color: "bg-red-900 text-red-200" },
  "runtime-error": { label: "Runtime Error", color: "bg-orange-900 text-orange-200" },
  "behavior-change": { label: "Behavior Change", color: "bg-yellow-900 text-yellow-200" },
  "performance": { label: "Performance", color: "bg-blue-900 text-blue-200" },
};

export function BreakCard({ breakItem, workspaceId }: BreakCardProps) {
  const typeConfig =
    BREAK_TYPE_CONFIG[breakItem.breakType] ?? {
      label: breakItem.breakType,
      color: "bg-slate-700 text-slate-200",
    };

  const filename = breakItem.filePath.split("/").pop() ?? breakItem.filePath;

  // Build a link to the code viewer for this file
  const codeViewerHref = `/workspace/${workspaceId}?file=${encodeURIComponent(breakItem.filePath)}`;

  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* File + symbol */}
        <div className="min-w-0">
          <a
            href={codeViewerHref}
            className="block truncate font-mono text-xs text-slate-400 hover:text-slate-200 transition-colors"
            title={breakItem.filePath}
          >
            {breakItem.filePath}
          </a>
          <span className="mt-0.5 block text-sm font-semibold text-slate-100">
            {breakItem.symbolName}
          </span>
        </div>

        {/* Break type badge */}
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${typeConfig.color}`}
        >
          {typeConfig.label}
        </span>
      </div>

      {/* Reason */}
      <p className="mt-2 text-xs text-slate-400">{breakItem.reason}</p>

      {/* Quick link */}
      <div className="mt-2 flex items-center gap-2">
        <a
          href={codeViewerHref}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline"
        >
          View {filename} in code viewer →
        </a>
      </div>
    </div>
  );
}
