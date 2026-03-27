"use client";

import { useEffect, useState } from "react";
import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";
import type { SearchResult } from "@/src/modules/search/search-service";

// ---------------------------------------------------------------------------
// Shiki singleton — reuse the same highlighter instance across cards
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark"],
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
// Props
// ---------------------------------------------------------------------------

export interface SearchResultCardProps {
  result: SearchResult;
  onFileClick: (filePath: string, line: number) => void;
}

// ---------------------------------------------------------------------------
// Match reason badge colours
// ---------------------------------------------------------------------------

const REASON_STYLES: Record<string, string> = {
  "semantic match": "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  "symbol definition": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  "symbol usage": "bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20",
  "keyword match": "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  "structural match": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20",
};

// ---------------------------------------------------------------------------
// Code snippet with Shiki highlighting (compact, no line number gutter)
// ---------------------------------------------------------------------------

function CodeSnippet({
  content,
  language,
}: {
  content: string;
  language: string | null;
}) {
  const [lines, setLines] = useState<ThemedToken[][]>([]);
  const [bg, setBg] = useState("#0d1117");

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
          setLines(result.tokens);
          setBg(result.bg ?? "#0d1117");
        }
      } catch {
        if (!cancelled) {
          const plain = content.split("\n").map((text) => [
            { content: text, color: "#e6edf3", offset: 0 } as ThemedToken,
          ]);
          setLines(plain);
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [content, language]);

  // Limit display to first 20 lines to keep cards compact
  const displayLines = lines.slice(0, 20);
  const truncated = lines.length > 20;

  return (
    <div
      className="overflow-x-auto rounded-md font-mono text-xs leading-5 p-3"
      style={{ background: bg }}
    >
      {displayLines.map((lineTokens, i) => (
        <div key={i} className="whitespace-pre">
          {lineTokens.map((token, j) => (
            <span key={j} style={{ color: token.color }}>
              {token.content}
            </span>
          ))}
          {lineTokens.length === 0 && <span>&nbsp;</span>}
        </div>
      ))}
      {truncated && (
        <div className="mt-1 text-[10px] opacity-50">… {lines.length - 20} more lines</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchResultCard
// ---------------------------------------------------------------------------

export function SearchResultCard({ result, onFileClick }: SearchResultCardProps) {
  const filename = result.filePath.split("/").pop() ?? result.filePath;
  const scorePercent = Math.round(result.relevanceScore * 100);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div className="min-w-0 flex-1">
          {/* File path — clickable */}
          <button
            type="button"
            onClick={() => onFileClick(result.filePath, result.startLine)}
            className="group flex items-center gap-1.5 text-left"
            title={`Open ${result.filePath} at line ${result.startLine}`}
          >
            <span className="font-medium text-sm truncate group-hover:text-blue-500 transition-colors">
              {filename}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
              :{result.startLine}–{result.endLine}
            </span>
          </button>
          <div className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)] truncate">
            {result.filePath}
          </div>
        </div>

        {/* Badges */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {result.language && (
            <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
              {result.language}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REASON_STYLES[result.matchReason] ?? "bg-zinc-500/10 text-zinc-700"}`}
          >
            {result.matchReason}
          </span>
        </div>
      </div>

      {/* Symbol info (optional) */}
      {result.symbolName && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
          <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
            {result.symbolKind ?? "symbol"}
          </span>
          <span className="font-mono text-xs font-medium">{result.symbolName}</span>
        </div>
      )}

      {/* Code snippet */}
      <div className="p-3">
        <CodeSnippet content={result.content} language={result.language} />
      </div>

      {/* Footer: relevance bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)]">
        <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
          Relevance
        </span>
        <div className="flex-1 rounded-full bg-[var(--muted)] h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums shrink-0">
          {scorePercent}%
        </span>
        {/* Open in code viewer link */}
        <button
          type="button"
          onClick={() => onFileClick(result.filePath, result.startLine)}
          className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors shrink-0"
        >
          Open
        </button>
      </div>
    </article>
  );
}
