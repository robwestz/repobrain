"use client";

import { useEffect, useRef, useState } from "react";
import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";
import { AskAboutFile } from "./ask-about-file";

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

interface CodeViewerProps {
  filePath: string;
  content: string;
  language: string | null;
  highlightRange?: { start: number; end: number } | null;
  onAskAboutFile: (filePath: string) => void;
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
}: CodeViewerProps) {
  const [lines, setLines] = useState<LineData[]>([]);
  const [bg, setBg] = useState<string>("transparent");
  const [fg, setFg] = useState<string>("inherit");
  const [shikiError, setShikiError] = useState(false);
  const highlightRef = useRef<HTMLDivElement | null>(null);

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

                return (
                  <tr
                    key={line.lineNumber}
                    data-line={line.lineNumber}
                    className={isHighlighted ? "bg-yellow-400/15" : undefined}
                  >
                    {/* Line number */}
                    <td
                      className="select-none border-r border-white/10 pr-4 pl-4 text-right text-[var(--muted-foreground)] opacity-50 align-top w-12"
                      style={{ userSelect: "none" }}
                    >
                      {line.lineNumber}
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
        </div>
      </div>
    </div>
  );
}
