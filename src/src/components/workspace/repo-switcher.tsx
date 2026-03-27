"use client";

import { useState } from "react";

export interface RepoConnection {
  id: string;
  owner: string;
  name: string;
  status: string;
}

interface RepoSwitcherProps {
  repos: RepoConnection[];
  activeRepoId: string | null;
  onSwitch: (repoId: string) => void;
  onAddRepo?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  ready: "bg-green-500",
  indexing: "bg-yellow-400 animate-pulse",
  cloning: "bg-blue-400 animate-pulse",
  pending: "bg-gray-400",
  failed: "bg-red-500",
};

export function RepoSwitcher({ repos, activeRepoId, onSwitch, onAddRepo }: RepoSwitcherProps) {
  const [open, setOpen] = useState(false);

  const activeRepo = repos.find((r) => r.id === activeRepoId);

  if (repos.length === 0) return null;

  // Single repo — just show name, no dropdown needed
  if (repos.length === 1) {
    const repo = repos[0];
    return (
      <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[repo.status] ?? "bg-gray-400"}`}
        />
        <span className="truncate max-w-[160px]">
          {repo.owner}/{repo.name}
        </span>
        {onAddRepo && (
          <button
            onClick={onAddRepo}
            title="Connect another repository"
            className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors text-xs"
          >
            +
          </button>
        )}
      </div>
    );
  }

  // Multiple repos — show dropdown
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
      >
        {activeRepo && (
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[activeRepo.status] ?? "bg-gray-400"}`}
          />
        )}
        <span className="truncate max-w-[140px]">
          {activeRepo ? `${activeRepo.owner}/${activeRepo.name}` : `${repos.length} repos`}
        </span>
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border bg-[var(--background)] shadow-lg">
            <div className="p-1">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => {
                    onSwitch(repo.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent)] ${
                    repo.id === activeRepoId ? "bg-[var(--accent)] font-medium" : ""
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[repo.status] ?? "bg-gray-400"}`}
                  />
                  <span className="truncate">
                    {repo.owner}/{repo.name}
                  </span>
                  {repo.id === activeRepoId && (
                    <svg
                      className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {onAddRepo && (
              <>
                <div className="border-t" />
                <div className="p-1">
                  <button
                    onClick={() => {
                      onAddRepo();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs">
                      +
                    </span>
                    Connect another repo
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
