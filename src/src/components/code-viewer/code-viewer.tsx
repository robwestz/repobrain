"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";
import { AskAboutFile } from "./ask-about-file";
import { NewThreadDialog } from "@/src/components/threads/new-thread-dialog";

// ---------------------------------------------------------------------------
// Shiki singleton — lazy-initialized once per browser session
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [
          "typescript", "tsx", "javascript", "jsx",
          "python", "go", "rust", "java",
          "css", "html", "json", "yaml", "markdown",
          "bash", "sql", "c", "cpp", "ruby", "php",
          "swift", "kotlin", "csharp", "toml", "xml",
        ],
      }),
    );
  }
  return highlighterPromise;
}

// ---------------------------------------------------------------------------
// Language normalisation (DB / extension name → Shiki BundledLanguage)
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, BundledLanguage> = {
  typescript: "typescript", ts: "typescript",
  tsx: "tsx",
  javascript: "javascript", js: "javascript",
  jsx: "jsx",
  python: "python", py: "python",
  go: "go", golang: "go",
  rust: "rust", rs: "rust",
  java: "java",
  css: "css",
  html: "html",
  json: "json",
  yaml: "yaml", yml: "yaml",
  markdown: "markdown", md: "markdown",
  bash: "bash", sh: "bash", shell: "bash",
  sql: "sql",
  c: "c",
  cpp: "cpp",
  ruby: "ruby", rb: "ruby",
  php: "php",
  swift: "swift",
  kotlin: "kotlin", kt: "kotlin",
  csharp: "csharp", cs: "csharp",
  toml: "toml",
  xml: "xml",
};

