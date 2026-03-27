"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewThreadDialogProps {
  workspaceId: string;
  repoId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  onClose: () => void;
  onCreated: (thread: unknown) => void;
}

// ---------------------------------------------------------------------------
// NewThreadDialog
// ---------------------------------------------------------------------------

export function NewThreadDialog({
  workspaceId,
  repoId,
  filePath,
  startLine,
  endLine,
  onClose,
  onCreated,
}: NewThreadDialogProps) {
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !comment.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath,
            startLine,
            endLine,
            title: title.trim(),
            comment: comment.trim(),
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create discussion");
      }

      const data = await res.json();
      onCreated(data.thread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal
        aria-labelledby="new-thread-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-[var(--background)] shadow-2xl"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-start justify-between border-b px-5 py-4">
            <div>
              <h2 id="new-thread-title" className="text-sm font-semibold">
                Start a discussion
              </h2>
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)] font-mono">
                {filePath} · L{startLine}
                {endLine !== startLine ? `–${endLine}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--muted-foreground)] hover:text-foreground hover:bg-[var(--accent)] transition-colors"
              aria-label="Close dialog"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label
                htmlFor="thread-title"
                className="block text-xs font-medium mb-1"
              >
                Title <span className="text-red-400">*</span>
              </label>
              <input
                ref={titleRef}
                id="thread-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Should we add rate limiting here?"
                maxLength={300}
                required
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Initial comment */}
            <div>
              <label
                htmlFor="thread-comment"
                className="block text-xs font-medium mb-1"
              >
                Comment <span className="text-red-400">*</span>
              </label>
              <textarea
                id="thread-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe the issue or question…"
                rows={4}
                required
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !comment.trim()}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {submitting ? "Creating…" : "Start discussion"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
