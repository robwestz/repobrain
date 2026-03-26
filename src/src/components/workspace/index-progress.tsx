"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, GitFork } from "lucide-react";

interface IndexProgressProps {
  workspaceId: string;
  repoId: string;
  repoName: string;
  initialStatus: string;
  onReady?: () => void;
}

interface StatusResponse {
  repoStatus: string;
  errorMessage: string | null;
  job: {
    id: string;
    status: string;
    progress: {
      phase?: string;
      files_total?: number;
      files_processed?: number;
      symbols_found?: number;
      chunks_created?: number;
      embeddings_generated?: number;
    };
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  cloning: "Cloning repository…",
  indexing: "Indexing files…",
  ready: "Ready",
  failed: "Failed",
};

/**
 * Polls the index-status endpoint and renders a progress indicator.
 * Calls onReady() when the repo reaches "ready" status.
 */
export function IndexProgress({
  workspaceId,
  repoId,
  repoName,
  initialStatus,
  onReady,
}: IndexProgressProps) {
  const [status, setStatus] = useState<StatusResponse>({
    repoStatus: initialStatus,
    errorMessage: null,
    job: null,
  });
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    // Stop polling once we reach a terminal state
    if (status.repoStatus === "ready" || status.repoStatus === "failed") {
      if (status.repoStatus === "ready") {
        onReady?.();
      }
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/index-status`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data: StatusResponse = await res.json();
          setStatus(data);
          setPollCount((c) => c + 1);
        }
      } catch {
        // Silently ignore transient network errors during polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.repoStatus, workspaceId, repoId, onReady, pollCount]);

  const progress = status.job?.progress;
  const filesTotal = progress?.files_total ?? 0;
  const filesProcessed = progress?.files_processed ?? 0;
  const progressPct =
    filesTotal > 0 ? Math.round((filesProcessed / filesTotal) * 100) : 0;

  const isFailed = status.repoStatus === "failed";
  const isReady = status.repoStatus === "ready";
  const isActive = !isFailed && !isReady;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-md rounded-xl border bg-[var(--card)] p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)]">
            <GitFork className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{repoName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isActive && (
                <Loader2 className="h-3 w-3 animate-spin text-[var(--muted-foreground)]" />
              )}
              {isReady && (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              )}
              {isFailed && (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span className="text-xs text-[var(--muted-foreground)]">
                {STATUS_LABELS[status.repoStatus] ?? status.repoStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {isActive && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)] transition-all duration-500"
                style={{
                  width:
                    status.repoStatus === "cloning"
                      ? "20%"
                      : filesTotal > 0
                        ? `${progressPct}%`
                        : "40%",
                }}
              />
            </div>
          </div>
        )}

        {/* Progress stats */}
        {status.repoStatus === "indexing" && filesTotal > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <StatItem label="Files" value={`${filesProcessed} / ${filesTotal}`} />
            <StatItem label="Symbols" value={String(progress?.symbols_found ?? 0)} />
            <StatItem label="Chunks" value={String(progress?.chunks_created ?? 0)} />
          </div>
        )}

        {/* Info message */}
        {isActive && (
          <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
            {status.repoStatus === "cloning"
              ? "Cloning repository from GitHub…"
              : "Parsing files and building the knowledge index. You can ask questions once indexing is complete."}
          </p>
        )}

        {/* Error message */}
        {isFailed && status.errorMessage && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 dark:bg-red-950/20">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Indexing failed
            </p>
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              {status.errorMessage}
            </p>
          </div>
        )}

        {/* Success */}
        {isReady && (
          <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
            Repository indexed successfully. You can now ask questions about your codebase.
          </p>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{value}</p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}
