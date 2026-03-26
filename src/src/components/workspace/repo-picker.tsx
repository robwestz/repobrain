"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Search, GitFork, Lock, Globe, Loader2 } from "lucide-react";
import type { GitHubRepo } from "@/src/modules/github/repos";

interface RepoPickerProps {
  workspaceId: string;
  onClose: () => void;
  onConnected: (repoConnection: { id: string; owner: string; name: string; status: string }) => void;
}

/**
 * Dialog for selecting and connecting a GitHub repository to the workspace.
 * Fetches user's repos from /api/github/repos, then POSTs to /api/workspaces/{id}/repos.
 */
export function RepoPicker({ workspaceId, onClose, onConnected }: RepoPickerProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filtered, setFiltered] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null); // GitHub repo ID being connected

  // Fetch the user's GitHub repos on mount
  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch("/api/github/repos", { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to fetch repositories");
        }
        const data: GitHubRepo[] = await res.json();
        setRepos(data);
        setFiltered(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch repositories");
      } finally {
        setLoading(false);
      }
    }

    fetchRepos();
  }, []);

  // Filter repos by search term
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(repos);
    } else {
      const term = search.toLowerCase();
      setFiltered(
        repos.filter(
          (r) =>
            r.name.toLowerCase().includes(term) ||
            r.full_name.toLowerCase().includes(term) ||
            r.description?.toLowerCase().includes(term),
        ),
      );
    }
  }, [search, repos]);

  const handleConnect = useCallback(
    async (repo: GitHubRepo) => {
      setConnecting(repo.id);
      setError(null);

      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/repos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to connect repository");
        }

        onConnected(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect repository");
        setConnecting(null);
      }
    },
    [workspaceId, onConnected],
  );

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="repo-picker-title"
        className="fixed inset-x-4 top-[10vh] z-50 mx-auto max-w-xl overflow-hidden rounded-xl border bg-[var(--background)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="repo-picker-title" className="text-sm font-semibold">
            Connect a repository
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border bg-[var(--muted)] px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search repositories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"
              autoFocus
            />
          </div>
        </div>

        {/* Repo list */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading repositories…
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                {search ? "No repositories match your search." : "No repositories found."}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((repo) => (
                <li key={repo.id}>
                  <button
                    onClick={() => handleConnect(repo)}
                    disabled={connecting !== null}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--accent)] disabled:pointer-events-none disabled:opacity-60"
                  >
                    {/* Repo icon */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--muted)]">
                      {repo.private ? (
                        <Lock className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      )}
                    </div>

                    {/* Repo info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{repo.full_name}</p>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                          {repo.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3">
                        {repo.language && (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {repo.language}
                          </span>
                        )}
                        <span className="text-xs text-[var(--muted-foreground)]">
                          Updated {new Date(repo.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Connect indicator */}
                    <div className="shrink-0">
                      {connecting === repo.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
                      ) : (
                        <span className="rounded-md border px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)] group-hover:border-[var(--primary)]">
                          Connect
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer note */}
        <div className="border-t px-4 py-2.5">
          <p className="text-xs text-[var(--muted-foreground)]">
            Showing repositories you have access to. Private repos require the{" "}
            <code className="rounded bg-[var(--muted)] px-1">repo</code> OAuth scope.
          </p>
        </div>
      </div>
    </>
  );
}
