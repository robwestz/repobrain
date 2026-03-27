"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingStep } from "@/src/modules/onboarding/path-generator";

interface StepCardProps {
  step: OnboardingStep;
  workspaceId: string;
  isCompleted: boolean;
  isFirst: boolean;
  isLast: boolean;
  onPrevious: () => void;
  onComplete: () => void;
}

export function StepCard({
  step,
  workspaceId,
  isCompleted,
  isFirst,
  isLast,
  onPrevious,
  onComplete,
}: StepCardProps) {
  const router = useRouter();
  const [checkedConcepts, setCheckedConcepts] = useState<Set<string>>(new Set());

  function toggleConcept(concept: string) {
    setCheckedConcepts((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) {
        next.delete(concept);
      } else {
        next.add(concept);
      }
      return next;
    });
  }

  function openFile(path: string) {
    // Navigate to workspace — the workspace page handles file opening via query params
    router.push(`/workspace/${workspaceId}?openFile=${encodeURIComponent(path)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold">
            {step.order}
          </span>
          <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-wider">
            ~{step.estimatedMinutes} min
          </span>
          {isCompleted && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
              <span>&#10003;</span> Completed
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold">{step.title}</h2>
      </div>

      {/* Description */}
      <div className="text-sm text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
        {step.description}
      </div>

      {/* Key Files */}
      {step.focusFiles.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Key Files
          </h3>
          <div className="flex flex-col gap-2">
            {step.focusFiles.map((file, idx) => (
              <button
                key={idx}
                onClick={() => openFile(file.path)}
                className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-left hover:border-[var(--ring)] hover:bg-[var(--accent)] transition-colors"
              >
                <span className="font-mono text-xs font-medium text-[var(--foreground)] break-all">
                  {file.path}
                  {file.startLine && file.endLine
                    ? ` (lines ${file.startLine}–${file.endLine})`
                    : file.startLine
                    ? ` (line ${file.startLine})`
                    : ""}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">{file.why}</span>
                <span className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  Open in code viewer &rarr;
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Key Symbols */}
      {step.keySymbols.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Key Concepts &amp; Symbols
          </h3>
          <div className="flex flex-col gap-2">
            {step.keySymbols.map((sym, idx) => (
              <button
                key={idx}
                onClick={() => openFile(sym.filePath)}
                className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-left hover:border-[var(--ring)] hover:bg-[var(--accent)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{sym.name}</span>
                  <span className="rounded bg-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--muted-foreground)]">
                    {sym.kind}
                  </span>
                </div>
                <span className="font-mono text-xs text-[var(--muted-foreground)] break-all">
                  {sym.filePath}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">{sym.explanation}</span>
                <span className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  Open file &rarr;
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* What you learned checklist */}
      {step.conceptsLearned.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            What You&apos;ll Learn
          </h3>
          <div className="flex flex-col gap-2">
            {step.conceptsLearned.map((concept, idx) => (
              <label
                key={idx}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-[var(--accent)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checkedConcepts.has(concept)}
                  onChange={() => toggleConcept(concept)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-green-500"
                />
                <span
                  className={[
                    "text-sm",
                    checkedConcepts.has(concept)
                      ? "line-through text-[var(--muted-foreground)]"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {concept}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <button
          onClick={onPrevious}
          disabled={isFirst}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          &larr; Previous
        </button>

        {isLast ? (
          <button
            onClick={onComplete}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 active:bg-green-800"
          >
            Mark Complete &amp; Finish &#10003;
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:opacity-90"
          >
            Mark Complete &amp; Next &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
