"use client";

import { type SpecialistResult } from "@/src/modules/specialists/executor";

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

interface SeverityBadgeProps {
  text: string;
}

export function SeverityBadge({ text }: SeverityBadgeProps) {
  const lower = text.toLowerCase();
  let cls = "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ";

  if (lower.includes("critical")) {
    cls += "bg-red-500/15 text-red-500";
  } else if (lower.includes("high")) {
    cls += "bg-orange-500/15 text-orange-500";
  } else if (lower.includes("major")) {
    cls += "bg-orange-500/15 text-orange-500";
  } else if (lower.includes("medium")) {
    cls += "bg-yellow-500/15 text-yellow-500";
  } else if (lower.includes("minor")) {
    cls += "bg-yellow-500/15 text-yellow-500";
  } else if (lower.includes("low")) {
    cls += "bg-blue-500/15 text-blue-500";
  } else {
    cls += "bg-[var(--muted)] text-[var(--muted-foreground)]";
  }

  return <span className={cls}>{text}</span>;
}

// ---------------------------------------------------------------------------
// Markdown-like renderer (no external deps)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={key++} className="mt-5 mb-2 text-sm font-semibold text-[var(--foreground)]">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={key++} className="mt-6 mb-2 text-base font-semibold text-[var(--foreground)]">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={key++} className="mt-6 mb-3 text-lg font-bold text-[var(--foreground)]">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <li key={key++} className="ml-4 list-disc text-sm text-[var(--muted-foreground)] leading-relaxed">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      nodes.push(
        <li key={key++} className="ml-4 list-decimal text-sm text-[var(--muted-foreground)] leading-relaxed">
          {renderInline(line.replace(/^\d+\.\s/, ""))}
        </li>,
      );
    } else if (line.startsWith("```")) {
      // Collect code block
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre
          key={key++}
          className="my-3 overflow-x-auto rounded-lg bg-[var(--muted)] p-3 text-xs font-mono text-[var(--foreground)]"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
    } else if (line.startsWith("|")) {
      // Table
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      nodes.push(<MarkdownTable key={key++} lines={tableLines} />);
      continue;
    } else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-1" />);
    } else {
      nodes.push(
        <p key={key++} className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }

    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  // Bold **text** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--foreground)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-[var(--muted)] px-1 py-0.5 text-xs font-mono text-[var(--foreground)]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((l) => !l.match(/^\|[-:| ]+\|$/))
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c !== ""),
    );

  const [header, ...body] = rows;

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--muted)]">
          <tr>
            {header?.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-[var(--foreground)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-t border-[var(--border)]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-[var(--muted-foreground)]">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Specialist findings card
// ---------------------------------------------------------------------------

interface SpecialistCardProps {
  result: SpecialistResult;
  defaultOpen?: boolean;
}

export function SpecialistCard({ result, defaultOpen = false }: SpecialistCardProps) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-[var(--border)] overflow-hidden">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--accent)] transition-colors">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${result.success ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm font-medium text-[var(--foreground)]">{result.role}</span>
        </div>
        <svg
          className="h-4 w-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="border-t border-[var(--border)] px-4 py-4">
        {renderMarkdown(result.findings)}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Full synthesis report
// ---------------------------------------------------------------------------

interface SynthesisReportProps {
  synthesis: string;
}

export function SynthesisReport({ synthesis }: SynthesisReportProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-5">
      <div className="prose prose-sm max-w-none">{renderMarkdown(synthesis)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

interface AnalysisProgressProps {
  phases: string[];
  currentPhase: number;
}

export function AnalysisProgress({ phases, currentPhase }: AnalysisProgressProps) {
  return (
    <div className="flex flex-col gap-3">
      {phases.map((phase, i) => {
        const done = i < currentPhase;
        const active = i === currentPhase;
        return (
          <div key={i} className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-green-500 text-white"
                  : active
                    ? "bg-blue-500 text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}
            >
              {done ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : active ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm ${
                done
                  ? "text-[var(--muted-foreground)] line-through"
                  : active
                    ? "font-medium text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
              }`}
            >
              {phase}
            </span>
          </div>
        );
      })}
    </div>
  );
}
