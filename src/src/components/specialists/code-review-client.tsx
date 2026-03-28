"use client";

import { useState } from "react";
import { SpecialistCard, SynthesisReport, AnalysisProgress } from "./specialist-report";
import type { SpecialistResult } from "@/src/modules/specialists/executor";

interface CodeReviewResult {
  specialists: SpecialistResult[];
  synthesis: string;
  generatedAt: string;
}

interface CodeReviewClientProps {
  workspaceId: string;
  workspaceName: string;
  repoId: string | null;
  repoName: string | null;
  repoStatus: string | null;
}

const PHASES = [
  "Retrieving security context",
  "Running 4 specialist agents in parallel",
  "Synthesizing review report",
];

export function CodeReviewClient({
  workspaceId,
  workspaceName,
  repoId,
  repoName,
  repoStatus,
}: CodeReviewClientProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<CodeReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"synthesis" | "specialists">("synthesis");

  const isReady = repoStatus === "ready";

  async function runReview() {
    if (!repoId) return;
    setStatus("loading");
    setPhase(0);
    setError(null);
    setResult(null);

    try {
      setPhase(0);
      await new Promise((r) => setTimeout(r, 400));
      setPhase(1);

      const resp = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/specialists/code-review`,
        { method: "POST" },
      );

      setPhase(2);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json() as CodeReviewResult;
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <a href="/dashboard" className="shrink-0 font-semibold text-sm hover:opacity-70 transition-opacity">
            RepoBrain
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <a
            href={`/workspace/${workspaceId}`}
            className="truncate text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            {workspaceName}
          </a>
          <span className="shrink-0 text-[var(--muted-foreground)]">/</span>
          <span className="text-sm text-[var(--foreground)]">Code Review</span>
        </div>
        <div className="flex items-center gap-3">
          {repoName && (
            <span className="text-xs text-[var(--muted-foreground)] font-mono">{repoName}</span>
          )}
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--accent)]"
          >
            Back to workspace
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!repoId ? (
          <EmptyState workspaceId={workspaceId} message="Connect a repository to run code review." />
        ) : !isReady ? (
          <NotReadyState workspaceId={workspaceId} repoStatus={repoStatus} />
        ) : status === "idle" ? (
          <IdleState onRun={runReview} repoName={repoName} />
        ) : status === "loading" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
            <div className="w-full max-w-sm">
              <h2 className="mb-6 text-center text-base font-semibold text-[var(--foreground)]">
                Running Code Review
              </h2>
              <AnalysisProgress phases={PHASES} currentPhase={phase} />
              <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
                This may take 30–90 seconds depending on repository size.
              </p>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-full bg-red-500/10 p-4">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="font-semibold text-[var(--foreground)]">Review Failed</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm">{error}</p>
            <button
              onClick={runReview}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Try Again
            </button>
          </div>
        ) : result ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex shrink-0 items-center gap-1 border-b px-4 pt-2">
              <button
                onClick={() => setActiveTab("synthesis")}
                className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "synthesis"
                    ? "border-b-2 border-blue-500 text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                Full Report
              </button>
              <button
                onClick={() => setActiveTab("specialists")}
                className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "specialists"
                    ? "border-b-2 border-blue-500 text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                Specialist Details
                <span className="ml-2 rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px]">
                  {result.specialists.length}
                </span>
              </button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Generated {new Date(result.generatedAt).toLocaleTimeString()}
                </span>
                <button
                  onClick={runReview}
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--accent)]"
                >
                  Re-run
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-4xl">
                {activeTab === "synthesis" ? (
                  <SynthesisReport synthesis={result.synthesis} />
                ) : (
                  <div className="flex flex-col gap-3">
                    {result.specialists.map((spec, i) => (
                      <SpecialistCard key={i} result={spec} defaultOpen={i === 0} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{repoName ?? "No repository"}</span>
        <span>RepoBrain Code Review — 4 specialist agents</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function IdleState({ onRun, repoName }: { onRun: () => void; repoName: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-full bg-blue-500/10 p-5">
        <svg className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Multi-Agent Code Review</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-md">
          Four specialist agents — Security, Architecture, Performance, and Code Style — analyze
          {repoName ? ` ${repoName}` : " your repository"} in parallel and synthesize a comprehensive review report.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-left rounded-xl border border-[var(--border)] p-4 w-full max-w-sm">
        {["Security vulnerabilities & best practices", "Architecture & design patterns", "Performance bottlenecks", "Code style & maintainability"].map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <button
        onClick={onRun}
        className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Run Code Review
      </button>
    </div>
  );
}

function EmptyState({ workspaceId, message }: { workspaceId: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="font-semibold text-[var(--foreground)]">No repository connected</h2>
      <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
      <a href={`/workspace/${workspaceId}`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500">
        Go to workspace
      </a>
    </div>
  );
}

function NotReadyState({ workspaceId, repoStatus }: { workspaceId: string; repoStatus: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-blue-500 animate-spin" />
      <h2 className="font-semibold text-[var(--foreground)]">Repository is being indexed</h2>
      <p className="text-sm text-[var(--muted-foreground)]">Code review will be available once indexing completes.</p>
      {repoStatus && <p className="text-xs font-mono text-[var(--muted-foreground)]">Status: {repoStatus}</p>}
      <a href={`/workspace/${workspaceId}`} className="text-xs text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]">
        Check indexing progress
      </a>
    </div>
  );
}
