"use client";

import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types (mirroring server types for client use)
// ---------------------------------------------------------------------------

interface CommentUser {
  login: string;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  user: CommentUser;
}

interface Thread {
  id: string;
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolId: string | null;
  title: string;
  status: string;
  createdById: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  resolvedAt: string | Date | null;
  commentCount: number;
  lastCommentAt: string | Date | null;
  createdBy: CommentUser;
}

export interface ThreadWithComments extends Thread {
  comments: Comment[];
}

export interface ThreadPanelProps {
  thread: ThreadWithComments;
  workspaceId: string;
  repoId: string;
  currentUserId: string;
  onClose: () => void;
  onCommentAdded: (thread: ThreadWithComments) => void;
  onStatusChanged: (thread: ThreadWithComments) => void;
  onDeleted: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: string | Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ login, avatarUrl }: { login: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={login}
        className="h-7 w-7 rounded-full border border-white/10 shrink-0"
      />
    );
  }
  const initials = login.slice(0, 2).toUpperCase();
  return (
    <div className="h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThreadPanel
// ---------------------------------------------------------------------------

export function ThreadPanel({
  thread: initialThread,
  workspaceId,
  repoId,
  currentUserId,
  onClose,
  onCommentAdded,
  onStatusChanged,
  onDeleted,
}: ThreadPanelProps) {
  const [thread, setThread] = useState<ThreadWithComments>(initialThread);
  const [commentInput, setCommentInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Sync when initialThread changes (e.g. different thread opened)
  // We intentionally key on .id instead of the full object to avoid resetting
  // local state on every parent re-render.
  useEffect(() => {
    setThread(initialThread);
    setCommentInput("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThread.id]);

  // Scroll to bottom when comments change
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.comments.length]);

  const baseUrl = `/api/workspaces/${workspaceId}/repos/${repoId}/threads/${thread.id}`;

  async function handleAddComment() {
    if (!commentInput.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add comment");
      }
      const data = await res.json();
      const newThread: ThreadWithComments = {
        ...thread,
        comments: [...thread.comments, data.comment],
        commentCount: thread.commentCount + 1,
        lastCommentAt: data.comment.createdAt,
      };
      setThread(newThread);
      setCommentInput("");
      onCommentAdded(newThread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(newStatus: "open" | "resolved") {
    setStatusChanging(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update thread");
      }
      const data = await res.json();
      const newThread: ThreadWithComments = {
        ...thread,
        ...data.thread,
        comments: thread.comments,
      };
      setThread(newThread);
      onStatusChanged(newThread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setStatusChanging(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this thread and all its comments? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(baseUrl, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete thread");
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setDeleting(false);
    }
  }

  const isOpen = thread.status === "open";
  const isCreator = thread.createdById === currentUserId;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                isOpen
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-green-500/20 text-green-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-amber-400" : "bg-green-400"}`} />
              {isOpen ? "Open" : "Resolved"}
            </span>
          </div>
          <h2 className="text-sm font-semibold leading-snug line-clamp-2">{thread.title}</h2>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <span className="font-mono truncate max-w-[160px]" title={thread.filePath}>
              {thread.filePath}
            </span>
            <span>·</span>
            <span>
              L{thread.startLine}
              {thread.endLine !== thread.startLine ? `–${thread.endLine}` : ""}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:text-foreground hover:bg-[var(--accent)] transition-colors"
          aria-label="Close thread panel"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {thread.comments.length === 0 && (
          <p className="text-xs text-[var(--muted-foreground)] text-center py-4">
            No comments yet.
          </p>
        )}
        {thread.comments.map((comment) => (
          <div key={comment.id} className="flex gap-2.5">
            <Avatar login={comment.user.login} avatarUrl={comment.user.avatarUrl} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-semibold">{comment.user.login}</span>
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                {comment.content}
              </p>
            </div>
          </div>
        ))}
        <div ref={commentsEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 mx-4 mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Comment input */}
      <div className="shrink-0 border-t px-4 py-3 space-y-2">
        <textarea
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-xs placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleAddComment();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleAddComment}
            disabled={submitting || !commentInput.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {submitting ? "Posting…" : "Comment"}
          </button>
          <div className="flex items-center gap-1.5">
            {isOpen ? (
              <button
                onClick={() => handleStatusChange("resolved")}
                disabled={statusChanging}
                className="rounded-md border border-green-500/40 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40"
              >
                {statusChanging ? "Resolving…" : "Resolve"}
              </button>
            ) : (
              <button
                onClick={() => handleStatusChange("open")}
                disabled={statusChanging}
                className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              >
                {statusChanging ? "Reopening…" : "Reopen"}
              </button>
            )}
            {isCreator && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