function mapLang(language: string | null): BundledLanguage | null {
  if (!language) return null;
  return LANG_MAP[language.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Thread marker types (passed in from workspace shell)
// ---------------------------------------------------------------------------

export interface ThreadMarker {
  id: string;
  startLine: number;
  endLine: number;
  status: "open" | "resolved";
  title: string;
  commentCount: number;
}

interface CodeViewerProps {
  filePath: string;
  content: string;
  language: string | null;
  highlightRange?: { start: number; end: number } | null;
  onAskAboutFile: (filePath: string) => void;
  // Thread integration
  workspaceId?: string;
  repoId?: string;
  threadMarkers?: ThreadMarker[];
  onThreadMarkerClick?: (threadId: string) => void;
  onThreadCreated?: () => void;
}

interface LineData {
  tokens: ThemedToken[];
  lineNumber: number;
}

export function CodeViewer({
  filePath,
  content,
  language,
  highlightRange,
  onAskAboutFile,
  workspaceId,
  repoId,
  threadMarkers = [],
  onThreadMarkerClick,
  onThreadCreated,
}: CodeViewerProps) {
  const [lines, setLines] = useState<LineData[]>([]);
  const [bg, setBg] = useState<string>("transparent");
  const [fg, setFg] = useState<string>("inherit");
  const [shikiError, setShikiError] = useState(false);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Thread discussion state
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [newThreadDialog, setNewThreadDialog] = useState<{
    startLine: number;
    endLine: number;
  } | null>(null);

  // Highlight code with Shiki
  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const h = await getHighlighter();
        const lang = mapLang(language);

        const result = h.codeToTokens(content, {
          lang: lang ?? "text",
          theme: "github-dark",
        });

        if (!cancelled) {
          setLines(
            result.tokens.map((lineTokens, i) => ({
              tokens: lineTokens,
              lineNumber: i + 1,
            })),
          );
          setBg(result.bg ?? "transparent");
          setFg(result.fg ?? "inherit");
          setShikiError(false);
        }
      } catch {
        if (!cancelled) {
          // Fallback: plain text split into lines
          const plainLines = content.split("\n").map((text, i) => ({
            tokens: [{ content: text, color: "inherit", offset: 0 } as ThemedToken],
            lineNumber: i + 1,
          }));
          setLines(plainLines);
          setShikiError(true);
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [content, language]);

  // Scroll to highlighted range when it changes
  useEffect(() => {
    if (!highlightRange) return;
    // Use rAF to let React finish painting first
    const id = requestAnimationFrame(() => {
      const el = highlightRef.current?.querySelector<HTMLElement>(
        `[data-line="${highlightRange.start}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [highlightRange]);

  const filename = filePath.split("/").pop() ?? filePath;

  // Build a map of lineNumber → thread markers covering that line
  const lineToMarkers = useCallback((): Map<number, ThreadMarker[]> => {
    const map = new Map<number, ThreadMarker[]>();
    for (const marker of threadMarkers) {
      for (let ln = marker.startLine; ln <= marker.endLine; ln++) {
        const existing = map.get(ln) ?? [];
        existing.push(marker);
        map.set(ln, existing);
      }
    }
    return map;
  }, [threadMarkers]);

  const markerMap = lineToMarkers();

  function handleStartDiscussion(lineNumber: number) {
    setNewThreadDialog({ startLine: lineNumber, endLine: lineNumber });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* File path header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs text-[var(--muted-foreground)]" title={filePath}>
          {filePath}
        </span>
        <div className="ml-2 shrink-0">
          <AskAboutFile filePath={filePath} onAsk={onAskAboutFile} />
        </div>
      </div>

      {/* Code area */}
      <div
        ref={highlightRef}
        className="flex-1 overflow-auto font-mono text-xs leading-5"
        style={{ background: bg, color: fg }}
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line) => {
                const isHighlighted =
                  highlightRange != null &&
                  line.lineNumber >= highlightRange.start &&
                  line.lineNumber <= highlightRange.end;

                const markersOnLine = markerMap.get(line.lineNumber) ?? [];
                const hasOpenMarker = markersOnLine.some((m) => m.status === "open");
                const hasResolvedMarker =
                  !hasOpenMarker && markersOnLine.some((m) => m.status === "resolved");
                const firstMarker = markersOnLine[0];
                const isHovered = hoveredLine === line.lineNumber;

                return (
                  <tr
                    key={line.lineNumber}
                    data-line={line.lineNumber}
                    className={isHighlighted ? "bg-yellow-400/15" : undefined}
                    onMouseEnter={() => setHoveredLine(line.lineNumber)}
                    onMouseLeave={() => setHoveredLine(null)}
                  >
                    {/* Gutter: thread markers + line number + discussion button */}
                    <td
                      className="select-none border-r border-white/10 pr-1 pl-2 text-right text-[var(--muted-foreground)] opacity-50 align-top w-20 relative"
                      style={{ userSelect: "none" }}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {/* Thread marker dot */}
                        {markersOnLine.length > 0 && (
                          <button
                            onClick={() =>
                              firstMarker && onThreadMarkerClick?.(firstMarker.id)
                            }
                            title={firstMarker?.title ?? "View discussion"}
                            className={`h-2 w-2 rounded-full shrink-0 transition-transform hover:scale-125 ${
                              hasOpenMarker
                                ? "bg-amber-400"
                                : hasResolvedMarker
                                  ? "bg-green-500 opacity-60"
                                  : "bg-gray-500"
                            }`}
                            aria-label="Open thread"
                          />
                        )}

                        {/* Start discussion button on hover (only if threads enabled) */}
                        {workspaceId && repoId && isHovered && markersOnLine.length === 0 && (
                          <button
                            onClick={() => handleStartDiscussion(line.lineNumber)}
                            title="Start a discussion on this line"
                            className="h-3.5 w-3.5 rounded-sm bg-indigo-500/80 text-white flex items-center justify-center opacity-80 hover:opacity-100 transition-opacity shrink-0"
                            aria-label="Start discussion"
                          >
                            <svg viewBox="0 0 12 12" width="8" height="8" fill="currentColor">
                              <path d="M6 0C2.69 0 0 2.42 0 5.4c0 1.78.9 3.36 2.32 4.37L2 12l2.38-1.19A6.36 6.36 0 0 0 6 10.8c3.31 0 6-2.42 6-5.4S9.31 0 6 0Zm.6 7.2H5.4V6h1.2v1.2Zm0-2.4H5.4V2.4h1.2v2.4Z" />
                            </svg>
                          </button>
                        )}

                        {/* Line number */}
                        <span className="text-xs">{line.lineNumber}</span>
                      </div>
                    </td>
                    {/* Code tokens */}
                    <td className="pl-4 pr-4 whitespace-pre">
                      {line.tokens.map((token, i) => (
                        <span key={i} style={{ color: token.color }}>
                          {token.content}
                        </span>
                      ))}
                      {/* Ensure empty lines have height */}
                      {line.tokens.length === 0 && <span>&nbsp;</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: status */}
      <div className="flex shrink-0 items-center justify-between border-t px-3 py-1 text-[10px] text-[var(--muted-foreground)]">
        <span>{filename}</span>
        <div className="flex items-center gap-3">
          {language && <span>{language}</span>}
          <span>{lines.length} lines</span>
          {shikiError && <span className="text-amber-500">plain text</span>}
          {threadMarkers.length > 0 && (
            <span className="text-amber-400">
              {threadMarkers.filter((m) => m.status === "open").length} discussion
              {threadMarkers.filter((m) => m.status === "open").length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* New Thread Dialog */}
      {newThreadDialog && workspaceId && repoId && (
        <NewThreadDialog
          workspaceId={workspaceId}
          repoId={repoId}
          filePath={filePath}
          startLine={newThreadDialog.startLine}
          endLine={newThreadDialog.endLine}
          onClose={() => setNewThreadDialog(null)}
          onCreated={(thread) => {
            setNewThreadDialog(null);
            onThreadCreated?.();
            onThreadMarkerClick?.((thread as { id: string }).id);
          }}
        />
      )}
    </div>
  );
}
