"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Thread {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  status: string;
  commentCount: number;
  lastCommentAt: string | null;
  createdAt: string;
  createdBy: { login: string; avatarUrl: string | null };
}

export interface ThreadsListProps {
  workspaceId: string;
  repoId: string;
  onThreadClick: (thread: Thread) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// ThreadsListItem
// ---------------------------------------------------------------------------

function ThreadItem({
  thread,
  onClick,
}: {
  thread: Thread;
  onClick: () => void;
}) {
  const isOpen = thread.status === "open";
  const activity = thread.lastCommentAt ?? thread.createdAt;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md px-3 py-2.5 hover:bg-[var(--accent)] transition-colors group"
    >
      <div className="flex items-start gap-2">
        {/* Status dot */}
        <span
          className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
            isOpen ? "bg-amber-400" : "bg-green-400 opacity-60"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-snug truncate group-hover:text-[var(--foreground)]">
            {thread.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
            <span className="font-mono truncate max-w-[140px]" title={thread.filePath}>
              {thread.filePath}
            </span>
            <span>·</span>
            <span>
              L{thread.startLine}
              {thread.endLine !== thread.startLine ? `–${thread.endLine}` : ""}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
            <span>
              {thread.commentCount} {thread.commentCount === 1 ? "comment" : "comments"}
            </span>
            <span>·</span>
            <span>{formatRelative(activity)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ThreadsList
// ---------------------------------------------------------------------------

export function ThreadsList({ workspaceId, repoId, onThreadClick }: ThreadsListProps) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `/api/workspaces/${workspaceId}/repos/${repoId}/threads`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${baseUrl}?status=${tab}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load threads");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setThreads(data.threads ?? []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [tab, baseUrl]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b">
        {(["open", "resolved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-indigo-500 text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-4 text-xs text-red-400 text-center">{error}</div>
        )}

        {!loading && !error && threads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <span className="text-2xl mb-2">{tab === "open" ? "💬" : "✅"}</span>
            <p className="text-xs text-[var(--muted-foreground)]">
              {tab === "open"
                ? "No open discussions. Start one by hovering over a line in the code viewer."
                : "No resolved discussions yet."}
            </p>
          </div>
        )}

        {!loading && !error && threads.length > 0 && (
          <div className="space-y-0.5 px-1">
            {threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                onClick={() => onThreadClick(thread)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
