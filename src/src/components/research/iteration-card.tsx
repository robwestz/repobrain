"use client";

import type { ResearchIteration } from "@/src/modules/chat/deep-research";

interface IterationCardProps {
  iteration: ResearchIteration;
  isLatest?: boolean;
}

const PHASE_STYLES: Record<ResearchIteration["phase"], { label: string; badgeClass: string; dotClass: string }> = {
  planning: {
    label: "Planning",
    badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    dotClass: "bg-violet-500",
  },
  investigating: {
    label: "Investigating",
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    dotClass: "bg-blue-500",
  },
  synthesizing: {
    label: "Synthesizing",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
};

export function IterationCard({ iteration, isLatest }: IterationCardProps) {
  const phaseStyle = PHASE_STYLES[iteration.phase];

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector dot */}
      <div className="flex flex-col items-center">
        <div className={`mt-1 h-3 w-3 rounded-full shrink-0 ${phaseStyle.dotClass} ${isLatest ? "ring-2 ring-offset-2 ring-offset-[var(--background)] ring-current" : ""}`} />
        <div className="mt-1 w-px flex-1 bg-[var(--border)]" />
      </div>

      {/* Card content */}
      <div className="mb-6 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-[var(--muted-foreground)]">
            Iteration {iteration.iteration}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${phaseStyle.badgeClass}`}>
            {phaseStyle.label}
          </span>
        </div>

        {/* Main analysis content */}
        {iteration.content && (
          <div className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap mb-3">
            {iteration.content}
          </div>
        )}

        {/* Queries used */}
        {iteration.queries.length > 0 && (
          <div className="mt-3">
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Queries searched
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {iteration.queries.map((q, i) => (
                <span
                  key={i}
                  className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted-foreground)]"
                >
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* New findings */}
        {iteration.newFindings.length > 0 && (
          <div className="mt-3">
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Key findings
            </h4>
            <ul className="space-y-1">
              {iteration.newFindings.map((f, i) => (
                <li key={i} className="flex gap-2 text-xs text-[var(--foreground)]">
                  <span className="mt-0.5 shrink-0 text-emerald-500">+</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Remaining gaps */}
        {iteration.gaps.length > 0 && (
          <div className="mt-3">
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Still investigating
            </h4>
            <ul className="space-y-1">
              {iteration.gaps.map((g, i) => (
                <li key={i} className="flex gap-2 text-xs text-[var(--muted-foreground)]">
                  <span className="mt-0.5 shrink-0">?</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
