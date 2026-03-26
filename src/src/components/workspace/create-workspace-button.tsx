"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Button that opens an inline modal for creating a new workspace.
 * On success, navigates to the new workspace page.
 */
export function CreateWorkspaceButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setName("");
      setError(null);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create workspace");
      }

      // Navigate to the new workspace
      router.push(`/workspace/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        New workspace
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-ws-title"
            className="fixed inset-x-4 top-[20vh] z-50 mx-auto max-w-sm overflow-hidden rounded-xl border bg-[var(--background)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 id="create-ws-title" className="text-sm font-semibold">
                Create workspace
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <label
                htmlFor="workspace-name"
                className="mb-1.5 block text-xs font-medium"
              >
                Workspace name
              </label>
              <input
                id="workspace-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Project"
                maxLength={255}
                required
                className="w-full rounded-lg border bg-[var(--background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)] placeholder:text-[var(--muted-foreground)]"
              />

              {error && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create workspace"
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
