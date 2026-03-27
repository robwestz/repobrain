"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bookmark {
  id: string;
  userId: string;
  repoConnectionId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  note: string | null;
  aiContext: string | null;
  color: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface BookmarkButtonProps {
  workspaceId: string;
  repoId: string;
  fileId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  existingBookmark?: Bookmark;
  onBookmarkCreated: (bookmark: Bookmark) => void;
  onBookmarkRemoved: (bookmarkId: string) => void;
}

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "green", label: "Green", hex: "#22c55e" },
  { value: "yellow", label: "Yellow", hex: "#eab308" },
  { value: "red", label: "Red", hex: "#ef4444" },
  { value: "purple", label: "Purple", hex: "#a855f7" },
] as const;

function colorHex(color: string | null): string {
  return COLOR_OPTIONS.find((c) => c.value === color)?.hex ?? "#3b82f6";
}

// ---------------------------------------------------------------------------
// BookmarkButton
// ---------------------------------------------------------------------------

export function BookmarkButton({
  workspaceId,
  repoId,
  fileId,
  filePath,
  startLine,
  endLine,
  existingBookmark,
  onBookmarkCreated,
  onBookmarkRemoved,
}: BookmarkButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");

  const isBookmarked = !!existingBookmark;

  async function handleClick() {
    if (isBookmarked) {
      // Remove bookmark immediately
      setLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/repos/${repoId}/bookmarks/${existingBookmark.id}`,
          { method: "DELETE" },
        );
        if (res.ok) {
          onBookmarkRemoved(existingBookmark.id);
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Show popup to optionally add note/color
      setNote("");
      setSelectedColor("blue");
      setShowPopup(true);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setShowPopup(false);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/repos/${repoId}/bookmarks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId,
            filePath,
            startLine,
            endLine,
            note: note.trim() || null,
            color: selectedColor,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        onBookmarkCreated(data.bookmark);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={loading}
        title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
        className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
        aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
      >
        {isBookmarked ? (
          /* Filled bookmark icon */
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={colorHex(existingBookmark.color)}
            stroke={colorHex(existingBookmark.color)}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        ) : (
          /* Outline bookmark icon */
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--muted-foreground)]"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        )}
      </button>

      {/* Popup for note + color before saving */}
      {showPopup && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopup(false)}
          />
          <div className="absolute right-0 top-8 z-50 w-64 rounded-lg border bg-[var(--background)] p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-[var(--foreground)]">
              Add Bookmark
            </p>

            {/* Note input */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              rows={2}
              className="mb-2 w-full resize-none rounded border bg-transparent px-2 py-1 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
            />

            {/* Color picker */}
            <div className="mb-3 flex gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setSelectedColor(c.value)}
                  title={c.label}
                  className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.hex,
                    outline:
                      selectedColor === c.value
                        ? `2px solid ${c.hex}`
                        : "2px solid transparent",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPopup(false)}
                className="rounded px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
