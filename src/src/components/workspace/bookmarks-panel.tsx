"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bookmark } from "@/src/components/code-viewer/bookmark-button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookmarksPanelProps {
  workspaceId: string;
  repoId: string;
  onBookmarkClick: (bookmark: Bookmark) => void;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  purple: "#a855f7",
};

function dotColor(color: string | null): string {
  return COLOR_HEX[color ?? "blue"] ?? "#3b82f6";
}

// ---------------------------------------------------------------------------
// Grouping helper
// ---------------------------------------------------------------------------

function groupByFile(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
  const map = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    const group = map.get(b.filePath) ?? [];
    group.push(b);
    map.set(b.filePath, group);
  }
  return map;
}

// ---------------------------------------------------------------------------
// BookmarksPanel
// ---------------------------------------------------------------------------

export function BookmarksPanel({
  workspaceId,
  repoId,
  onBookmarkClick,
}: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editTitle, setEditTitle] = useState("");

  // ---------------------------------------------------------------------------
  // Fetch bookmarks
  // ---------------------------------------------------------------------------

  const fetchBookmarks = useCallback(async () => {
    if (!repoId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/bookmarks`,
      );
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data.bookmarks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, repoId]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/repos/${repoId}/bookmarks/${id}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    }
  }

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  function startEdit(bookmark: Bookmark) {
    setEditingId(bookmark.id);
    setEditTitle(bookmark.title);
    setEditNote(bookmark.note ?? "");
  }

  async function saveEdit(id: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/repos/${repoId}/bookmarks/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || undefined,
          note: editNote.trim() || null,
        }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      setBookmarks((prev) =>
        prev.map((b) => (b.id === id ? data.bookmark : b)),
      );
    }
    setEditingId(null);
  }

  // ---------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------

  const filtered = bookmarks.filter((b) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.filePath.toLowerCase().includes(q) ||
      (b.note ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = groupByFile(filtered);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Bookmarks
        </span>
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {bookmarks.length}
        </span>
      </div>

      {/* Search bar */}
      <div className="shrink-0 border-b px-3 py-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter bookmarks…"
          className="w-full rounded border bg-transparent px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
        />
      </div>

      {/* Bookmark list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-[var(--muted-foreground)]">
              Loading…
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[var(--muted-foreground)] opacity-40"
            >
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </svg>
            <p className="text-xs text-[var(--muted-foreground)]">
              {filter ? "No bookmarks match your filter" : "No bookmarks yet"}
            </p>
            {!filter && (
              <p className="text-xs text-[var(--muted-foreground)] opacity-60">
                Click the bookmark icon in the code viewer to save a location
              </p>
            )}
          </div>
        ) : (
          <div className="py-1">
            {Array.from(grouped.entries()).map(([filePath, fileBookmarks]) => (
              <div key={filePath}>
                {/* File group header */}
                <div className="sticky top-0 bg-[var(--background)] px-3 py-1.5">
                  <span
                    className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] opacity-60"
                    title={filePath}
                  >
                    {filePath.split("/").pop() ?? filePath}
                  </span>
                </div>

                {/* Bookmarks in this file */}
                {fileBookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    onMouseEnter={() => setHoveredId(bookmark.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="group relative px-3 py-2 hover:bg-[var(--accent)]"
                  >
                    {editingId === bookmark.id ? (
                      /* Edit mode */
                      <div className="flex flex-col gap-1.5">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded border bg-transparent px-2 py-0.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                          placeholder="Title"
                          autoFocus
                        />
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full resize-none rounded border bg-transparent px-2 py-0.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                          placeholder="Note…"
                          rows={2}
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(bookmark.id)}
                            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <>
                        <div className="flex items-start gap-2">
                          {/* Color dot */}
                          <span
                            className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: dotColor(bookmark.color),
                            }}
                          />
                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => onBookmarkClick(bookmark)}
                              className="block w-full text-left"
                            >
                              <span className="block truncate text-xs font-medium text-[var(--foreground)]">
                                {bookmark.title}
                              </span>
                              <span className="block text-[10px] text-[var(--muted-foreground)]">
                                {filePath}:{bookmark.startLine}–
                                {bookmark.endLine}
                              </span>
                            </button>

                            {/* Note preview */}
                            {bookmark.note && (
                              <p className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
                                {bookmark.note}
                              </p>
                            )}

                            {/* AI context on hover */}
                            {hoveredId === bookmark.id &&
                              bookmark.aiContext && (
                                <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted-foreground)] opacity-80">
                                  {bookmark.aiContext}
                                </p>
                              )}
                          </div>

                          {/* Action buttons (visible on hover) */}
                          {hoveredId === bookmark.id && (
                            <div className="flex shrink-0 gap-0.5">
                              {/* Edit button */}
                              <button
                                onClick={() => startEdit(bookmark)}
                                title="Edit bookmark"
                                className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                </svg>
                              </button>
                              {/* Delete button */}
                              <button
                                onClick={() => handleDelete(bookmark.id)}
                                title="Delete bookmark"
                                className="flex h-5 w-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-red-500"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
