"use client";

import React, { useCallback, useRef, useState } from "react";
import { IterationCard } from "./iteration-card";
import type { ResearchIteration } from "@/src/modules/chat/deep-research";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchViewProps {
  workspaceId: string;
  repoId: string;
  /** Pre-filled question from URL ?q= param (from chat input deep research toggle) */
  initialQuestion?: string;
}

type ResearchStatus = "idle" | "running" | "done" | "error";

// ---------------------------------------------------------------------------
// ResearchView
// ---------------------------------------------------------------------------

export function ResearchView({ workspaceId, repoId, initialQuestion }: ResearchViewProps) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [maxIterations, setMaxIterations] = useState(3);
  const [iterations, setIterations] = useState<ResearchIteration[]>([]);
  const [status, setStatus] = useState<ResearchStatus>("idle");
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState("");
  const [currentIteration, setCurrentIteration] = useState(0);
  const [totalIterations, setTotalIterations] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever iterations change
  React.useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [iterations]);

  // ---------------------------------------------------------------------------
  // Run research
  // ---------------------------------------------------------------------------

  const runResearch = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || status === "running") return;

    setError(null);
    setIterations([]);
    setStatus("running");
    setCurrentIteration(0);
    setTotalIterations(maxIterations);
    setCurrentPhaseLabel("Planning research approach");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/deep-research`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, maxIterations }),
          signal: controller.signal,
        },
      );

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Deep research request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event: { type: string; iteration?: ResearchIteration; error?: string };
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "iteration" && event.iteration) {
            const iter = event.iteration;
            setIterations((prev) => [...prev, iter]);
            setCurrentIteration(iter.iteration);
            // Update the phase label for the NEXT iteration (progress indicator)
            if (iter.phase === "planning") {
              setCurrentPhaseLabel(`Investigating (iteration 2/${maxIterations})`);
            } else if (iter.phase === "investigating") {
              const nextIter = iter.iteration + 1;
              if (nextIter < maxIterations) {
                setCurrentPhaseLabel(`Investigating (iteration ${nextIter}/${maxIterations})`);
              } else {
                setCurrentPhaseLabel("Synthesizing final answer");
              }
            }
          } else if (event.type === "done") {
            setStatus("done");
            setCurrentPhaseLabel("");
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Unknown error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setStatus("error");
    } finally {
      // Reset to idle only if still running (functional update avoids stale closure)
      setStatus((prev) => (prev === "running" ? "idle" : prev));
    }
  }, [question, maxIterations, status, workspaceId, repoId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        runResearch();
      }
    },
    [runResearch],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setCurrentPhaseLabel("");
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setIterations([]);
    setError(null);
    setCurrentPhaseLabel("");
    setCurrentIteration(0);
  }, []);

  const isRunning = status === "running";
  const hasSynthesis = iterations.some((i) => i.phase === "synthesizing");
  const synthesisIteration = iterations.find((i) => i.phase === "synthesizing");

  return (
    <div className="flex h-full flex-col">
      {/* Question input area */}
      <div className="shrink-0 border-b bg-[var(--card)] p-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Deep Research
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 focus-within:ring-1 focus-within:ring-[var(--ring)]">
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a complex question about your codebase…"
              disabled={isRunning}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              {/* Iterations selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted-foreground)]">Iterations:</span>
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setMaxIterations(n)}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      maxIterations === n
                        ? "bg-blue-600 text-white"
                        : "border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {iterations.length > 0 && !isRunning && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--accent)]"
                  >
                    Clear
                  </button>
                )}
                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={runResearch}
                    disabled={!question.trim()}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <IconMicroscope />
                    Research
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      {isRunning && (
        <div className="shrink-0 border-b bg-[var(--card)] px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="h-4 w-4 rounded-full border-2 border-[var(--border)] border-t-blue-500 animate-spin shrink-0" />
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span className="font-medium text-[var(--foreground)]">{currentPhaseLabel}</span>
              {currentIteration > 0 && (
                <span className="text-[var(--muted-foreground)]">
                  ({currentIteration}/{totalIterations} iterations complete)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          {/* Idle empty state */}
          {status === "idle" && iterations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="rounded-full bg-[var(--muted)] p-4">
                <IconMicroscopeLarge />
              </div>
              <div>
                <p className="font-medium text-sm text-[var(--foreground)]">
                  Ask a complex research question
                </p>
                <p className="mt-1 max-w-xs text-xs text-[var(--muted-foreground)]">
                  Deep Research runs multiple retrieval iterations to build a comprehensive,
                  cited answer — like having an expert explore the codebase for you.
                </p>
              </div>
              <div className="mt-3 grid gap-1.5 text-left w-full max-w-sm">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}

          {/* Timeline of iterations */}
          {iterations.length > 0 && (
            <div>
              <div className="mb-4 text-xs text-[var(--muted-foreground)]">
                Researching: <span className="font-medium text-[var(--foreground)]">{iterations[0] ? question : ""}</span>
              </div>

              {/* All iterations except final synthesis */}
              {iterations
                .filter((it) => it.phase !== "synthesizing")
                .map((it, idx, arr) => (
                  <IterationCard
                    key={it.iteration}
                    iteration={it}
                    isLatest={idx === arr.length - 1 && isRunning}
                  />
                ))}

              {/* Spinner for in-progress synthesis */}
              {isRunning && !hasSynthesis && iterations.length > 0 && (
                <div className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-3 w-3 rounded-full shrink-0 bg-emerald-500 ring-2 ring-offset-2 ring-offset-[var(--background)] ring-emerald-500 animate-pulse" />
                  </div>
                  <div className="mb-6 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <div className="h-3 w-3 rounded-full border-2 border-[var(--border)] border-t-emerald-500 animate-spin shrink-0" />
                      <span>Synthesizing all findings…</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Final synthesis */}
              {synthesisIteration && (
                <div className="mt-2">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-xs font-medium text-[var(--muted-foreground)]">Final Synthesis</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                      {synthesisIteration.content}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={scrollAnchorRef} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function IconMicroscope() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

function IconMicroscopeLarge() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--muted-foreground)]">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Example questions
// ---------------------------------------------------------------------------

const EXAMPLE_QUESTIONS = [
  "How does authentication and session management work end-to-end?",
  "What is the overall architecture and how do modules communicate?",
  "How is data persisted and what are the main database patterns?",
];
