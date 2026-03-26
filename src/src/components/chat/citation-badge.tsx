"use client";

/**
 * CitationBadge — a clickable chip that shows a file:line reference.
 *
 * When clicked it emits an event so the workspace shell can navigate the
 * code viewer to the cited file and highlight the cited line range.
 */

interface CitationBadgeProps {
  filePath: string;
  startLine: number;
  endLine: number;
  /** Called when the user clicks the badge */
  onNavigate?: (filePath: string, startLine: number, endLine: number) => void;
}

export function CitationBadge({
  filePath,
  startLine,
  endLine,
  onNavigate,
}: CitationBadgeProps) {
  const filename = filePath.split("/").pop() ?? filePath;
  const label =
    startLine === endLine
      ? `${filename}:${startLine}`
      : `${filename}:${startLine}-${endLine}`;

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(filePath, startLine, endLine)}
      title={`${filePath} lines ${startLine}–${endLine}`}
      className="inline-flex items-center rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
    >
      {label}
    </button>
  );
}
