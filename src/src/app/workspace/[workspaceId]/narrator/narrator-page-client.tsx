"use client";

import { useCallback } from "react";
import { NarratorView } from "@/src/components/narrator/narrator-view";

interface NarratorPageClientProps {
  workspaceId: string;
  workspaceName: string;
  repoId: string | null;
  repoName: string | null;
  repoStatus: string | null;
}

export function NarratorPageClient({
  workspaceId,
  workspaceName,
  repoId,
  repoName,
  repoStatus,
}: NarratorPageClientProps) {
  const handleFileOpen = useCallback((filePath: string, line: number) => {
    // Open the workspace main page with the file pre-selected
    // We navigate to the main workspace page with a file query param
    const url = `/workspace/${workspaceId}?openFile=${encodeURIComponent(filePath)}&line=${line}`;
    window.open(url, "_blank");
  }, [workspaceId]);

  const isReady = repoStatus === "ready";

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href="/dashboard"
            className="shrink-0 font-semibold text-sm hover:opacity-70 transition-opacity"
          >
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
          <span className="text-sm text-[var(--foreground)]">Narrator</span>
        </div>
        <div className="flex items-center gap-3">
          {repoName && (
            <span className="text-xs text-[var(--muted-foreground)] font-mono">
              {repoName}
            </span>
          )}
          {repoStatus && !isReady && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              {repoStatus}
            </span>
          )}
          <a
            href={`/workspace/${workspaceId}`}
            className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--accent)]"
          >
            Back to workspace
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        {!repoId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-full bg-[var(--muted)] p-5">
              <svg
                className="h-10 w-10 text-[var(--muted-foreground)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">
                No repository connected
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Connect and index a repository to start narrating code flows.
              </p>
            </div>
            <a
              href={`/workspace/${workspaceId}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Go to workspace
            </a>
          </div>
        ) : !isReady ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-blue-500 animate-spin" />
            <div>
              <h2 className="font-semibold text-[var(--foreground)]">
                Repository is being indexed
              </h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Narrator will be available once indexing completes.
              </p>
            </div>
            <a
              href={`/workspace/${workspaceId}`}
              className="text-xs text-[var(--muted-foreground)] underline hover:text-[var(--foreground)] transition-colors"
            >
              Check indexing progress
            </a>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden max-w-4xl mx-auto w-full">
            <NarratorView
              workspaceId={workspaceId}
              repoId={repoId}
              onFileOpen={handleFileOpen}
            />
          </div>
        )}
      </main>

      {/* Bottom status bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-[var(--muted-foreground)]">
        <span>{repoName ?? "No repository"}</span>
        <span>RepoBrain Narrator</span>
      </footer>

    </div>
  );
}
