"use client";

import { useState } from "react";
import { SynthesisReport, AnalysisProgress } from "./specialist-report";

interface ADRDocument {
  id: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}

interface ADRDecision {
  id: string;
  title: string;
  domain: string;
  evidenceFiles: string[];
  summary: string;
}

interface ADRResult {
  index: string;
  adrs: ADRDocument[];
  decisions: ADRDecision[];
  generatedAt: string;
}

interface ADRClientProps {
  workspaceId: string;
  workspaceName: string;
  repoId: string | null;
  repoName: string | null;
  repoStatus: string | null;
}

const PHASES = [
  "Analyzing codebase architecture",
  "Discovering architectural decisions",
  "Generating ADR documents in parallel",
  "Building ADR index",
];

const DOMAIN_COLORS: Record<string, string> = {
  framework: "bg-blue-500/10 text-blue-500",
  database: "bg-purple-500/10 text-purple-500",
  api: "bg-green-500/10 text-green-500",
  security: "bg-red-500/10 text-red-500",
  deployment: "bg-orange-500/10 text-orange-500",
  testing: "bg-yellow-500/10 text-yellow-500",
  architecture: "bg-indigo-500/10 text-indigo-500",
  other: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function DomainBadge({ domain }: { domain: string }) {
  const cls = DOMAIN_COLORS[domain.toLowerCase()] ?? DOMAIN_COLORS.other;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {domain}
    </span>
  );
}

export function ADRClient({
  workspaceId,
  workspaceName,
  repoId,
  repoName,
  repoStatus,
}: ADRClientProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<ADRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"index" | "adrs">("index");
  const [selectedADR, setSelectedADR] = useState<ADRDocument | null>(null);

  const isReady = repoStatus === "ready";

  async function runGenerator() {
    if (!repoId) return;
    setStatus("loading");
    setPhase(0);
    setError(null);
    setResult(null);
    setSelectedADR(null);

    try {
      setPhase(0);
      await new Promise((r) => setTimeout(r, 300));
      setPhase(1);

      const resp = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/specialists/adr`,
        { method: "POST" },
      );

      setPhase(2);
      await new Promise((r) => setTimeout(r, 200));
      setPhase(3);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json() as ADRResult;
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
          <span className="text-sm text-[var(--foreground)]">ADR</span>
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
          <EmptyState workspaceId={workspaceId} message="Connect a repository to generate ADRs." />
        ) : !isReady ? (
          <NotReadyState workspaceId={workspaceId} repoStatus={repoStatus} />
        ) : status === "idle" ? (
          <IdleState onRun={runGenerator} repoName={repoName} />
        ) : status === "loading" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
            <div className="w-full max-w-sm">
              <h2 className="mb-6 text-center text-base font-semibold text-[var(--foreground)]">
                Generating ADRs
              </h2>
              <AnalysisProgress phases={PHASES} currentPhase={phase} />
              <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
                This may take 60–120 seconds. Each ADR is generated in parallel.
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
            <h2 className="font-semibold text-[var(--foreground)]">Generation Failed</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm">{error}</p>
            <button
              onClick={runGenerator}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            >
              Try Again
            </button>
          </div>
        ) : result ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar: ADR list */}
            <div className="w-64 shrink-0 flex flex-col border-r overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  {result.adrs.length} ADRs
                </span>
                <button
                  onClick={runGenerator}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Re-run
                </button>
              </div>
              {/* Index link */}
              <button
                onClick={() => { setActiveTab("index"); setSelectedADR(null); }}
                className={`flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--accent)] ${
                  activeTab === "index" && !selectedADR
                    ? "bg-[var(--accent)] font-medium text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                Index &amp; Overview
              </button>
              {/* ADR list */}
              <div className="flex-1 overflow-y-auto">
                {result.adrs.map((adr) => {
                  const decision = result.decisions.find((d) => d.id === adr.id);
                  return (
                    <button
                      key={adr.id}
                      onClick={() => { setSelectedADR(adr); setActiveTab("adrs"); }}
                      className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-[var(--accent)] ${
                        selectedADR?.id === adr.id
                          ? "bg-[var(--accent)] border-l-2 border-indigo-500"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[var(--muted-foreground)]">{adr.id}</span>
                        {decision && <DomainBadge domain={decision.domain} />}
                        {!adr.success && (
                          <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-500">
                            FAILED
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[var(--foreground)] leading-tight line-clamp-2">
                        {adr.title}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t px-3 py-2 text-[10px] text-[var(--muted-foreground)]">
                Generated {new Date(result.generatedAt).toLocaleTimeString()}
              </div>
            </div>

            {/* Content pane */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-3xl">
                {selectedADR ? (
                  <div>
                    {(() => {
                      const decision = result.decisions.find((d) => d.id === selectedADR.id);
                      return (
                        <div className="mb-4 flex items-center gap-3">
                          <span className="font-mono text-sm text-[var(--muted-foreground)]">
                            {selectedADR.id}
                          </span>
                          {decision && <DomainBadge domain={decision.domain} />}
                        </div>
                      );
                    })()}
                    <SynthesisReport synthesis={selectedADR.content} />
                  </div>
                ) : (
                  <SynthesisReport synthesis={result.index} />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{repoName ?? "No repository"}</span>
        <span>RepoBrain ADR Generator</span>
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
      <div className="rounded-full bg-indigo-500/10 p-5">
        <svg className="h-10 w-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Architecture Decision Records
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-md">
          Automatically reverse-engineer the architectural decisions embedded in
          {repoName ? ` ${repoName}` : " your repository"}{"'"}s code. Each ADR documents Context, Decision, and Consequences.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-left rounded-xl border border-[var(--border)] p-4 w-full max-w-sm">
        {[
          "Framework & library choices",
          "Database & storage strategy",
          "API design patterns",
          "Authentication approach",
          "Deployment & infrastructure",
          "Code organization principles",
        ].map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <button
        onClick={onRun}
        className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        Generate ADRs
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
      <div className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-indigo-500 animate-spin" />
      <h2 className="font-semibold text-[var(--foreground)]">Repository is being indexed</h2>
      <p className="text-sm text-[var(--muted-foreground)]">ADR generation will be available once indexing completes.</p>
      {repoStatus && <p className="text-xs font-mono text-[var(--muted-foreground)]">Status: {repoStatus}</p>}
      <a href={`/workspace/${workspaceId}`} className="text-xs text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]">
        Check indexing progress
      </a>
    </div>
  );
}
