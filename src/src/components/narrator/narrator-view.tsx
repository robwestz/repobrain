"use client";

import { useState, useEffect, useCallback } from "react";
import { FlowSuggestions } from "./flow-suggestions";
import { NarratorStep } from "./narrator-step";
import type { SuggestedFlow } from "@/src/modules/narrator/suggestions";
import type { NarratedFlow } from "@/src/modules/narrator/narrator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase =
  | "idle"
  | "loading-suggestions"
  | "selecting"
  | "tracing"
  | "narrating"
  | "done"
  | "error";

interface NarratorViewProps {
  workspaceId: string;
  repoId: string;
  /** Called when user clicks a file link in a step — opens the file in the code viewer */
  onFileOpen?: (filePath: string, line: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NarratorView({ workspaceId, repoId, onFileOpen }: NarratorViewProps) {
  const [phase, setPhase] = useState<Phase>("loading-suggestions");
  const [suggestions, setSuggestions] = useState<SuggestedFlow[]>([]);
  const [prompt, setPrompt] = useState("");
  const [entrySymbol, setEntrySymbol] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [narratedFlow, setNarratedFlow] = useState<NarratedFlow | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Load suggestions on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!repoId) {
      setPhase("selecting");
      return;
    }

    async function loadSuggestions() {
      setPhase("loading-suggestions");
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/narrate/suggestions`,
        );
        if (res.ok) {
          const data = await res.json() as { suggestions: SuggestedFlow[] };
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        // Suggestions are best-effort; don't block the UI
      } finally {
        setPhase("selecting");
      }
    }

    loadSuggestions();
  }, [workspaceId, repoId]);

  // ---------------------------------------------------------------------------
  // Generate narrative
  // ---------------------------------------------------------------------------

  const generate = useCallback(
    async (promptText: string, symbolName?: string) => {
      if (!promptText.trim()) return;

      setPhase("tracing");
      setErrorMessage("");
      setNarratedFlow(null);

      try {
        // Phase 1: tracing (shown in UI)
        await new Promise((r) => setTimeout(r, 400)); // brief pause for UX
        setPhase("narrating");

        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/narrate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: promptText,
              ...(symbolName ? { entrySymbol: symbolName } : {}),
            }),
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? `Server error ${res.status}`);
        }

        const flow = await res.json() as NarratedFlow;
        setNarratedFlow(flow);
        setPhase("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
        setPhase("error");
      }
    },
    [workspaceId, repoId],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: SuggestedFlow) => {
      setPrompt(suggestion.description);
      setEntrySymbol(suggestion.entrySymbol);
      generate(suggestion.description, suggestion.entrySymbol);
    },
    [generate],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      generate(prompt, entrySymbol || undefined);
    },
    [generate, prompt, entrySymbol],
  );

  const handleReset = useCallback(() => {
    setPhase("selecting");
    setNarratedFlow(null);
    setErrorMessage("");
    setPrompt("");
    setEntrySymbol("");
    setShowAdvanced(false);
  }, []);

  const handleFileClick = useCallback(
    (filePath: string, line: number) => {
      onFileOpen?.(filePath, line);
    },
    [onFileOpen],
  );

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderLoadingState() {
    const isTracing = phase === "tracing";
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-[var(--border)] border-t-blue-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="font-medium text-sm text-[var(--foreground)]">
            {isTracing ? "Tracing flow through the codebase..." : "Generating narrative..."}
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {isTracing
              ? "Following symbol relations to map the execution path"
              : "The AI is crafting a step-by-step walkthrough"}
          </p>
        </div>
      </div>
    );
  }

  function renderSelector() {
    const isLoadingSuggestions = phase === "loading-suggestions";
    return (
      <div className="flex flex-1 flex-col gap-6 py-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            What flow would you like to understand?
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Describe a feature or process and the AI will trace it through the codebase.
          </p>
        </div>

        {/* Free-form input */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Explain what happens when a user sends a chat message"
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />

          {/* Advanced: entry symbol */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Advanced options
            </button>

            {showAdvanced && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                  Entry symbol (optional)
                </label>
                <input
                  type="text"
                  value={entrySymbol}
                  onChange={(e) => setEntrySymbol(e.target.value)}
                  placeholder="e.g. askQuestion"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  If omitted, the AI will infer the best entry point from your description.
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!prompt.trim() || !repoId}
            className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            Generate Walkthrough
          </button>

          {!repoId && (
            <p className="text-xs text-amber-500">
              No repository connected. Please connect a repository first.
            </p>
          )}
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className="text-xs text-[var(--muted-foreground)]">or pick a suggestion</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* Suggested flows */}
        <FlowSuggestions
          suggestions={suggestions}
          onSelect={handleSuggestionClick}
          isLoading={isLoadingSuggestions}
        />
      </div>
    );
  }

  function renderError() {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <div className="rounded-full bg-red-500/10 p-4">
          <svg
            className="h-8 w-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <div className="text-center max-w-md">
          <p className="font-medium text-sm text-[var(--foreground)]">Failed to generate narrative</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{errorMessage}</p>
        </div>
        <button
          onClick={handleReset}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--accent)]"
        >
          Try again
        </button>
      </div>
    );
  }

  function renderNarration() {
    if (!narratedFlow) return null;

    const allSteps = narratedFlow.steps;

    return (
      <div className="flex flex-1 flex-col gap-6 py-6">
        {/* Header + reset */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--foreground)]">
              {narratedFlow.title}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)] leading-relaxed">
              {narratedFlow.overview}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
              <span>{allSteps.length} steps</span>
              <span>·</span>
              <span>
                {new Set(allSteps.map((s) => s.filePath)).size} files
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                // Open all files referenced in the narrative
                for (const step of allSteps) {
                  handleFileClick(step.filePath, step.startLine);
                }
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--accent)]"
              title="Open all referenced files in code viewer"
            >
              Open all files
            </button>
            <button
              onClick={handleReset}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--accent)]"
            >
              New flow
            </button>
          </div>
        </div>

        {/* Steps timeline */}
        <div className="flex flex-col">
          {allSteps.map((step, idx) => (
            <NarratorStep
              key={`${step.symbolName}-${step.order}`}
              step={step}
              isFirst={idx === 0}
              isLast={idx === allSteps.length - 1}
              onFileClick={handleFileClick}
            />
          ))}
        </div>

        {/* Conclusion */}
        {narratedFlow.conclusion && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">
              Conclusion
            </p>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              {narratedFlow.conclusion}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-8">
      {/* Top header bar */}
      <div className="flex shrink-0 items-center justify-between border-b py-4">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-[var(--muted-foreground)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
          <span className="font-semibold text-sm text-[var(--foreground)]">Codebase Narrator</span>
        </div>
        {phase === "done" && (
          <button
            onClick={handleReset}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            New flow
          </button>
        )}
      </div>

      {/* Content area */}
      {(phase === "loading-suggestions" || phase === "selecting") && renderSelector()}
      {(phase === "tracing" || phase === "narrating") && renderLoadingState()}
      {phase === "error" && renderError()}
      {phase === "done" && renderNarration()}
    </div>
  );
}
