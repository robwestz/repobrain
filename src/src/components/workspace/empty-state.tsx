"use client";

import { GitBranch } from "lucide-react";

interface EmptyStateProps {
  onConnectRepo: () => void;
}

/**
 * Shown when a workspace has no connected repository.
 * Prompts the user to connect a GitHub repo.
 */
export function EmptyState({ onConnectRepo }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--muted)]">
        <GitBranch className="h-8 w-8 text-[var(--muted-foreground)]" />
      </div>

      <div className="max-w-sm">
        <h2 className="text-lg font-semibold">Connect a repository</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Connect a GitHub repository to start indexing your codebase and asking questions about it.
        </p>
      </div>

      <button
        onClick={onConnectRepo}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
      >
        <GitBranch className="h-4 w-4" />
        Connect GitHub repository
      </button>
    </div>
  );
}
