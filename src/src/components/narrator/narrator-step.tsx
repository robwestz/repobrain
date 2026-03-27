"use client";

import { useEffect, useRef, useState } from "react";
import type { BundledLanguage, Highlighter, ThemedToken } from "shiki";
import type { NarratedStep } from "@/src/modules/narrator/narrator";

// ---------------------------------------------------------------------------
// Shiki singleton (shared across all NarratorStep instances)
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

function mapLang(filePath: string): BundledLanguage | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? null;
}

interface LineData {
  tokens: ThemedToken[];
  lineNumber: number;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NarratorStepProps {
  step: NarratedStep;
  isFirst: boolean;
  isLast: boolean;
  onFileClick: (filePath: string, line: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NarratorStep({ step, isFirst, isLast, onFileClick }: NarratorStepProps) {
  const [lines, setLines] = useState<LineData[]>([]);
  const [bg, setBg] = useState<string>("#0d1117");
  const [shikiReady, setShikiReady] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    async function highlight() {
      try {
        const h = await getHighlighter();
        const lang = mapLang(step.filePath);
        const result = h.codeToTokens(step.code, {
          lang: lang ?? "text",
          theme: "github-dark",
        });

        if (!cancelRef.current) {
          setLines(
            result.tokens.map((lineTokens, i) => ({
              tokens: lineTokens,
              lineNumber: step.startLine + i,
            })),
          );
          setBg(result.bg ?? "#0d1117");
          setShikiReady(true);
        }
      } catch {
        if (!cancelRef.current) {
          const plainLines = step.code.split("\n").map((text, i) => ({
            tokens: [{ content: text, color: "#e6edf3", offset: 0 } as ThemedToken],
            lineNumber: step.startLine + i,
          }));
          setLines(plainLines);
          setShikiReady(true);
        }
      }
    }

    highlight();
    return () => { cancelRef.current = true; };
  }, [step.code, step.filePath, step.startLine]);

  const shortPath = step.filePath.split("/").slice(-2).join("/");
  const lineRange = `L${step.startLine}–${step.endLine}`;
  const stepLabel = step.order === 0 ? "Entry" : `${step.order}`;

  return (
    <div className="relative flex gap-4">
      {/* Timeline column */}
      <div className="flex flex-col items-center">
        {/* Circle with step number */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-sm z-10
            ${isFirst
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
            }`}
        >
          {stepLabel}
        </div>
        {/* Vertical connector line */}
        {!isLast && (
          <div className="mt-1 w-0.5 flex-1 bg-[var(--border)] min-h-[2rem]" />
        )}
      </div>

      {/* Content card */}
      <div className="flex-1 pb-8">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden shadow-sm">
          {/* Card header */}
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="font-semibold text-sm text-[var(--foreground)]">
              {step.heading}
            </h3>
          </div>

          {/* Narrative */}
          <div className="px-4 py-3">
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              {step.narrative}
            </p>
          </div>

          {/* Code block */}
          <div
            className="overflow-x-auto font-mono text-xs leading-5 max-h-64"
            style={{ background: bg }}
          >
            {shikiReady ? (
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.lineNumber}>
                      <td
                        className="select-none border-r border-white/10 pr-3 pl-3 text-right text-[10px] text-white/30 align-top w-10"
                        style={{ userSelect: "none" }}
                      >
                        {line.lineNumber}
                      </td>
                      <td className="pl-3 pr-3 whitespace-pre">
                        {line.tokens.map((token, i) => (
                          <span key={i} style={{ color: token.color }}>
                            {token.content}
                          </span>
                        ))}
                        {line.tokens.length === 0 && <span>&nbsp;</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-3 text-white/40 text-xs">Loading code...</div>
            )}
          </div>

          {/* File link + key insight */}
          <div className="border-t border-[var(--border)] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <button
              onClick={() => onFileClick(step.filePath, step.startLine)}
              className="flex items-center gap-1.5 font-mono text-xs text-blue-500 hover:text-blue-400 hover:underline transition-colors text-left"
            >
              <svg
                className="h-3 w-3 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              {shortPath}:{lineRange}
            </button>

            {/* Key insight box */}
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 max-w-sm">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                {step.keyInsight}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
